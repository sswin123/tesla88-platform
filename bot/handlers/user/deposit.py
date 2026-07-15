from __future__ import annotations

import html
import logging
from decimal import Decimal

import asyncpg
from aiogram import Bot, F, Router
from aiogram.filters import StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message, ReplyKeyboardRemove

from bot.config import Config
from bot.constants import BONUS_DISCLAIMER
from bot.keyboards.common import build_back_cancel_keyboard
from bot.keyboards.deposit import (
    build_deposit_provider_keyboard,
    build_deposit_review_keyboard,
    build_promo_keyboard,
    build_bank_select_keyboard,
)
from db.repositories.bank_repo import get_active_banks
from bot.keyboards.game_accounts import build_main_menu_keyboard, build_main_menu_keyboard_from_cms
from bot.handlers.user.promotions import calculate_bonus
from bot.services import BotMessageService
from db.repositories.account_repo import get_user_game_accounts
from db.repositories.deposit_repo import (
    create_deposit_request,
    has_pending_deposit,
    update_deposit_notification_msg_id,
)
from db.repositories.promotion_repo import (
    can_member_claim_promotion,
    get_active_promotions,
    get_eligible_promotions_for_member,
    get_promotion_by_id,
    has_daily_claim_today,
    has_first_deposit_claim,
    has_weekly_claim_this_week,
    is_promo_available,
)
from db.repositories.user_repo import get_user_by_telegram_id

logger = logging.getLogger(__name__)
router = Router()


class DepositStates(StatesGroup):
    waiting_provider = State()
    waiting_promo = State()
    waiting_amount = State()
    waiting_bank_select = State()
    waiting_receipt = State()


async def _start_deposit_flow(
    pool: asyncpg.Pool,
    state: FSMContext,
    telegram_id: int,
    answer_fn,
    config: Config,
    messages: BotMessageService,
    lang: str = "zh",
    preselected_promo_id: int | None = None,
) -> bool:
    """Common setup for deposit flow. Returns False if blocked (responds to user)."""
    user = await get_user_by_telegram_id(pool, telegram_id)
    if not user:
        await answer_fn(await messages.get_message("deposit_not_registered", language=lang))
        return False
    if user["status"] == "FROZEN":
        await answer_fn(await messages.get_message("deposit_account_frozen", language=lang))
        return False
    if await has_pending_deposit(pool, user["id"]):
        await answer_fn(await messages.get_message("deposit_pending_exists", language=lang))
        return False

    accounts = await get_user_game_accounts(pool, user["id"])
    if not accounts:
        await answer_fn(await messages.get_message("deposit_no_game_account", language=lang))
        return False

    providers = [acc["provider"] for acc in accounts]
    await state.update_data(
        user_id=user["id"],
        payment_bank=user["bank_name"],
        bank_holder_name=user["bank_holder_name"],
        phone=user["phone"],
        preselected_promo_id=preselected_promo_id,
    )
    await state.set_state(DepositStates.waiting_provider)
    await answer_fn(
        await messages.get_message("deposit_select_platform", language=lang),
        reply_markup=build_deposit_provider_keyboard(providers),
    )
    return True


@router.message(F.text == "💰 充值")
async def handle_deposit_menu(
    message: Message,
    state: FSMContext,
    pool: asyncpg.Pool,
    config: Config,
    messages: BotMessageService,
) -> None:
    lang = message.from_user.language_code or "zh"
    await _start_deposit_flow(
        pool, state, message.from_user.id, message.answer, config, messages, lang
    )


@router.callback_query(F.data.startswith("dep_from_promo:"))
async def cb_dep_from_promo(
    callback: CallbackQuery,
    state: FSMContext,
    pool: asyncpg.Pool,
    config: Config,
    messages: BotMessageService,
) -> None:
    """Entry point from 优惠中心 — pre-selects a promotion and starts deposit flow."""
    lang = callback.from_user.language_code or "zh"
    promo_id = int(callback.data.split(":", 1)[1])
    promo = await get_promotion_by_id(pool, promo_id)
    if not promo or not is_promo_available(promo):
        await callback.answer(
            await messages.get_message("deposit_promo_unavailable", language=lang),
            show_alert=True,
        )
        return

    await callback.answer()
    ok = await _start_deposit_flow(
        pool, state, callback.from_user.id,
        callback.message.answer, config, messages, lang,
        preselected_promo_id=promo_id,
    )
    if ok:
        try:
            await callback.message.delete()
        except Exception:
            pass


