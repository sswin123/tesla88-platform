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
from bot.constants import PROVIDERS
from bot.keyboards.deposit import (
    build_bonus_keyboard,
    build_deposit_provider_keyboard,
    build_deposit_review_keyboard,
)
from db.repositories.account_repo import get_user_game_accounts
from db.repositories.bonus_repo import get_active_bonuses, get_bonus_by_id
from db.repositories.deposit_repo import (
    create_deposit_request,
    has_pending_deposit,
    update_deposit_notification_msg_id,
)
from db.repositories.user_repo import get_user_by_telegram_id

logger = logging.getLogger(__name__)
router = Router()


class DepositStates(StatesGroup):
    waiting_provider = State()
    waiting_bonus = State()
    waiting_amount = State()
    waiting_receipt = State()


@router.message(F.text == "💰 充值")
async def handle_deposit_menu(
    message: Message, state: FSMContext, pool: asyncpg.Pool
) -> None:
    user = await get_user_by_telegram_id(pool, message.from_user.id)
    if not user:
        await message.answer("您尚未注册。请发送 /start 开始注册。")
        return
    if user["status"] == "FROZEN":
        await message.answer("❌ 您的账号已被冻结，无法提交充值申请。")
        return
    if await has_pending_deposit(pool, user["id"]):
        await message.answer("⚠️ 您有一个待审核的充值申请，请等待处理后再提交新申请。")
        return

    accounts = await get_user_game_accounts(pool, user["id"])
    if not accounts:
        await message.answer("⚠️ 您尚未领取任何游戏账号，请先在「🎮 我的游戏账号」领取账号。")
        return

    providers = [acc["provider"] for acc in accounts]
    await state.update_data(
        user_id=user["id"],
        payment_bank=user["bank_name"],
        bank_holder_name=user["bank_holder_name"],
        phone=user["phone"],
    )
    await state.set_state(DepositStates.waiting_provider)
    await message.answer(
        "💰 充值\n\n请选择游戏平台：",
        reply_markup=build_deposit_provider_keyboard(providers),
    )


