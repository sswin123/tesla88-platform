from __future__ import annotations

import html
import logging
from typing import Any, Dict, Optional, Union

from aiogram import Bot, F, Router
from aiogram.filters import BaseFilter
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
from datetime import datetime, timezone

from db.repositories.livechat_repo import (
    create_support_session,
    get_latest_session_for_user,
    get_livechat_reopen_days,
    get_open_or_active_session,
    reopen_session,
    store_message,
    update_last_message_at,
    update_session_notification_msg_id,
)
from bot.services import BotMessageService
from db.repositories.user_repo import get_user_by_telegram_id

logger = logging.getLogger(__name__)
router = Router()

# Texts that are main-menu button presses — must not be treated as chat messages.
_MENU_BUTTONS: frozenset[str] = frozenset({
    "📋 我的资料", "🎮 我的游戏账号", "💰 充值", "💸 提款",
    "📜 充值记录", "📜 提款记录", "🔄 更换游戏账号", "📞 联系客服",
    "🎁 优惠中心", "🎁 我的优惠",
    "⬅️ 返回", "🏠 主菜单", "❌ 取消",
})


class LiveChatStates(StatesGroup):
    waiting_initial_message = State()
    in_session = State()


def _message_preview(message: Message) -> tuple[str, str]:
    """Return (message_type, preview_text) for the initial user message."""
    if message.text:
        return "TEXT", message.text[:300]
    if message.photo:
        cap = message.caption or ""
        return "PHOTO", "[图片]" + (f"\n{cap[:200]}" if cap else "")
    if message.video:
        cap = message.caption or ""
        return "VIDEO", "[视频]" + (f"\n{cap[:200]}" if cap else "")
    if message.video_note:
        return "VIDEO_NOTE", "[视频消息]"
    if message.voice:
        return "VOICE", "[语音消息]"
    if message.audio:
        name = message.audio.file_name or message.audio.title or "[音频]"
        return "AUDIO", f"[音频] {name[:100]}"
    if message.animation:
        return "ANIMATION", "[GIF]"
    if message.document:
        name = message.document.file_name or "[文件]"
        return "DOCUMENT", f"[文件] {name[:100]}"
    if message.sticker:
        emoji = message.sticker.emoji or ""
        return "STICKER", f"[贴纸] {emoji}"
    return "OTHER", "[其他消息]"


def _detect_msg_type(message: Message) -> str:
    if message.text:
        return "TEXT"
    if message.photo:
        return "PHOTO"
    if message.video:
        return "VIDEO"
    if message.video_note:
        return "VIDEO_NOTE"
    if message.voice:
        return "VOICE"
    if message.audio:
        return "AUDIO"
    if message.animation:
        return "ANIMATION"
    if message.document:
        return "DOCUMENT"
    if message.sticker:
        return "STICKER"
    return "OTHER"


def _get_file_id(message: Message) -> Optional[str]:
    """Extract the Telegram file_id from any media message."""
    if message.photo:
        return message.photo[-1].file_id
    if message.video:
        return message.video.file_id
    if message.video_note:
        return message.video_note.file_id
    if message.voice:
        return message.voice.file_id
    if message.audio:
        return message.audio.file_id
    if message.animation:
        return message.animation.file_id
    if message.document:
        return message.document.file_id
    if message.sticker:
        return message.sticker.file_id
    return None


# ── DB-based filter: user has an OPEN or ACTIVE session ───────────────────────


class HasLivechatSession(BaseFilter):
    """Returns {"lc_user": ..., "lc_session": ...} when the message should be
    routed to an active livechat session; False otherwise."""

    async def __call__(
        self,
        message: Message,
        pool: asyncpg.Pool,
        raw_state: Optional[str] = None,
    ) -> Union[bool, Dict[str, Any]]:
        if message.from_user is None:
            return False

        # Any active FSM state (deposit, withdrawal, promo, registration…) takes
        # priority — never forward those messages to the support group.
        if raw_state is not None:
            logger.info(
                "LIVECHAT_SKIP_FSM user=%s state=%s",
                message.from_user.id,
                raw_state,
            )
            return False

        # Menu button presses should fall through to their own handlers.
        if message.text and message.text in _MENU_BUTTONS:
            return False
        user = await get_user_by_telegram_id(pool, message.from_user.id)
        if not user:
            return False
        session = await get_open_or_active_session(pool, user["id"])
        if not session:
            return False
        return {"lc_user": user, "lc_session": session}


# ── Menu entry ─────────────────────────────────────────────────────────────────


