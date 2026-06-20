from __future__ import annotations

import html
import logging

from aiogram import Bot, F, Router

logger = logging.getLogger(__name__)
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

import asyncpg

from bot.config import Config
from bot.constants import PROVIDERS
from bot.keyboards.withdrawal import (
    build_withdrawal_confirm_keyboard,
    build_withdrawal_provider_keyboard,
    build_withdrawal_review_keyboard,
)
from db.repositories.account_repo import get_user_game_accounts
from db.repositories.withdrawal_repo import (
    create_withdrawal_request,
    has_pending_withdrawal,
    update_withdrawal_notification_msg_id,
)
from db.repositories.user_repo import get_user_by_telegram_id

router = Router()


class WithdrawalStates(StatesGroup):
    waiting_provider = State()
    waiting_amount = State()
    confirming = State()


@router.message(F.text == "💸 提款")
async def handle_withdrawal_menu(
    message: Message, state: FSMContext, pool: asyncpg.Pool
) -> None:
    user = await get_user_by_telegram_id(pool, message.from_user.id)
    if not user:
        await message.answer("您尚未注册。请发送 /start 开始注册。")
        return
    if user["status"] == "FROZEN":
        await message.answer("❌ 您的账号已被冻结，无法提交提款申请。")
        return
    if await has_pending_withdrawal(pool, user["id"]):
        await message.answer("⚠️ 您有一个待审核的提款申请，请等待处理后再提交新申请。")
        return

    accounts = await get_user_game_accounts(pool, user["id"])
    if not accounts:
        await message.answer("⚠️ 您尚未领取任何游戏账号，请先在「🎮 我的游戏账号」领取账号。")
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
        "💸 提款\n\n请选择游戏平台：",
        reply_markup=build_withdrawal_provider_keyboard(providers),
    )


@router.callback_query(WithdrawalStates.waiting_provider, F.data.startswith("wd_prov:"))
async def cb_withdrawal_provider(
    callback: CallbackQuery, state: FSMContext, pool: asyncpg.Pool
) -> None:
    provider = callback.data.split(":", 1)[1]
    if provider not in PROVIDERS:
        await callback.answer("无效平台。", show_alert=True)
        return

    data = await state.get_data()
    accounts = await get_user_game_accounts(pool, data["user_id"])
    game_account = next((a for a in accounts if a["provider"] == provider), None)
    game_username = game_account["username"] if game_account else ""

    await state.update_data(provider=provider, game_username=game_username)
    await state.set_state(WithdrawalStates.waiting_amount)
    await callback.message.edit_text(
        f"💸 提款 — {html.escape(provider)}\n\n"
        f"👤 游戏账号：{html.escape(game_username)}\n\n"
        f"请输入提款金额（RM）：",
    )
    await callback.answer()


@router.message(WithdrawalStates.waiting_amount)
async def process_withdrawal_amount(
    message: Message, state: FSMContext, config: Config
) -> None:
    text = (message.text or "").strip().replace(",", "")
    try:
        amount = float(text)
        if amount <= 0:
            raise ValueError
    except ValueError:
        await message.answer("⚠️ 请输入有效金额（数字），例如：100")
        return

    if amount < config.min_withdrawal_amount:
        await message.answer(
            f"⚠️ 最低提款金额为 RM {config.min_withdrawal_amount:.2f}，请重新输入："
        )
        return

    data = await state.get_data()
    await state.update_data(withdraw_amount=amount)
    await state.set_state(WithdrawalStates.confirming)

    await message.answer(
        f"💸 提款确认\n\n"
        f"🎮 平台：{html.escape(data['provider'])}\n"
        f"👤 游戏账号：{html.escape(data['game_username'])}\n"
        f"💵 提款金额：RM {amount:.2f}\n\n"
        f"🏦 收款银行：{html.escape(data['bank_name'])}\n"
        f"💳 收款账号：{html.escape(data['bank_account'])}\n"
        f"👤 账户名：{html.escape(data['bank_holder_name'])}",
        reply_markup=build_withdrawal_confirm_keyboard(),
        parse_mode="HTML",
    )


@router.callback_query(WithdrawalStates.confirming, F.data == "wd_confirm")
async def cb_withdrawal_confirm(
    callback: CallbackQuery,
    state: FSMContext,
    pool: asyncpg.Pool,
    bot: Bot,
    config: Config,
) -> None:
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

    created_str = req["created_at"].strftime("%Y-%m-%d %H:%M:%S")
    phone = data.get("phone", "")

    text = (
        f"💸 新提款申请 #{req['id']}\n\n"
        f"👤 会员姓名：\n{html.escape(data['bank_holder_name'])}\n\n"
        f"📱 会员电话：\n{html.escape(phone)}\n\n"
        f"🎮 平台：\n{html.escape(data['provider'])}\n\n"
        f"👤 游戏账号：\n{html.escape(data['game_username'])}\n\n"
        f"💵 提款金额：\nRM {data['withdraw_amount']:.2f}\n\n"
        f"🏦 收款银行：\n{html.escape(data['bank_name'])}\n\n"
        f"💳 收款账号：\n{html.escape(data['bank_account'])}\n\n"
        f"👤 户口姓名：\n{html.escape(data['bank_holder_name'])}\n\n"
        f"═══════════════"
    )

    target_chat = config.admin_chat_id if config.admin_chat_id else config.super_admin_id

    logger.info(
        "Sending withdrawal notification #%s to chat %s",
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
    except Exception as exc:
        logger.error(
            "Withdrawal notification failed for request #%s to chat %s: %s",
            req["id"],
            target_chat,
            exc,
        )

    await callback.message.edit_text(
        f"✅ 提款申请已提交！\n申请编号：#{req['id']}\n请等待管理员审核。"
    )
    await callback.answer()


@router.callback_query(F.data == "wd_cancel")
async def cb_withdrawal_cancel(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await callback.message.edit_text("❌ 已取消提款申请。")
    await callback.answer()


@router.message(Command("cancel"), WithdrawalStates.waiting_amount)
@router.message(Command("cancel"), WithdrawalStates.confirming)
async def cancel_withdrawal_fsm(message: Message, state: FSMContext) -> None:
    await state.clear()
    await message.answer("❌ 已取消提款申请。")
