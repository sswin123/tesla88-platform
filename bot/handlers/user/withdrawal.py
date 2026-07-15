from __future__ import annotations

import html
import logging

from aiogram import Bot, F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message, ReplyKeyboardRemove

import asyncpg

from bot.config import Config
from bot.keyboards.common import build_back_cancel_keyboard
from bot.keyboards.game_accounts import build_main_menu_keyboard, build_main_menu_keyboard_from_cms
from bot.keyboards.withdrawal import (
    build_withdrawal_confirm_keyboard,
    build_withdrawal_provider_keyboard,
    build_withdrawal_review_keyboard,
)
from bot.services import BotMessageService
from db.repositories.account_repo import get_user_game_accounts
from db.repositories.withdrawal_repo import (
    create_withdrawal_request,
    has_pending_withdrawal,
    update_withdrawal_notification_msg_id,
)
from db.repositories.user_repo import get_user_by_telegram_id

logger = logging.getLogger(__name__)
router = Router()


class WithdrawalStates(StatesGroup):
    waiting_provider = State()
    waiting_amount = State()
    confirming = State()


@router.message(F.text == "💸 提款")
async def handle_withdrawal_menu(
    message: Message,
    state: FSMContext,
    pool: asyncpg.Pool,
    messages: BotMessageService,
) -> None:
    lang = message.from_user.language_code or "zh"
    user = await get_user_by_telegram_id(pool, message.from_user.id)
    if not user:
        await message.answer(await messages.get_message("withdraw_not_registered", language=lang))
        return
    if user["status"] == "FROZEN":
        await message.answer(await messages.get_message("withdraw_account_frozen", language=lang))
        return
    if await has_pending_withdrawal(pool, user["id"]):
        await message.answer(await messages.get_message("withdraw_pending_exists", language=lang))
        return

    accounts = await get_user_game_accounts(pool, user["id"])
    if not accounts:
        await message.answer(await messages.get_message("withdraw_no_game_account", language=lang))
        return

    providers = [acc["provider"] for acc in accounts]
    await state.update_data(
        user_id=user["id"],
        phone=user["phone"],
        bank_name=user["bank_name"],
        bank_account=user["bank_account"],
        bank_holder_name=user["bank_holder_name"],
    )
    await state.set_state(WithdrawalStates.waiting_provider)
    await message.answer(
        await messages.get_message("withdraw_select_platform", language=lang),
        reply_markup=build_withdrawal_provider_keyboard(providers),
    )


@router.callback_query(WithdrawalStates.waiting_provider, F.data.startswith("wd_prov:"))
async def cb_withdrawal_provider(
    callback: CallbackQuery,
    state: FSMContext,
    pool: asyncpg.Pool,
    messages: BotMessageService,
) -> None:
    lang = callback.from_user.language_code or "zh"
    provider = callback.data.split(":", 1)[1]
    data = await state.get_data()
    accounts = await get_user_game_accounts(pool, data["user_id"])
    if not any(a["provider"] == provider for a in accounts):
        await callback.answer(
            await messages.get_message("withdraw_invalid_platform", language=lang),
            show_alert=True,
        )
        return
    game_account = next((a for a in accounts if a["provider"] == provider), None)
    game_username = game_account["username"] if game_account else ""

    await state.update_data(provider=provider, game_username=game_username)
    await state.set_state(WithdrawalStates.waiting_amount)
    await callback.message.edit_text(
        f"💸 提款 — {html.escape(provider)}\n"
        f"👤 游戏账号：{html.escape(game_username)}"
    )
    await callback.message.answer(
        await messages.get_message("withdraw_enter_amount", language=lang),
        reply_markup=build_back_cancel_keyboard(),
    )
    await callback.answer()


# ── FSM Back: from waiting_amount → provider selection ────────────────────────

@router.message(WithdrawalStates.waiting_amount, F.text == "⬅️ 返回")
async def wd_back_from_amount(
    message: Message,
    state: FSMContext,
    pool: asyncpg.Pool,
    messages: BotMessageService,
) -> None:
    lang = message.from_user.language_code or "zh"
    data = await state.get_data()
    accounts = await get_user_game_accounts(pool, data["user_id"])
    providers = [acc["provider"] for acc in accounts]
    await state.set_state(WithdrawalStates.waiting_provider)
    await message.answer("⬅️ 返回", reply_markup=ReplyKeyboardRemove())
    await message.answer(
        await messages.get_message("withdraw_select_platform", language=lang),
        reply_markup=build_withdrawal_provider_keyboard(providers),
    )


