"""Minimal aiohttp HTTP API server for ERP→Bot message relay.

This module runs a small HTTP server alongside the aiogram dispatcher.
It ONLY adds a /relay endpoint — it does NOT modify existing bot handlers.
"""
from __future__ import annotations

import base64
import io
import json
import logging
import os
from typing import Optional

import asyncpg
from aiohttp import web
from aiogram import Bot
from aiogram.types import BufferedInputFile

logger = logging.getLogger(__name__)

RELAY_AUTH_TOKEN: str = os.environ.get("BOT_RELAY_AUTH_TOKEN", "change_me_relay_token")
RELAY_PORT: int = int(os.environ.get("BOT_RELAY_PORT", "8090"))
MAX_FILE_BYTES: int = 20 * 1024 * 1024  # 20 MB


def _decode_data_uri(data_uri: str) -> tuple[bytes, str]:
    """Decode a base64 data URI. Returns (bytes, mime_type)."""
    header, encoded = data_uri.split(",", 1)
    mime = header.split(":")[1].split(";")[0]
    return base64.b64decode(encoded), mime


def _ext_from_mime(mime: str) -> str:
    mapping = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/gif": "gif",
        "image/webp": "webp",
        "application/pdf": "pdf",
        "application/zip": "zip",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
        "video/mp4": "mp4",
    }
    return mapping.get(mime, "bin")


async def relay_message(request: web.Request) -> web.Response:
    """POST /relay — relay ERP agent message to Telegram user."""
    # ── Authentication ───────────────────────────────────────────────────────
    auth = request.headers.get("Authorization", "")
    if auth != f"Bearer {RELAY_AUTH_TOKEN}":
        return web.json_response({"error": "Unauthorized"}, status=401)

    # ── Parse body ───────────────────────────────────────────────────────────
    try:
        data = await request.json()
        session_id = int(data["session_id"])
        message_type: str = data.get("message_type", "TEXT").upper()
        content: Optional[str] = data.get("content")
        if not content and message_type == "TEXT":
            return web.json_response({"error": "content required for TEXT"}, status=400)
    except (KeyError, ValueError, json.JSONDecodeError) as e:
        return web.json_response({"error": f"Invalid payload: {e}"}, status=400)

    bot: Bot = request.app["bot"]
    pool: asyncpg.Pool = request.app["pool"]

    # ── Fetch session ─────────────────────────────────────────────────────────
    session = await pool.fetchrow(
        """SELECT ss.id, ss.status, u.telegram_id
           FROM support_sessions ss
           JOIN users u ON u.id = ss.user_id
           WHERE ss.id = $1""",
        session_id,
    )
    if not session:
        return web.json_response({"error": "Session not found"}, status=404)
    if session["status"] not in ("OPEN", "ACTIVE"):
        return web.json_response({"error": "Session not open/active"}, status=400)

    telegram_id = int(session["telegram_id"])

    # ── Send to Telegram ──────────────────────────────────────────────────────
    tg_msg_id: Optional[int] = None
    stored_type = message_type

    try:
        if message_type == "TEXT":
            msg = await bot.send_message(telegram_id, content)
            tg_msg_id = msg.message_id

        elif message_type == "PHOTO":
            file_bytes, mime = _decode_data_uri(content)
            if len(file_bytes) > MAX_FILE_BYTES:
                return web.json_response({"error": "File too large"}, status=413)
            filename = f"image.{_ext_from_mime(mime)}"
            msg = await bot.send_photo(
                telegram_id,
                photo=BufferedInputFile(file_bytes, filename=filename),
            )
            tg_msg_id = msg.message_id

        elif message_type in ("DOCUMENT", "VIDEO"):
            file_bytes, mime = _decode_data_uri(content)
            if len(file_bytes) > MAX_FILE_BYTES:
                return web.json_response({"error": "File too large"}, status=413)
            filename = f"file.{_ext_from_mime(mime)}"
            msg = await bot.send_document(
                telegram_id,
                document=BufferedInputFile(file_bytes, filename=filename),
            )
            tg_msg_id = msg.message_id
            stored_type = "DOCUMENT"

        else:
            return web.json_response({"error": f"Unsupported type: {message_type}"}, status=400)

    except Exception as exc:
        logger.error("Telegram send failed session=%s: %s", session_id, exc)
        return web.json_response({"error": str(exc)}, status=502)

    # ── Store in support_messages ──────────────────────────────────────────────
    # For PHOTO/DOCUMENT, store the Telegram file_id as content so ERP can proxy it
    stored_content = content if message_type == "TEXT" else None
    if tg_msg_id and message_type != "TEXT":
        # Try to get the file_id for media proxy support
        try:
            if message_type == "PHOTO":
                stored_content = msg.photo[-1].file_id
            elif message_type in ("DOCUMENT", "VIDEO"):
                stored_content = msg.document.file_id if msg.document else None
        except Exception:
            pass

    row = await pool.fetchrow(
        """INSERT INTO support_messages
               (session_id, sender_type, message_type, content, user_msg_id)
           VALUES ($1, 'AGENT', $2, $3, $4)
           RETURNING id, created_at""",
        session_id,
        stored_type,
        stored_content,
        tg_msg_id,
    )
    await pool.execute(
        "UPDATE support_sessions SET last_message_at = NOW() WHERE id = $1",
        session_id,
    )

    return web.json_response(
        {
            "ok": True,
            "message_id": row["id"],
            "created_at": row["created_at"].isoformat(),
            "message_type": stored_type,
            "content": stored_content,
        }
    )


async def start_relay_server(bot: Bot, pool: asyncpg.Pool) -> web.AppRunner:
    """Start the relay HTTP server and return the runner (for cleanup)."""
    app = web.Application()
    app["bot"] = bot
    app["pool"] = pool
    app.router.add_post("/relay", relay_message)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", RELAY_PORT)
    await site.start()
    logger.info("Bot relay server started on port %d", RELAY_PORT)
    return runner