@router.message(F.text == "📞 联系客服")
async def handle_livechat_menu(
    message: Message, state: FSMContext, pool: asyncpg.Pool, messages: BotMessageService
) -> None:
    lang = message.from_user.language_code or "zh"
    user = await get_user_by_telegram_id(pool, message.from_user.id)
    if not user:
        await message.answer(await messages.get_message("support_not_registered", language=lang))
        return
    if user["status"] == "FROZEN":
        await message.answer(await messages.get_message("support_account_frozen", language=lang))
        return

    existing = await get_open_or_active_session(pool, user["id"])
    if existing:
        await message.answer(
            await messages.get_message(
                "support_session_exists",
                language=lang,
                variables={"session_id": existing["id"]},
            )
        )
        return

    await state.update_data(user_id=user["id"])
    await state.set_state(LiveChatStates.waiting_initial_message)
    await message.answer(
        await messages.get_message("support_menu", language=lang),
        reply_markup=build_livechat_cancel_keyboard(),
    )


# ── Cancel ─────────────────────────────────────────────────────────────────────


@router.callback_query(
    LiveChatStates.waiting_initial_message, F.data == "lc_cancel"
)
async def cb_cancel_livechat(
    callback: CallbackQuery, state: FSMContext, messages: BotMessageService
) -> None:
    lang = callback.from_user.language_code or "zh"
    await state.clear()
    await callback.message.edit_text(
        await messages.get_message("support_cancelled", language=lang)
    )
    await callback.answer()


# ── First message → create OPEN session ───────────────────────────────────────


