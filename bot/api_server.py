"""Minimal aiohttp HTTP API server for ERP→Bot message relay.

This module runs a small HTTP server alongside the aiogram dispatcher.
It ONLY adds a /relay endpoint — it does NOT modify existing bot handlers.
"""
from __future__ import annotations

import base64
import html
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
        agent_username: Optional[str] = data.get("agent_username")
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

    # Auto-assign + activate if this is the first ERP reply on an OPEN session
    if session["status"] == "OPEN" and agent_username:
        await pool.execute(
            """UPDATE support_sessions
               SET status = 'ACTIVE',
                   assigned_to_username = $2,
                   accepted_at = NOW()
               WHERE id = $1 AND status = 'OPEN'""",
            session_id,
            agent_username,
        )
        logger.info(
            "Session auto-activated session=%s agent=%s", session_id, agent_username
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


async def notify_close(request: web.Request) -> web.Response:
    """POST /notify_close — notify the Telegram user that their session was closed by ERP."""
    auth = request.headers.get("Authorization", "")
    if auth != f"Bearer {RELAY_AUTH_TOKEN}":
        return web.json_response({"error": "Unauthorized"}, status=401)

    try:
        data = await request.json()
        session_id = int(data["session_id"])
    except (KeyError, ValueError, json.JSONDecodeError) as e:
        return web.json_response({"error": f"Invalid payload: {e}"}, status=400)

    pool: asyncpg.Pool = request.app["pool"]
    bot: Bot = request.app["bot"]

    row = await pool.fetchrow(
        """SELECT u.telegram_id
           FROM support_sessions ss
           JOIN users u ON u.id = ss.user_id
           WHERE ss.id = $1""",
        session_id,
    )
    if not row:
        return web.json_response({"ok": False, "error": "Session not found"}, status=404)

    try:
        await bot.send_message(
            int(row["telegram_id"]),
            "🔚 客服会话已结束\n\n如需再次咨询，请点击「📞 联系客服」。",
        )
        logger.info("notify_close sent session=%s", session_id)
    except Exception as exc:
        logger.warning("notify_close failed session=%s: %s", session_id, exc)

    return web.json_response({"ok": True})


async def notify_deposit(request: web.Request) -> web.Response:
    """POST /notify/deposit — DM the customer when ERP approves or rejects a deposit."""
    auth = request.headers.get("Authorization", "")
    if auth != f"Bearer {RELAY_AUTH_TOKEN}":
        return web.json_response({"error": "Unauthorized"}, status=401)

    try:
        data = await request.json()
        request_id = int(data["request_id"])
        status: str = data["status"]          # "APPROVED" or "REJECTED"
        reason: str = data.get("reason") or ""
    except (KeyError, ValueError, json.JSONDecodeError) as e:
        return web.json_response({"error": f"Invalid payload: {e}"}, status=400)

    pool: asyncpg.Pool = request.app["pool"]
    bot: Bot = request.app["bot"]

    row = await pool.fetchrow(
        """SELECT dr.deposit_amount, dr.bonus_amount, dr.credit_amount,
                  dr.provider, dr.game_username,
                  u.telegram_id
           FROM deposit_requests dr
           JOIN users u ON u.id = dr.user_id
           WHERE dr.id = $1""",
        request_id,
    )
    if not row:
        return web.json_response({"ok": False, "error": "Request not found"}, status=404)

    telegram_id = int(row["telegram_id"])
    deposit_amount = float(row["deposit_amount"])
    bonus_amount = float(row["bonus_amount"])
    credit_amount = float(row["credit_amount"])
    provider = html.escape(str(row["provider"]))
    game_username = html.escape(str(row["game_username"]))

    if status == "APPROVED":
        bonus_line = f"🎁 Bonus：\nRM {bonus_amount:,.2f}\n\n" if bonus_amount > 0 else ""
        text = (
            f"✅ 充值申请已批准\n\n"
            f"申请编号：\n#{request_id}\n\n"
            f"🎮 平台：\n{provider}\n\n"
            f"🆔 游戏账号：\n{game_username}\n\n"
            f"💵 充值：\nRM {deposit_amount:,.2f}\n\n"
            f"{bonus_line}"
            f"🪙 实际上分：\nRM {credit_amount:,.2f}\n\n"
            f"请查看游戏平台余额。"
        )
    else:
        reason_line = f"{html.escape(reason)}\n\n" if reason else ""
        text = (
            f"❌ 充值申请已拒绝\n\n"
            f"申请编号：\n#{request_id}\n\n"
            f"原因：\n{reason_line}"
            f"如有疑问请联系客服。"
        )

    try:
        await bot.send_message(telegram_id, text, parse_mode="HTML")
        logger.info("notify_deposit sent request=%s status=%s", request_id, status)
    except Exception as exc:
        logger.warning("notify_deposit failed request=%s: %s", request_id, exc)

    return web.json_response({"ok": True})


async def notify_withdrawal(request: web.Request) -> web.Response:
    """POST /notify/withdrawal — DM the customer when ERP approves or rejects a withdrawal."""
    auth = request.headers.get("Authorization", "")
    if auth != f"Bearer {RELAY_AUTH_TOKEN}":
        return web.json_response({"error": "Unauthorized"}, status=401)

    try:
        data = await request.json()
        request_id = int(data["request_id"])
        status: str = data["status"]          # "PAID" or "REJECTED"
        reason: str = data.get("reason") or ""
    except (KeyError, ValueError, json.JSONDecodeError) as e:
        return web.json_response({"error": f"Invalid payload: {e}"}, status=400)

    pool: asyncpg.Pool = request.app["pool"]
    bot: Bot = request.app["bot"]

    row = await pool.fetchrow(
        """SELECT wr.withdraw_amount, wr.provider, wr.game_username, wr.bank_name,
                  u.telegram_id
           FROM withdrawal_requests wr
           JOIN users u ON u.id = wr.user_id
           WHERE wr.id = $1""",
        request_id,
    )
    if not row:
        return web.json_response({"ok": False, "error": "Request not found"}, status=404)

    telegram_id = int(row["telegram_id"])
    withdraw_amount = float(row["withdraw_amount"])
    provider = html.escape(str(row["provider"]))
    game_username = html.escape(str(row["game_username"]))
    bank_name = html.escape(str(row["bank_name"]))

    if status == "PAID":
        text = (
            f"✅ 提款申请已完成\n\n"
            f"申请编号：\n#{request_id}\n\n"
            f"🎮 平台：\n{provider}\n\n"
            f"🆔 游戏账号：\n{game_username}\n\n"
            f"💵 提款金额：\nRM {withdraw_amount:,.2f}\n\n"
            f"🏦 收款银行：\n{bank_name}\n\n"
            f"款项已转入您的银行账号。"
        )
    else:
        reason_line = f"{html.escape(reason)}\n\n" if reason else ""
        text = (
            f"❌ 提款申请已拒绝\n\n"
            f"申请编号：\n#{request_id}\n\n"
            f"原因：\n{reason_line}"
            f"如有疑问请联系客服。"
        )

    try:
        await bot.send_message(telegram_id, text, parse_mode="HTML")
        logger.info("notify_withdrawal sent request=%s status=%s", request_id, status)
    except Exception as exc:
        logger.warning("notify_withdrawal failed request=%s: %s", request_id, exc)

    return web.json_response({"ok": True})


async def start_relay_server(bot: Bot, pool: asyncpg.Pool) -> web.AppRunner:
    """Start the relay HTTP server and return the runner (for cleanup)."""
    app = web.Application()
    app["bot"] = bot
    app["pool"] = pool
    app.router.add_post("/relay", relay_message)
    app.router.add_post("/notify_close", notify_close)
    app.router.add_post("/notify/deposit", notify_deposit)
    app.router.add_post("/notify/withdrawal", notify_withdrawal)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", RELAY_PORT)
    await site.start()
    logger.info("Bot relay server started on port %d", RELAY_PORT)
    return runner