@router.callback_query(DepositStates.waiting_provider, F.data.startswith("dep_prov:"))
async def cb_deposit_provider(
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
        await callback.answer(await messages.get_message("deposit_promo_invalid", language=lang), show_alert=True)
        return
    game_account = next((a for a in accounts if a["provider"] == provider), None)
    game_username = game_account["username"] if game_account else ""
    await state.update_data(provider=provider, game_username=game_username)

    preselected_promo_id = data.get("preselected_promo_id")
    if preselected_promo_id:
        promo = await get_promotion_by_id(pool, preselected_promo_id)
        if promo and is_promo_available(promo):
            await _apply_promo_to_state(state, promo)
            await state.set_state(DepositStates.waiting_amount)
            logger.info(
                "DEPOSIT_SET_WAITING_AMOUNT user=%s path=preselected state=%s",
                callback.from_user.id,
                await state.get_state(),
            )
            await callback.message.edit_text(
                f"💰 充值 — {html.escape(provider)}"
            )
            await callback.message.answer(
                _promo_amount_prompt(promo),
                reply_markup=build_back_cancel_keyboard(),
            )
            await callback.answer()
            return
        # Promo went offline — fall through to normal promo selection

    promotions = await get_eligible_promotions_for_member(pool, data["user_id"])
    await state.set_state(DepositStates.waiting_promo)
    await callback.message.edit_text(
        await messages.get_message(
            "deposit_select_promo",
            language=lang,
            variables={"provider": html.escape(provider)},
        ),
        reply_markup=build_promo_keyboard(promotions),
    )
    await callback.answer()


@router.callback_query(DepositStates.waiting_promo, F.data == "dep_back_prov")
async def cb_deposit_back_provider(
    callback: CallbackQuery,
    state: FSMContext,
    pool: asyncpg.Pool,
    messages: BotMessageService,
) -> None:
    lang = callback.from_user.language_code or "zh"
    data = await state.get_data()
    accounts = await get_user_game_accounts(pool, data["user_id"])
    providers = [acc["provider"] for acc in accounts]
    await state.set_state(DepositStates.waiting_provider)
    await callback.message.edit_text(
        await messages.get_message("deposit_select_platform", language=lang),
        reply_markup=build_deposit_provider_keyboard(providers),
    )
    await callback.answer()


@router.callback_query(DepositStates.waiting_promo, F.data.startswith("dep_promo:"))
async def cb_deposit_promo(
    callback: CallbackQuery,
    state: FSMContext,
    pool: asyncpg.Pool,
    messages: BotMessageService,
) -> None:
    lang = callback.from_user.language_code or "zh"
    raw = callback.data.split(":", 1)[1]
    data = await state.get_data()
    provider = data["provider"]

    selected_promo = None
    if raw == "none":
        await state.update_data(
            promotion_id=None,
            promo_name="无优惠",
            promo_bonus_type=None,
            promo_bonus_value=None,
            promo_max_bonus=None,
            promo_min_deposit=0.0,
            promo_turnover_multiplier=None,
            promo_turnover_type=None,
        )
    else:
        promo = await get_promotion_by_id(pool, int(raw))
        if not promo or not is_promo_available(promo):
            await callback.answer(
                await messages.get_message("deposit_promo_invalid", language=lang),
                show_alert=True,
            )
            return

        user_id = data["user_id"]
        promo_type = promo["promotion_type"]
        limit_exceeded = False
        if promo_type == "FIRST_DEPOSIT":
            limit_exceeded = await has_first_deposit_claim(pool, user_id)
        elif promo_type == "DAILY":
            limit_exceeded = await has_daily_claim_today(pool, user_id, promo["id"])
        elif promo_type == "WEEKLY":
            limit_exceeded = await has_weekly_claim_this_week(pool, user_id, promo["id"])

        if limit_exceeded:
            key_map = {
                "FIRST_DEPOSIT": "deposit_promo_first_only",
                "DAILY": "deposit_promo_daily_limit",
                "WEEKLY": "deposit_promo_weekly_limit",
            }
            key = key_map.get(promo_type)
            if key:
                text = await messages.get_message(key, language=lang)
            else:
                text = "您已达到此优惠的领取上限。"
            await callback.answer(text, show_alert=True)
            return

        await _apply_promo_to_state(state, promo)
        selected_promo = promo

    await state.set_state(DepositStates.waiting_amount)
    logger.info(
        "DEPOSIT_SET_WAITING_AMOUNT user=%s path=promo_select promo=%s state=%s",
        callback.from_user.id,
        raw,
        await state.get_state(),
    )
    await callback.message.edit_text(f"💰 充值 — {html.escape(provider)}")
    amount_text = (
        _promo_amount_prompt(selected_promo)
        if selected_promo
        else await messages.get_message("deposit_enter_amount", language=lang)
    )
    await callback.message.answer(amount_text, reply_markup=build_back_cancel_keyboard())
    await callback.answer()


def _promo_amount_prompt(promo: asyncpg.Record) -> str:
    """Amount input prompt with full promotion details (all values from DB)."""
    bonus_type_label = "百分比" if promo["bonus_type"] == "PERCENTAGE" else "固定金额"
    if promo["bonus_type"] == "PERCENTAGE":
        bonus_str = f"{promo['bonus_value']:g}%"
    else:
        bonus_str = f"RM{float(promo['bonus_value']):,.2f}"

    max_bonus_str = (
        f"RM{float(promo['max_bonus']):,.2f}" if promo["max_bonus"] else "无上限"
    )

    expiry_str = "无到期日"
    if promo.get("expiry_date"):
        try:
            expiry_str = promo["expiry_date"].strftime("%Y-%m-%d")
        except Exception:
            pass

    min_dep = float(promo["min_deposit"])

    lines = [
        "💰 已选优惠",
        "",
        f"🎁 {html.escape(promo['name'])}",
        "",
        f"奖金类型：{bonus_type_label}",
        f"奖金：{bonus_str}",
        f"最低充值：RM{min_dep:,.2f}",
        f"最高奖金：{max_bonus_str}",
        f"流水：×{promo['turnover_multiplier']:g}",
        f"到期日：{expiry_str}",
    ]

    if min_dep == int(min_dep):
        examples = [str(int(min_dep))]
    else:
        examples = [f"{min_dep:.2f}"]
    for ex in [20, 50, 100, 300, 500, 1000]:
        if ex > min_dep:
            examples.append(str(ex))
        if len(examples) >= 4:
            break

    lines += ["", "请输入充值金额（RM）", "", "例如："] + examples
    return "\n".join(lines)


async def _apply_promo_to_state(state: FSMContext, promo: asyncpg.Record) -> None:
    await state.update_data(
        promotion_id=promo["id"],
        promo_name=promo["name"],
        promo_bonus_type=promo["bonus_type"],
        promo_bonus_value=float(promo["bonus_value"]),
        promo_max_bonus=float(promo["max_bonus"]) if promo["max_bonus"] else None,
        promo_min_deposit=float(promo["min_deposit"]),
        promo_turnover_multiplier=float(promo["turnover_multiplier"]),
        promo_turnover_type=promo.get("turnover_type", "BONUS"),
    )


# ── FSM Back: from waiting_amount ─────────────────────────────────────────────

@router.message(StateFilter(DepositStates.waiting_amount), F.text == "⬅️ 返回")
async def dep_back_from_amount(
    message: Message,
    state: FSMContext,
    pool: asyncpg.Pool,
    messages: BotMessageService,
) -> None:
    lang = message.from_user.language_code or "zh"
    data = await state.get_data()
    provider = data.get("provider", "")
    preselected = data.get("preselected_promo_id")

    if preselected:
        accounts = await get_user_game_accounts(pool, data["user_id"])
        providers = [acc["provider"] for acc in accounts]
        await state.set_state(DepositStates.waiting_provider)
        await message.answer("⬅️ 返回", reply_markup=ReplyKeyboardRemove())
        await message.answer(
            await messages.get_message("deposit_select_platform", language=lang),
            reply_markup=build_deposit_provider_keyboard(providers),
        )
    else:
        promotions = await get_eligible_promotions_for_member(pool, data["user_id"])
        await state.set_state(DepositStates.waiting_promo)
        await message.answer("⬅️ 返回", reply_markup=ReplyKeyboardRemove())
        await message.answer(
            await messages.get_message(
                "deposit_select_promo",
                language=lang,
                variables={"provider": html.escape(provider)},
            ),
            reply_markup=build_promo_keyboard(promotions),
        )


# ── FSM Back: from waiting_receipt ────────────────────────────────────────────

@router.message(DepositStates.waiting_receipt, F.text == "⬅️ 返回")
async def dep_back_from_receipt(
    message: Message,
    state: FSMContext,
    pool: asyncpg.Pool,
    messages: BotMessageService,
) -> None:
    lang = message.from_user.language_code or "zh"
    data = await state.get_data()
    provider = data.get("provider", "")
    game_username = data.get("game_username", "")
    promo_name = data.get("promo_name", "无优惠")
    amount = data.get("deposit_amount", 0.0)
    bonus_amount = data.get("bonus_amount", 0.0)
    credit_amount = data.get("credit_amount", 0.0)
    turnover_required = data.get("turnover_required", 0.0)

    if bonus_amount > 0:
        credit_block = (
            f"🎁 优惠：{html.escape(promo_name)}\n"
            f"🎁 Bonus：RM {bonus_amount:.2f}\n"
            f"🪙 实际上分：RM {credit_amount:.2f}\n"
            f"💰 最低出款：RM {turnover_required:.2f}\n"
        )
    else:
        credit_block = (
            f"🎁 优惠：无优惠\n"
            f"🪙 实际上分：RM {credit_amount:.2f}\n"
        )

    banks = await get_active_banks(pool, provider)
    if not banks:
        await state.set_state(DepositStates.waiting_amount)
        promotion_id = data.get("promotion_id")
        promo_for_prompt = None
        if promotion_id:
            fetched = await get_promotion_by_id(pool, promotion_id)
            if fetched and is_promo_available(fetched):
                promo_for_prompt = fetched
        amount_text = (
            _promo_amount_prompt(promo_for_prompt)
            if promo_for_prompt
            else await messages.get_message("deposit_enter_amount", language=lang)
        )
        await message.answer(
            f"💰 充值 — {html.escape(provider)}\n\n{amount_text}",
            reply_markup=build_back_cancel_keyboard(),
        )
        return

    await state.set_state(DepositStates.waiting_bank_select)
    text = await messages.get_message(
        "deposit_preview",
        language=lang,
        variables={
            "provider": html.escape(provider),
            "game_username": html.escape(game_username),
            "amount": amount,
            "credit_block": credit_block,
        },
    )
    await message.answer(text, reply_markup=build_bank_select_keyboard(banks), parse_mode="HTML")


# ── FSM Back: from waiting_bank_select ────────────────────────────────────────

@router.message(DepositStates.waiting_bank_select, F.text == "⬅️ 返回")
async def dep_back_from_bank_select(
    message: Message,
    state: FSMContext,
    pool: asyncpg.Pool,
    messages: BotMessageService,
) -> None:
    lang = message.from_user.language_code or "zh"
    data = await state.get_data()
    provider = data.get("provider", "")
    promotion_id = data.get("promotion_id")
    await state.set_state(DepositStates.waiting_amount)

    promo = None
    if promotion_id:
        fetched = await get_promotion_by_id(pool, promotion_id)
        if fetched and is_promo_available(fetched):
            promo = fetched

    amount_text = (
        _promo_amount_prompt(promo)
        if promo
        else await messages.get_message("deposit_enter_amount", language=lang)
    )
    await message.answer(
        f"💰 充值 — {html.escape(provider)}\n\n{amount_text}",
        reply_markup=build_back_cancel_keyboard(),
    )


# ── FSM: bank selection callback ──────────────────────────────────────────────

@router.callback_query(DepositStates.waiting_bank_select, F.data.startswith("dep_bank:"))
async def cb_deposit_bank_select(
    callback: CallbackQuery,
    state: FSMContext,
    pool: asyncpg.Pool,
    messages: BotMessageService,
) -> None:
    lang = callback.from_user.language_code or "zh"
    bank_id = int(callback.data.split(":", 1)[1])

    # Load FSM data FIRST — provider must be known before calling get_active_banks
    data = await state.get_data()
    provider = data.get("provider", "")

    banks = await get_active_banks(pool, provider)
    bank = next((b for b in banks if b["id"] == bank_id), None)
    if not bank:
        await callback.answer(
            await messages.get_message("deposit_bank_invalid", language=lang),
            show_alert=True,
        )
        return

    # Store casino receiving bank in FSM state (overwrites the user's own bank placeholder)
    await state.update_data(
        payment_bank=bank["bank_name"],      # casino bank name used in INSERT
        receiving_bank_id=bank_id,           # FK for new schema (migration 027)
        selected_bank_id=bank_id,
        selected_bank_name=bank["bank_name"],
        selected_bank_account_name=bank["account_name"],
        selected_bank_account_number=bank["account_number"],
    )
    await state.set_state(DepositStates.waiting_receipt)

    # Refresh data after update
    data = await state.get_data()
    game_username = data.get("game_username", "")
    amount        = data["deposit_amount"]
    bonus_amount  = data["bonus_amount"]
    credit_amount = data["credit_amount"]
    promo_name    = data.get("promo_name", "无优惠")
    turnover_required = data.get("turnover_required", 0.0)

    if bonus_amount > 0:
        credit_block = (
            f"🎁 优惠：{html.escape(promo_name)}\n"
            f"🎁 Bonus：RM {bonus_amount:.2f}\n"
            f"🪙 实际上分：RM {credit_amount:.2f}\n"
            f"💰 最低出款：RM {turnover_required:.2f}\n"
        )
    else:
        credit_block = f"🪙 实际上分：RM {credit_amount:.2f}\n"

    text = await messages.get_message(
        "deposit_confirm",
        language=lang,
        variables={
            "provider":      html.escape(provider),
            "game_username": html.escape(game_username),
            "amount":        amount,
            "credit_block":  credit_block,
            "bank_name":     html.escape(bank["bank_name"]),
            "account_name":  html.escape(bank["account_name"]),
            "account_number": html.escape(bank["account_number"]),
        },
    )
    await callback.message.edit_text(text, parse_mode="HTML")
    await callback.answer()


# ── FSM: amount input ─────────────────────────────────────────────────────────

@router.message(StateFilter(DepositStates.waiting_amount))
async def process_deposit_amount(
    message: Message,
    state: FSMContext,
    pool: asyncpg.Pool,
    config: Config,
    messages: BotMessageService,
) -> None:
    lang = message.from_user.language_code or "zh"
    current_state = await state.get_state()
    logger.info(
        "DEPOSIT_AMOUNT_HANDLER user=%s text=%s state=%s",
        message.from_user.id,
        message.text,
        current_state,
    )
    text_input = (message.text or "").strip().replace(",", "")
    try:
        amount = float(text_input)
        if amount <= 0:
            raise ValueError
    except ValueError:
        await message.answer(await messages.get_message("deposit_amount_invalid", language=lang))
        return

    data = await state.get_data()
    provider = data["provider"]
    game_username = data.get("game_username", "")
    payment_bank = data.get("payment_bank", "")
    promotion_id = data.get("promotion_id")
    promo_name = data.get("promo_name", "无优惠")
    promo_bonus_type = data.get("promo_bonus_type")
    promo_min_deposit = data.get("promo_min_deposit", 0.0)

    if promotion_id and amount < promo_min_deposit:
        await message.answer(
            await messages.get_message(
                "deposit_min_not_met",
                language=lang,
                variables={"promo_name": promo_name, "min_deposit": promo_min_deposit},
            ),
            parse_mode="HTML",
        )
        return

    if promotion_id and promo_bonus_type:
        bonus, total, turnover_req = calculate_bonus(
            Decimal(str(amount)),
            promo_bonus_type,
            Decimal(str(data["promo_bonus_value"])),
            Decimal(str(data["promo_max_bonus"])) if data.get("promo_max_bonus") else None,
            Decimal(str(data["promo_turnover_multiplier"])),
            data.get("promo_turnover_type", "BONUS"),
        )
        bonus_amount = float(bonus)
        credit_amount = float(total)
        turnover_required = float(turnover_req)
    else:
        bonus_amount = 0.0
        credit_amount = amount
        turnover_required = 0.0

    await state.update_data(
        deposit_amount=amount,
        bonus_amount=bonus_amount,
        credit_amount=credit_amount,
        turnover_required=turnover_required,
    )

    if bonus_amount > 0:
        credit_block = (
            f"🎁 优惠：{html.escape(promo_name)}\n"
            f"🎁 Bonus：RM {bonus_amount:.2f}\n"
            f"🪙 实际上分：RM {credit_amount:.2f}\n"
            f"💰 最低出款：RM {turnover_required:.2f}\n"
        )
    else:
        credit_block = (
            f"🎁 优惠：无优惠\n"
            f"🪙 实际上分：RM {credit_amount:.2f}\n"
        )

    banks = await get_active_banks(pool, provider)
    if not banks:
        await message.answer(
            await messages.get_message("deposit_no_bank_available", language=lang),
            reply_markup=build_back_cancel_keyboard(),
        )
        return

    await state.set_state(DepositStates.waiting_bank_select)
    text = await messages.get_message(
        "deposit_preview",
        language=lang,
        variables={
            "provider": html.escape(provider),
            "game_username": html.escape(game_username),
            "amount": amount,
            "credit_block": credit_block,
        },
    )
    await message.answer(text, reply_markup=build_bank_select_keyboard(banks), parse_mode="HTML")


@router.message(DepositStates.waiting_receipt, F.photo)
async def process_deposit_receipt(
    message: Message,
    state: FSMContext,
    pool: asyncpg.Pool,
    bot: Bot,
    config: Config,
    messages: BotMessageService,
) -> None:
    lang = message.from_user.language_code or "zh"
    data = await state.get_data()
    file_id = message.photo[-1].file_id

    promotion_id = data.get("promotion_id")
    if promotion_id:
        eligible = await can_member_claim_promotion(pool, data["user_id"], promotion_id)
        if not eligible:
            await state.clear()
            keyboard = await build_main_menu_keyboard_from_cms(pool, lang)
            await message.answer(
                "⚠️ 该优惠已无法申请（您已使用过此优惠或已有待审核申请）。\n\n"
                "请重新发起充值并选择其他优惠。",
                reply_markup=keyboard,
            )
            return

    req = await create_deposit_request(
        pool,
        user_id=data["user_id"],
        provider=data["provider"],
        game_username=data.get("game_username", ""),
        deposit_amount=data["deposit_amount"],
        bonus_type_id=None,
        promotion_id=data.get("promotion_id"),
        bonus_amount=data["bonus_amount"],
        credit_amount=data["credit_amount"],
        payment_bank=data["payment_bank"],       # now = casino bank name (set in cb_deposit_bank_select)
        receipt_file_id=file_id,
        receiving_bank_id=data.get("receiving_bank_id"),  # FK (migration 027; None if column absent)
    )
    await state.clear()

    provider = data["provider"]
    game_username = data.get("game_username", "")
    promo_name = data.get("promo_name", "无优惠")
    bonus_amount = data["bonus_amount"]
    credit_amount = data["credit_amount"]
    deposit_amount = data["deposit_amount"]
    payment_bank = data["payment_bank"]
    bank_holder_name = data["bank_holder_name"]
    phone = data["phone"]

    bonus_amount_line = f"🎁 Bonus\n+RM {bonus_amount:,.2f}\n\n" if bonus_amount > 0 else ""
    promo_display = html.escape(promo_name) if bonus_amount > 0 else "无优惠"

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
        f"🏷 优惠：\n{promo_display}\n\n"
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

    text = await messages.get_message(
        "deposit_submitted",
        language=lang,
        variables={"req_id": req["id"]},
    )
    keyboard = await build_main_menu_keyboard_from_cms(pool, lang)
    await message.answer(text, reply_markup=keyboard)


@router.message(DepositStates.waiting_receipt)
async def process_deposit_receipt_invalid(
    message: Message,
    messages: BotMessageService,
) -> None:
    lang = message.from_user.language_code or "zh"
    await message.answer(await messages.get_message("deposit_receipt_invalid", language=lang))


@router.callback_query(F.data == "dep_cancel")
async def cb_deposit_cancel(
    callback: CallbackQuery,
    state: FSMContext,
    messages: BotMessageService,
) -> None:
    lang = callback.from_user.language_code or "zh"
    await state.clear()
    await callback.message.edit_text(
        await messages.get_message("deposit_cancelled", language=lang)
    )
    await callback.answer()
