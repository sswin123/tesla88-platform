from __future__ import annotations

import html
import logging

from aiogram import Bot, F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

import asyncpg

from bot.config import Config
from bot.keyboards.game_accounts import build_main_menu_keyboard
from bot.keyboards.livechat import (
    build_livechat_cancel_keyboard,
    build_livechat_request_keyboard,
)
from db.repositories.livechat_repo import (
    create_support_session,
    get_open_or_active_session,
    update_session_notification_msg_id,
)
from db.repositories.user_repo import get_user_by_telegram_id

logger = logging.getLogger(__name__)
router = Router()


class LiveChatStates(StatesGroup):
    waiting_initial_message = State()
    in_session = State()


def _message_preview(message: Message) -> tuple[str, str]:
    """Return (message_type, preview_text) for the first user message."""
    if message.text:
        preview = message.text[:300]
        return "TEXT", preview
    if message.photo:
        caption = message.caption or ""
        return "PHOTO", "[图片]" + (f"\n{caption[:200]}" if caption else "")
    if message.document:
        name = message.document.file_name or "[文件]"
        return "DOCUMENT", f"[文件] {name[:100]}"
    if message.voice:
        return "VOICE", "[语音消息]"
    if message.sticker:
        emoji = message.sticker.emoji or ""
        return "STICKER", f"[贴纸] {emoji}"
    return "OTHER", "[其他消息]"


# ── Menu entry ────────────────────────────────────────────────────────────────


@router.message(F.text == "📞 联系客服")
async def handle_livechat_menu(
    message: Message, state: FSMContext, pool: asyncpg.Pool
) -> None:
    user = await get_user_by_telegram_id(pool, message.from_user.id)
    if not user:
        await message.answer("您尚未注册。请发送 /start 开始注册。")
        return
    if user["status"] == "FROZEN":
        await message.answer("❌ 您的账号已被冻结，无法联系客服。")
        return

    existing = await get_open_or_active_session(pool, user["id"])
    if existing:
        await state.set_state(LiveChatStates.in_session)
        await state.update_data(session_id=existing["id"], user_id=user["id"])
        await message.answer(
            "⚠️ 您已有進行中的客服會話。\n\n請直接發送消息繼續溝通。"
        )
        return

    await state.update_data(user_id=user["id"])
    await state.set_state(LiveChatStates.waiting_initial_message)
    await message.answer(
        "💬 联系客服\n\n"
        "请描述您遇到的问题。\n\n"
        "支持：\n"
        "✅ 文字\n"
        "✅ 图片\n"
        "✅ 文件\n"
        "✅ 语音\n\n"
        "客服会尽快回复您。",
        reply_markup=build_livechat_cancel_keyboard(),
    )


# ── Cancel (inline button) ────────────────────────────────────────────────────


@router.callback_query(
    LiveChatStates.waiting_initial_message, F.data == "lc_cancel"
)
async def cb_cancel_livechat(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await callback.message.edit_text("❌ 已取消客服请求。")
    await callback.answer()


@router.message(Command("cancel"), LiveChatStates.waiting_initial_message)
async def cmd_cancel_livechat(message: Message, state: FSMContext) -> None:
    await state.clear()
    await message.answer("❌ 已取消客服请求。", reply_markup=build_main_menu_keyboard())


# ── First message → create session ───────────────────────────────────────────


@router.message(LiveChatStates.waiting_initial_message)
async def handle_initial_message(
    message: Message,
    state: FSMContext,
    pool: asyncpg.Pool,
    bot: Bot,
    config: Config,
) -> None:
    data = await state.get_data()
    user_id = data["user_id"]

    user = await get_user_by_telegram_id(pool, message.from_user.id)
    name = html.escape(user["first_name"]) if user else "未知"
    phone = html.escape(user["phone"]) if user else ""

    msg_type, preview = _message_preview(message)

    session = await create_support_session(pool, user_id)
    session_id = session["id"]

    await state.update_data(session_id=session_id)
    await state.set_state(LiveChatStates.in_session)

    notification_text = (
        f"💬 新客服请求 #{session_id}\n\n"
        f"👤 {name}\n"
        f"🆔 UID: {user_id}\n"
        f"📱 {phone}\n\n"
        f"📝 问题描述：\n"
        f"{html.escape(preview)}\n\n"
        f"📅 {session['created_at'].strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        f"━━━━━━━━━━━━━━"
    )

    target = config.support_chat_id if config.support_chat_id else config.super_admin_id

    logger.info(
        "Sending livechat notification session=%s chat_id=%s", session_id, target
    )

    try:
        notif = await bot.send_message(
            chat_id=target,
            text=notification_text,
            reply_markup=build_livechat_request_keyboard(session_id),
            parse_mode="HTML",
        )
        await update_session_notification_msg_id(pool, session_id, notif.message_id)
        logger.info(
            "Livechat notification sent session=%s msg_id=%s",
            session_id,
            notif.message_id,
        )
    except Exception:
        logger.exception("Livechat notification failed session=%s", session_id)

    await message.answer(
        f"✅ 客服请求已提交\n\n"
        f"會話編號：\n"
        f"#{session_id}\n\n"
        f"客服將盡快為您服務。\n\n"
        f"請保持在線。"
    )


# ── In-session placeholder (replaced in Step 4) ───────────────────────────────


@router.message(LiveChatStates.in_session)
async def handle_in_session_message(message: Message) -> None:
    await message.answer("💬 已收到您的消息，请等待客服回复。")
