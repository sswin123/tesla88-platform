from __future__ import annotations

import html
import logging
from typing import Any, Dict, Union

from aiogram import Bot, F, Router
from aiogram.filters import BaseFilter
from aiogram.types import CallbackQuery, Message

import asyncpg

from bot.config import Config
from bot.keyboards.livechat import build_livechat_end_keyboard
from db.repositories.livechat_repo import (
    accept_session,
    get_session_by_group_msg_id,
    get_session_with_user,
    store_message,
    update_last_message_at,
)

logger = logging.getLogger(__name__)
router = Router()


# ── Filter: message is an agent reply to a bot message in the Support Group ───


class IsAgentReply(BaseFilter):
    async def __call__(
        self, message: Message, config: Config
    ) -> Union[bool, Dict[str, Any]]:
        if not config.support_chat_id:
            return False
        if message.chat.id != config.support_chat_id:
            return False
        if message.from_user is None or message.from_user.is_bot:
            return False
        if not message.reply_to_message:
            return False
        rt = message.reply_to_message
        if rt.from_user is None or not rt.from_user.is_bot:
            return False
        return True


@router.callback_query(F.data.startswith("lc_accept:"))
async def cb_lc_accept(
    callback: CallbackQuery,
    pool: asyncpg.Pool,
    bot: Bot,
    config: Config,
) -> None:
    session_id = int(callback.data.split(":", 1)[1])
    agent = callback.from_user
    agent_username = agent.username or agent.first_name or str(agent.id)

    logger.info(
        "LC ACCEPT CLICKED session=%s user=%s",
        session_id,
        agent.id,
    )

    session = await accept_session(pool, session_id, agent.id, agent_username)

    if session is None:
        existing = await get_session_with_user(pool, session_id)
        by_whom = (
            f"@{existing['agent_username']}"
            if existing and existing["agent_username"]
            else "其他客服"
        )
        await callback.answer(f"⚠️ 该会话已被 {by_whom} 接受", show_alert=True)
        return

    session_info = await get_session_with_user(pool, session_id)
    user_tg_id = session_info["telegram_id"]
    user_name = html.escape(session_info["first_name"])
    user_uid = session_info["user_id"]
    user_phone = html.escape(session_info["phone"])
    accepted_at_str = session["accepted_at"].strftime("%Y-%m-%d %H:%M:%S")

    new_text = (
        f"💬 客服会话 #{session_id} — 🟢 进行中\n\n"
        f"👤 {user_name}\n"
        f"🆔 UID: {user_uid}\n"
        f"📱 {user_phone}\n\n"
        f"✅ 客服：\n"
        f"@{html.escape(agent_username)}\n\n"
        f"🕒 接受时间：\n"
        f"{accepted_at_str}\n\n"
        f"━━━━━━━━━━━━━━\n\n"
        f"请 Reply 用户消息进行回复\n\n"
        f"━━━━━━━━━━━━━━"
    )

    target = config.support_chat_id if config.support_chat_id else config.super_admin_id

    if session_info["notification_msg_id"]:
        try:
            await bot.edit_message_text(
                chat_id=target,
                message_id=session_info["notification_msg_id"],
                text=new_text,
                reply_markup=build_livechat_end_keyboard(session_id),
                parse_mode="HTML",
            )
        except Exception:
            logger.exception(
                "Failed to edit group notification session=%s", session_id
            )

    try:
        await bot.send_message(
            chat_id=user_tg_id,
            text="✅ 客服已接入您的会话。\n\n请直接发送消息与客服沟通。",
        )
        logger.info("User notified of session acceptance session=%s", session_id)
    except Exception:
        logger.exception("Failed to notify user session=%s", session_id)

    await callback.answer("✅ 已接受会话")
    logger.info(
        "Session accepted session=%s agent=%s", session_id, agent.id
    )


@router.callback_query(F.data.startswith("lc_ignore:"))
async def cb_lc_ignore(callback: CallbackQuery) -> None:
    session_id = callback.data.split(":", 1)[1]
    logger.info(
        "LC IGNORE CLICKED session=%s user=%s", session_id, callback.from_user.id
    )
    await callback.answer("已忽略此请求。")


# ── Agent reply in Support Group → forward to user ────────────────────────────


@router.message(IsAgentReply())
async def handle_agent_reply(
    message: Message,
    pool: asyncpg.Pool,
    bot: Bot,
    config: Config,
) -> None:
    group_msg_id = message.reply_to_message.message_id

    logger.info(
        "AGENT REPLY group_msg_id=%s agent=%s", group_msg_id, message.from_user.id
    )

    session = await get_session_by_group_msg_id(pool, group_msg_id)
    if not session:
        logger.info("AGENT REPLY no session for group_msg_id=%s", group_msg_id)
        return
    if session["status"] != "ACTIVE":
        logger.info(
            "AGENT REPLY session=%s status=%s not ACTIVE", session["id"], session["status"]
        )
        return

    user_tg_id = session["telegram_id"]

    msg_type = "OTHER"
    if message.text:
        msg_type = "TEXT"
    elif message.photo:
        msg_type = "PHOTO"
    elif message.document:
        msg_type = "DOCUMENT"
    elif message.voice:
        msg_type = "VOICE"
    elif message.sticker:
        msg_type = "STICKER"

    try:
        await bot.copy_message(
            chat_id=user_tg_id,
            from_chat_id=message.chat.id,
            message_id=message.message_id,
        )
        await store_message(
            pool,
            session_id=session["id"],
            sender_type="AGENT",
            msg_type=msg_type,
            user_msg_id=None,
            group_msg_id=message.message_id,
            content=message.text,
        )
        await update_last_message_at(pool, session["id"])
        logger.info(
            "AGENT REPLY forwarded to user=%s session=%s", user_tg_id, session["id"]
        )
    except Exception:
        logger.exception(
            "AGENT REPLY forward failed session=%s", session["id"]
        )