@router.message(LiveChatStates.waiting_initial_message)
async def handle_initial_message(
    message: Message,
    state: FSMContext,
    pool: asyncpg.Pool,
    bot: Bot,
    config: Config,
    messages: BotMessageService,
) -> None:
    lang = message.from_user.language_code or "zh"
    data = await state.get_data()
    user_id = data["user_id"]

    user = await get_user_by_telegram_id(pool, message.from_user.id)
    name = html.escape(user["first_name"]) if user else "未知"
    phone = html.escape(user["phone"]) if user else ""

    msg_type, preview = _message_preview(message)

    # Safety guard: if an OPEN or ACTIVE session was created between the menu
    # press and now (race condition, rapid taps, or ERP-initiated session),
    # do not create a duplicate — tell the user to continue in the existing one.
    existing = await get_open_or_active_session(pool, user_id)
    if existing:
        await state.clear()
        await message.answer(
            await messages.get_message(
                "support_session_exists",
                language=lang,
                variables={"session_id": existing["id"]},
            )
        )
        return

    # Persistent conversation model:
    # Reopen the most recent CLOSED session if it is within the configured
    # threshold; otherwise create a brand-new session.
    #
    # Edge cases handled:
    #   • closed_at IS NULL — session was OPEN when ERP closed it directly,
    #     so no timestamp was recorded.  Reopen conservatively rather than
    #     creating a duplicate.
    #   • latest is OPEN/ACTIVE — caught by the guard above; never reaches here.
    is_reopen = False
    latest = await get_latest_session_for_user(pool, user_id)

    if latest and latest["status"] == "CLOSED":
        reopen_days = await get_livechat_reopen_days(pool)
        if latest["closed_at"]:
            now_utc = datetime.now(timezone.utc)
            closed_utc = latest["closed_at"].astimezone(timezone.utc)
            age_days = (now_utc - closed_utc).days
            should_reopen = age_days <= reopen_days
        else:
            # No timestamp — treat as recent; reopen rather than duplicate.
            should_reopen = True

        if should_reopen:
            session = await reopen_session(pool, latest["id"])
            is_reopen = True
        else:
            session = await create_support_session(pool, user_id)
    else:
        session = await create_support_session(pool, user_id)

    # Rare concurrent-request race: unique index fired, session already exists.
    if session is None:
        session = await get_open_or_active_session(pool, user_id)
        if session is None:
            await message.answer(await messages.get_message("support_system_busy", language=lang))
            return
        await state.clear()
        await message.answer(
            await messages.get_message(
                "support_submitted",
                language=lang,
                variables={"session_id": session["id"]},
            )
        )
        return

    session_id = session["id"]
    await state.clear()

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if is_reopen:
        notification_text = (
            f"🔄 客服对话重新开启 #{session_id}\n\n"
            f"👤 {name}\n"
            f"🆔 UID: {user_id}\n"
            f"📱 {phone}\n\n"
            f"📝 新消息：\n"
            f"{html.escape(preview)}\n\n"
            f"📅 {now_str}\n\n"
            f"━━━━━━━━━━━━━━"
        )
    else:
        notification_text = (
            f"💬 新客服请求 #{session_id}\n\n"
            f"👤 {name}\n"
            f"🆔 UID: {user_id}\n"
            f"📱 {phone}\n\n"
            f"📝 问题描述：\n"
            f"{html.escape(preview)}\n\n"
            f"📅 {now_str}\n\n"
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

    # Store initial message in support_messages so ERP chat window shows it.
    if msg_type == "TEXT":
        await store_message(
            pool,
            session_id=session_id,
            sender_type="USER",
            msg_type="TEXT",
            user_msg_id=message.message_id,
            group_msg_id=None,
            content=message.text,
        )
    else:
        # Forward media to support group and store file_id so ERP can display it.
        try:
            copied = await bot.copy_message(
                chat_id=target,
                from_chat_id=message.chat.id,
                message_id=message.message_id,
            )
            await store_message(
                pool,
                session_id=session_id,
                sender_type="USER",
                msg_type=msg_type,
                user_msg_id=message.message_id,
                group_msg_id=copied.message_id,
                content=_get_file_id(message),
                caption=message.caption,
            )
            logger.info(
                "Initial media copied to Support Group session=%s type=%s",
                session_id,
                msg_type,
            )
        except Exception:
            logger.exception(
                "Failed to copy initial media session=%s", session_id
            )

    await message.answer(
        await messages.get_message(
            "support_submitted",
            language=lang,
            variables={"session_id": session_id},
        )
    )


# ── In-session: DB-based routing (no FSM dependency) ──────────────────────────
# Registered last so that menu-button handlers (deposit, withdrawal…) win first.


@router.message(F.chat.type == "private", HasLivechatSession())
async def route_session_message(
    message: Message,
    lc_user: asyncpg.Record,
    lc_session: asyncpg.Record,
    pool: asyncpg.Pool,
    bot: Bot,
    config: Config,
) -> None:
    logger.info(
        "LIVECHAT MESSAGE user=%s session=%s status=%s text=%s",
        lc_user["id"],
        lc_session["id"],
        lc_session["status"],
        message.text,
    )
    target = config.support_chat_id if config.support_chat_id else config.super_admin_id
    await _forward_user_message(message, lc_user, lc_session, bot, pool, target)


async def _forward_user_message(
    message: Message,
    user: asyncpg.Record,
    session: asyncpg.Record,
    bot: Bot,
    pool: asyncpg.Pool,
    target: int,
) -> None:
    session_id = session["id"]

    # Block if customer is muted
    muted_until = session.get("muted_until")
    if muted_until is not None:
        now = datetime.now(timezone.utc)
        muted_aware = muted_until if muted_until.tzinfo else muted_until.replace(tzinfo=timezone.utc)
        if muted_aware > now:
            await message.answer("您发送太频繁，请稍后再试。")
            return

    header = (
        f"👤 {html.escape(user['first_name'])} "
        f"(UID: {user['id']}) | #{session_id}"
    )

    group_msg_id: Optional[int] = None
    msg_type = _detect_msg_type(message)

    try:
        if message.text:
            sent = await bot.send_message(
                chat_id=target,
                text=f"{header}\n{message.text}",
            )
            group_msg_id = sent.message_id
        else:
            hdr_msg = await bot.send_message(chat_id=target, text=header)
            copied = await bot.copy_message(
                chat_id=target,
                from_chat_id=message.chat.id,
                message_id=message.message_id,
                reply_to_message_id=hdr_msg.message_id,
            )
            group_msg_id = copied.message_id
    except Exception:
        logger.exception(
            "LIVECHAT FORWARD FAILED session=%s user=%s", session_id, user["id"]
        )
        return

    if group_msg_id:
        # For media messages store the file_id so ERP can proxy + display them.
        content = message.text if msg_type == "TEXT" else _get_file_id(message)

        # Extract file metadata for ERP file cards
        file_name: Optional[str] = None
        file_size: Optional[int] = None
        if message.document:
            file_name = message.document.file_name
            file_size = message.document.file_size
        elif message.audio:
            file_name = getattr(message.audio, "file_name", None) or getattr(message.audio, "title", None)
            file_size = message.audio.file_size
        elif message.video:
            file_name = getattr(message.video, "file_name", None)
            file_size = message.video.file_size

        await store_message(
            pool,
            session_id=session_id,
            sender_type="USER",
            msg_type=msg_type,
            user_msg_id=message.message_id,
            group_msg_id=group_msg_id,
            content=content,
            caption=message.caption if msg_type != "TEXT" else None,
            file_name=file_name,
            file_size=file_size,
        )
        await update_last_message_at(pool, session_id)