@router.message(WithdrawalStates.waiting_amount)
async def process_withdrawal_amount(
    message: Message,
    state: FSMContext,
    config: Config,
    messages: BotMessageService,
) -> None:
    lang = message.from_user.language_code or "zh"
    text_input = (message.text or "").strip().replace(",", "")
    try:
        amount = float(text_input)
        if amount <= 0:
            raise ValueError
    except ValueError:
        await message.answer(await messages.get_message("withdraw_amount_invalid", language=lang))
        return

    if amount < config.min_withdrawal_amount:
        await message.answer(
            await messages.get_message(
                "withdraw_min_not_met",
                language=lang,
                variables={"min_amount": config.min_withdrawal_amount},
            )
        )
        return

    data = await state.get_data()
    await state.update_data(withdraw_amount=amount)
    await state.set_state(WithdrawalStates.confirming)

    text = await messages.get_message(
        "withdraw_confirm",
        language=lang,
        variables={
            "provider": html.escape(data["provider"]),
            "game_username": html.escape(data["game_username"]),
            "amount": amount,
            "bank_name": html.escape(data["bank_name"]),
            "bank_account": html.escape(data["bank_account"]),
            "bank_holder_name": html.escape(data["bank_holder_name"]),
        },
    )
    await message.answer(text, reply_markup=build_withdrawal_confirm_keyboard(), parse_mode="HTML")


@router.callback_query(WithdrawalStates.confirming, F.data == "wd_confirm")
async def cb_withdrawal_confirm(
    callback: CallbackQuery,
    state: FSMContext,
    pool: asyncpg.Pool,
    bot: Bot,
    config: Config,
    messages: BotMessageService,
) -> None:
    lang = callback.from_user.language_code or "zh"
    data = await state.get_data()

    req = await create_withdrawal_request(
        pool,
        user_id=data["user_id"],
        provider=data["provider"],
        game_username=data["game_username"],
        withdraw_amount=data["withdraw_amount"],
        bank_name=data["bank_name"],
        bank_account=data["bank_account"],
        bank_holder_name=data["bank_holder_name"],
    )
    await state.clear()

    phone = data.get("phone", "")

    text = (
        f"💸 新提款申请 #{req['id']}\n\n"
        f"👤 {html.escape(data['bank_holder_name'])}\n"
        f"🆔 UID: {data['user_id']}\n"
        f"📱 {html.escape(phone)}\n\n"
        f"🎮 {html.escape(data['provider'])}\n"
        f"🆔 {html.escape(data['game_username'])}\n\n"
        f"━━━━━━━━━━━━━━\n\n"
        f"💵 提款\n"
        f"RM {data['withdraw_amount']:,.2f}\n\n"
        f"━━━━━━━━━━━━━━\n\n"
        f"🏦 {html.escape(data['bank_name'])}\n"
        f"💳 {html.escape(data['bank_account'])}\n\n"
        f"📅 {req['created_at'].strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        f"━━━━━━━━━━━━━━"
    )

    target_chat = config.admin_chat_id if config.admin_chat_id else config.super_admin_id

    logger.info(
        "Sending withdrawal notification request=%s chat_id=%s",
        req["id"],
        target_chat,
    )

    try:
        notif = await bot.send_message(
            chat_id=target_chat,
            text=text,
            reply_markup=build_withdrawal_review_keyboard(req["id"]),
            parse_mode="HTML",
        )
        await update_withdrawal_notification_msg_id(pool, req["id"], notif.message_id)
        logger.info(
            "Withdrawal notification sent request=%s msg_id=%s",
            req["id"],
            notif.message_id,
        )
    except Exception:
        logger.exception(
            "Withdrawal notification failed request=%s",
            req["id"],
        )

    submitted_text = await messages.get_message(
        "withdraw_submitted",
        language=lang,
        variables={"req_id": req["id"]},
    )
    await callback.message.edit_text(submitted_text)
    keyboard = await build_main_menu_keyboard_from_cms(pool, lang)
    await callback.message.answer("", reply_markup=keyboard)
    await callback.answer()


@router.callback_query(F.data == "wd_cancel")
async def cb_withdrawal_cancel(
    callback: CallbackQuery,
    state: FSMContext,
    messages: BotMessageService,
) -> None:
    lang = callback.from_user.language_code or "zh"
    await state.clear()
    await callback.message.edit_text(
        await messages.get_message("withdraw_cancelled", language=lang)
    )
    await callback.answer()
