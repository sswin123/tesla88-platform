from __future__ import annotations

import html
import logging

from aiogram import Bot, F, Router
from aiogram.types import CallbackQuery

import asyncpg

from bot.config import Config
from bot.keyboards.livechat import build_livechat_end_keyboard
from db.repositories.livechat_repo import (
    accept_session,
    get_session_with_user,
)

logger = logging.getLogger(__name__)
router = Router()


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
        "LC ACCEPT CLICKED session=%s agent=%s username=%s",
        session_id,
        agent.id,
        agent_username,
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
        f"👤 {user_name} (UID: {user_uid})\n"
        f"📱 {user_phone}\n\n"
        f"✅ 客服：@{html.escape(agent_username)}\n"
        f"🕒 {accepted_at_str}\n\n"
        f"━━━━━━━━━━━━━━\n"
        f"请 Reply 用户消息进行回复\n"
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
            text="✅ 客服已接入您的会话。\n\n请发送您的问题，客服将尽快回复您。",
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
        "LC IGNORE CLICKED session=%s agent=%s", session_id, callback.from_user.id
    )
    await callback.answer("已忽略此请求。")