@router.callback_query(DepositStates.waiting_provider, F.data.startswith("dep_prov:"))
async def cb_deposit_provider(
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

    bonuses = await get_active_bonuses(pool, provider)
    await state.update_data(provider=provider, game_username=game_username)
    await state.set_state(DepositStates.waiting_bonus)
    await callback.message.edit_text(
        f"💰 充值 — {html.escape(provider)}\n\n请选择优惠：",
        reply_markup=build_bonus_keyboard(bonuses),
    )
    await callback.answer()


@router.callback_query(DepositStates.waiting_bonus, F.data == "dep_back_prov")
async def cb_deposit_back_provider(
    callback: CallbackQuery, state: FSMContext, pool: asyncpg.Pool
) -> None:
    data = await state.get_data()
    accounts = await get_user_game_accounts(pool, data["user_id"])
    providers = [acc["provider"] for acc in accounts]
    await state.set_state(DepositStates.waiting_provider)
    await callback.message.edit_text(
        "💰 充值\n\n请选择游戏平台：",
        reply_markup=build_deposit_provider_keyboard(providers),
    )
    await callback.answer()


@router.callback_query(DepositStates.waiting_bonus, F.data.startswith("dep_bonus:"))
async def cb_deposit_bonus(
    callback: CallbackQuery, state: FSMContext, pool: asyncpg.Pool
) -> None:
    raw = callback.data.split(":", 1)[1]
    data = await state.get_data()
    provider = data["provider"]

    if raw == "none":
        await state.update_data(
            bonus_type_id=None,
            bonus_name="无优惠",
            bonus_percentage=0.0,
            bonus_max=0.0,
            bonus_min_deposit=0.0,
        )
    else:
        bonus = await get_bonus_by_id(pool, int(raw))
        if not bonus:
            await callback.answer("该优惠不可用。", show_alert=True)
            return
        await state.update_data(
            bonus_type_id=bonus["id"],
            bonus_name=bonus["name"],
            bonus_percentage=float(bonus["percentage"]),
            bonus_max=float(bonus["max_bonus"]),
            bonus_min_deposit=float(bonus["min_deposit"]),
        )

    await state.set_state(DepositStates.waiting_amount)
    await callback.message.edit_text(
        f"💰 充值 — {html.escape(provider)}\n\n请输入充值金额（RM）：",
    )
    await callback.answer()


@router.message(DepositStates.waiting_amount)
async def process_deposit_amount(
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

    if amount < config.min_deposit_amount:
        await message.answer(
            f"⚠️ 最低充值金额为 RM {config.min_deposit_amount:.2f}，请重新输入："
        )
        return

    data = await state.get_data()
    provider = data["provider"]
    game_username = data.get("game_username", "")
    bonus_name = data.get("bonus_name", "无优惠")
    bonus_percentage = data.get("bonus_percentage", 0.0)
    bonus_max = data.get("bonus_max", 0.0)
    bonus_min_deposit = data.get("bonus_min_deposit", 0.0)
    payment_bank = data.get("payment_bank", "")

    if data.get("bonus_type_id") and amount < bonus_min_deposit:
        await message.answer(
            f"⚠️ 使用「{html.escape(bonus_name)}」最低充值为 RM {bonus_min_deposit:.2f}，"
            f"您的金额不符合条件。\n\n请重新输入金额，或发送 /cancel 取消并重新选择优惠。",
            parse_mode="HTML",
        )
        return

    bonus_amount = min(amount * bonus_percentage / 100, bonus_max) if bonus_percentage > 0 else 0.0
    credit_amount = amount + bonus_amount

    await state.update_data(
        deposit_amount=amount,
        bonus_amount=bonus_amount,
        credit_amount=credit_amount,
    )

    if bonus_amount > 0:
        bonus_lines = (
            f"🎁 优惠：{html.escape(bonus_name)}\n"
            f"🎁 Bonus：RM {bonus_amount:.2f}\n"
        )
    else:
        bonus_lines = f"🎁 优惠：无优惠\n"

    await state.set_state(DepositStates.waiting_receipt)
    await message.answer(
        f"💰 充值预览\n\n"
        f"🎮 平台：{html.escape(provider)}\n"
        f"👤 游戏账号：{html.escape(game_username)}\n\n"
        f"💵 充值金额：RM {amount:.2f}\n"
        f"{bonus_lines}"
        f"🪙 实际上分：RM {credit_amount:.2f}\n\n"
        f"🏦 付款银行：{html.escape(payment_bank)}\n\n"
        f"请上传转账收据截图（图片）：",
        parse_mode="HTML",
    )


@router.message(DepositStates.waiting_receipt, F.photo)
async def process_deposit_receipt(
    message: Message,
    state: FSMContext,
    pool: asyncpg.Pool,
    bot: Bot,
    config: Config,
) -> None:
    data = await state.get_data()
    file_id = message.photo[-1].file_id

    req = await create_deposit_request(
        pool,
        user_id=data["user_id"],
        provider=data["provider"],
        game_username=data.get("game_username", ""),
        deposit_amount=data["deposit_amount"],
        bonus_type_id=data.get("bonus_type_id"),
        bonus_amount=data["bonus_amount"],
        credit_amount=data["credit_amount"],
        payment_bank=data["payment_bank"],
        receipt_file_id=file_id,
    )
    await state.clear()

    provider = data["provider"]
    game_username = data.get("game_username", "")
    bonus_name = data.get("bonus_name", "无优惠")
    bonus_amount = data["bonus_amount"]
    credit_amount = data["credit_amount"]
    deposit_amount = data["deposit_amount"]
    payment_bank = data["payment_bank"]
    bank_holder_name = data["bank_holder_name"]
    phone = data["phone"]

    bonus_amount_line = f"🎁 Bonus\n+RM {bonus_amount:,.2f}\n\n" if bonus_amount > 0 else ""
    bonus_name_display = html.escape(bonus_name) if bonus_amount > 0 else "无优惠"

    caption = (
        f"💰 新充值申请 #{req['id']}\n\n"
        f"👤 {html.escape(bank_holder_name)}\n"
        f"🆔 UID: {data['user_id']}\n"
        f"📱 {html.escape(phone)}\n\n"
        f"🎮 {html.escape(provider)}\n"
        f"🆔 {html.escape(game_username)}\n\n"
        f"━━━━━━━━━━━━━━\n\n"
        f"💵 充值\n"
        f"RM {deposit_amount:,.2f}\n\n"
        f"{bonus_amount_line}"
        f"🪙 实际上分\n"
        f"RM {credit_amount:,.2f}\n\n"
        f"━━━━━━━━━━━━━━\n\n"
        f"🏷 优惠：\n{bonus_name_display}\n\n"
        f"🏦 {html.escape(payment_bank)}\n\n"
        f"📅 {req['created_at'].strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        f"━━━━━━━━━━━━━━"
    )

    target_chat = config.admin_chat_id if config.admin_chat_id else config.super_admin_id

    logger.info(
        "Sending deposit notification request=%s chat_id=%s",
        req["id"],
        target_chat,
    )

    try:
        notif = await bot.send_photo(
            chat_id=target_chat,
            photo=file_id,
            caption=caption,
            reply_markup=build_deposit_review_keyboard(req["id"]),
            parse_mode="HTML",
        )
        await update_deposit_notification_msg_id(pool, req["id"], notif.message_id)
        logger.info(
            "Deposit notification sent request=%s msg_id=%s",
            req["id"],
            notif.message_id,
        )
    except Exception:
        logger.exception(
            "Deposit notification failed request=%s",
            req["id"],
        )

    await message.answer(
        f"✅ 充值申请已提交！\n申请编号：#{req['id']}\n请等待管理员审核。"
    )


@router.message(DepositStates.waiting_receipt)
async def process_deposit_receipt_invalid(message: Message) -> None:
    await message.answer("⚠️ 请上传图片格式的收据截图。")


@router.callback_query(F.data == "dep_cancel")
async def cb_deposit_cancel(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await callback.message.edit_text("❌ 已取消充值申请。")
    await callback.answer()


@router.message(
    Command("cancel"),
    DepositStates.waiting_amount,
)
@router.message(
    Command("cancel"),
    DepositStates.waiting_receipt,
)
async def cancel_deposit_fsm(message: Message, state: FSMContext) -> None:
    await state.clear()
    await message.answer("❌ 已取消充值申请。")
