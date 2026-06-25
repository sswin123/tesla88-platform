from __future__ import annotations

import html
import logging
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Optional

import asyncpg
from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message, ReplyKeyboardRemove

from bot.constants import BONUS_DISCLAIMER
from bot.keyboards.common import build_back_cancel_keyboard
from bot.keyboards.promotions import (
    build_promo_calc_result_keyboard,
    build_promo_detail_keyboard,
    build_promo_list_keyboard,
    games_label,
    promo_type_label,
)
from db.repositories.promotion_repo import (
    get_active_promotions,
    get_promotion_by_id,
    get_user_active_claims,
)
from db.repositories.user_repo import get_user_by_telegram_id

logger = logging.getLogger(__name__)
router = Router()


class PromoStates(StatesGroup):
    waiting_deposit_amount = State()


# ── Pure calculation logic (importable for tests) ─────────────────────────────


def calculate_bonus(
    deposit: Decimal,
    bonus_type: str,
    bonus_value: Decimal,
    max_bonus: Optional[Decimal],
    turnover_multiplier: Decimal,
    turnover_type: str = "BONUS",
) -> tuple[Decimal, Decimal, Decimal]:
    """Return (bonus_amount, total_credit, turnover_required).

    turnover_type='BONUS'   → turnover = total_credit × multiplier  (standard)
    turnover_type='DEPOSIT' → turnover = deposit × multiplier       (Buy 1 Free 1)
    """
    if bonus_type == "PERCENTAGE":
        bonus = deposit * (bonus_value / Decimal(100))
    else:
        bonus = bonus_value

    if max_bonus is not None and bonus > max_bonus:
        bonus = max_bonus

    bonus = bonus.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    total = deposit + bonus
    base = deposit if turnover_type == "DEPOSIT" else total
    turnover = (base * turnover_multiplier).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    return bonus, total, turnover


# ── Display helpers ───────────────────────────────────────────────────────────


def _bonus_display(bonus_type: str, bonus_value: Decimal) -> str:
    if bonus_type == "PERCENTAGE":
        return f"{bonus_value:g}%"
    return f"RM{bonus_value:,.2f}"


def _build_detail_text(promo: asyncpg.Record) -> str:
    """Build promotion detail page with built-in RM100 example calculation."""
    ttype = promo.get("turnover_type", "BONUS")
    turnover_base_label = "存款" if ttype == "DEPOSIT" else "总额度"
    max_bonus_line = (
        f"\n💎 最高奖金：RM{promo['max_bonus']:,.2f}" if promo["max_bonus"] else ""
    )

    # Built-in example using RM100 or min_deposit if > 100
    example_deposit = max(Decimal("100"), promo["min_deposit"])
    ex_bonus, ex_total, ex_turnover = calculate_bonus(
        example_deposit,
        promo["bonus_type"],
        promo["bonus_value"],
        promo["max_bonus"],
        promo["turnover_multiplier"],
        ttype,
    )
    example_label = f"RM{example_deposit:,.0f}"

    return (
        f"🎁 <b>{html.escape(promo['name'])}</b>\n\n"
        f"{html.escape(promo['description'] or '')}\n\n"
        f"━━━━━━━━━━━━\n\n"
        f"📊 优惠类型：{promo_type_label(promo['promotion_type'])}\n"
        f"🎯 奖金比例：{_bonus_display(promo['bonus_type'], promo['bonus_value'])}"
        f"{max_bonus_line}\n"
        f"💰 最低充值：RM{promo['min_deposit']:,.2f}\n"
        f"🏦 最低出款：RM{ex_turnover:,.2f}\n"
        f"🔄 流水要求：{turnover_base_label} × {promo['turnover_multiplier']:g}\n"
        f"🎮 适用游戏：{games_label(promo['allowed_games'])}\n\n"
        f"━━━━━━━━━━━━\n\n"
        f"{BONUS_DISCLAIMER}\n\n"
        f"━━━━━━━━━━━━\n\n"
        f"📌 <b>举例说明</b>\n\n"
        f"如果您充值 {example_label}：\n\n"
        f"• 奖金：RM{ex_bonus:,.2f}\n"
        f"• 总额度：RM{ex_total:,.2f}\n"
        f"• 最低出款：RM{ex_turnover:,.2f}\n\n"
        f"━━━━━━━━━━━━"
    )


# ── Menu: 优惠中心 ─────────────────────────────────────────────────────────────


@router.message(F.text == "🎁 优惠中心")
async def handle_promo_center(
    message: Message, pool: asyncpg.Pool, state: FSMContext
) -> None:
    await state.clear()
    promotions = await get_active_promotions(pool)
    if not promotions:
        await message.answer("目前暂无进行中的优惠。敬请期待！")
        return
    await message.answer(
        "🎁 <b>优惠中心</b>\n\n请选择您感兴趣的优惠：",
        reply_markup=build_promo_list_keyboard(promotions),
        parse_mode="HTML",
    )


# ── Menu: 我的优惠 ─────────────────────────────────────────────────────────────


@router.message(F.text == "🎁 我的优惠")
async def handle_my_promos(message: Message, pool: asyncpg.Pool) -> None:
    user = await get_user_by_telegram_id(pool, message.from_user.id)
    if not user:
        await message.answer("您尚未注册。请发送 /start 开始注册。")
        return
    await _send_my_promos(message.answer, pool, user["id"])


# ── Inline: back to list ───────────────────────────────────────────────────────


@router.callback_query(F.data == "promo_list")
async def cb_promo_list(
    callback: CallbackQuery, pool: asyncpg.Pool, state: FSMContext
) -> None:
    await state.clear()
    promotions = await get_active_promotions(pool)
    await callback.message.edit_text(
        "🎁 <b>优惠中心</b>\n\n请选择您感兴趣的优惠：",
        reply_markup=build_promo_list_keyboard(promotions),
        parse_mode="HTML",
    )
    await callback.answer()


# ── Inline: promotion detail ──────────────────────────────────────────────────


@router.callback_query(F.data.startswith("promo:"))
async def cb_promo_detail(
    callback: CallbackQuery, pool: asyncpg.Pool, state: FSMContext
) -> None:
    await state.clear()
    promo_id = int(callback.data.split(":", 1)[1])
    promo = await get_promotion_by_id(pool, promo_id)
    if not promo or not promo["is_active"]:
        await callback.answer("⚠️ 该优惠已下线", show_alert=True)
        return

    await callback.message.edit_text(
        _build_detail_text(promo),
        reply_markup=build_promo_detail_keyboard(promo_id),
        parse_mode="HTML",
    )
    await callback.answer()


# ── Inline: open calculator ────────────────────────────────────────────────────


@router.callback_query(F.data.startswith("promo_calc:"))
async def cb_promo_calculate(
    callback: CallbackQuery, pool: asyncpg.Pool, state: FSMContext
) -> None:
    promo_id = int(callback.data.split(":", 1)[1])
    promo = await get_promotion_by_id(pool, promo_id)
    if not promo or not promo["is_active"]:
        await callback.answer("⚠️ 该优惠已下线", show_alert=True)
        return

    await state.set_state(PromoStates.waiting_deposit_amount)
    await state.update_data(promo_id=promo_id)

    await callback.message.edit_text(
        f"🧮 <b>{html.escape(promo['name'])}</b>\n"
        f"最低充值：RM{promo['min_deposit']:,.2f}",
        parse_mode="HTML",
        reply_markup=None,
    )
    await callback.message.answer(
        "🧮 请输入充值金额（RM）\n\n例如：\n100\n300\n500",
        reply_markup=build_back_cancel_keyboard(),
    )
    await callback.answer()


# ── FSM: back from calculator → promo detail ──────────────────────────────────


@router.message(PromoStates.waiting_deposit_amount, F.text == "⬅️ 返回")
async def promo_back_from_calc(
    message: Message, state: FSMContext, pool: asyncpg.Pool
) -> None:
    data = await state.get_data()
    promo_id = data.get("promo_id")
    await state.clear()

    if promo_id:
        promo = await get_promotion_by_id(pool, promo_id)
        if promo and promo["is_active"]:
            await message.answer("⬅️ 返回", reply_markup=ReplyKeyboardRemove())
            await message.answer(
                _build_detail_text(promo),
                reply_markup=build_promo_detail_keyboard(promo_id),
                parse_mode="HTML",
            )
            return

    from bot.keyboards.game_accounts import build_main_menu_keyboard
    await message.answer("⬅️ 返回", reply_markup=ReplyKeyboardRemove())
    await message.answer("❌ 优惠已失效，已返回主菜单。", reply_markup=build_main_menu_keyboard())


# ── FSM: receive deposit amount and calculate ─────────────────────────────────


@router.message(PromoStates.waiting_deposit_amount)
async def handle_deposit_input(
    message: Message, pool: asyncpg.Pool, state: FSMContext
) -> None:
    raw = (message.text or "").strip().lstrip("RrMm").strip()
    try:
        deposit = Decimal(raw)
        if deposit <= 0:
            raise ValueError
    except (InvalidOperation, ValueError):
        await message.answer(
            "⚠️ 输入格式错误\n\n请输入正确金额，例如：\n\n100\n300\n500"
        )
        return

    data = await state.get_data()
    promo_id = data.get("promo_id")
    promo = await get_promotion_by_id(pool, promo_id)
    if not promo or not promo["is_active"]:
        await state.clear()
        await message.answer("⚠️ 优惠已失效，请重新选择。")
        return

    min_dep: Decimal = promo["min_deposit"]
    if deposit < min_dep:
        await message.answer(
            f"⚠️ 此优惠最低充值为 RM{min_dep:,.2f}\n\n请重新输入金额："
        )
        return


    max_bonus: Optional[Decimal] = promo["max_bonus"]
    ttype = promo.get("turnover_type", "BONUS")
    bonus, total, turnover = calculate_bonus(
        deposit,
        promo["bonus_type"],
        promo["bonus_value"],
        max_bonus,
        promo["turnover_multiplier"],
        ttype,
    )

    await state.clear()

    turnover_base_label = "存款" if ttype == "DEPOSIT" else "总额度"
    turnover_base_val = deposit if ttype == "DEPOSIT" else total
    result_text = (
        f"🎁 <b>{html.escape(promo['name'])}</b>\n\n"
        f"━━━━━━━━━━━━\n\n"
        f"💰 充值金额：\nRM{deposit:,.2f}\n\n"
        f"🎯 奖金：\nRM{bonus:,.2f}\n\n"
        f"📊 总额度：\nRM{total:,.2f}\n\n"
        f"🎁 最低出款（{turnover_base_label}）：\n"
        f"RM{turnover_base_val:,.2f} × {promo['turnover_multiplier']:g}\n\n"
        f"⭐ 需完成出款：\nRM{turnover:,.2f}\n\n"
        f"🎮 适用游戏：\n{games_label(promo['allowed_games'])}\n\n"
        f"━━━━━━━━━━━━\n\n"
        f"{BONUS_DISCLAIMER}\n\n"
        f"━━━━━━━━━━━━\n"
        f"⚠️ <i>仅供参考。实际奖金在充值审核通过后发放。</i>"
    )

    await message.answer(
        result_text,
        reply_markup=build_promo_calc_result_keyboard(promo_id),
        parse_mode="HTML",
    )
    logger.info(
        "Promo calc session=%s promo=%s deposit=%s bonus=%s turnover=%s",
        message.from_user.id,
        promo_id,
        deposit,
        bonus,
        turnover,
    )


# ── Helper: my promos render ──────────────────────────────────────────────────


async def _send_my_promos(answer_fn, pool: asyncpg.Pool, user_id: int) -> None:
    claims = await get_user_active_claims(pool, user_id)
    if not claims:
        await answer_fn(
            "🎁 <b>我的优惠</b>\n\n您目前没有进行中的优惠。\n\n"
            "点击「🎁 优惠中心」查看可选择的优惠！",
            parse_mode="HTML",
        )
        return

    status_icons = {
        "ACTIVE": "🟢", "COMPLETED": "✅",
    }
    lines = ["🎁 <b>我的优惠</b>\n"]
    for c in claims:
        completed: Decimal = c["turnover_completed"] or Decimal("0")
        required: Decimal = c["turnover_required"]
        still_needed = max(Decimal("0"), required - completed)
        icon = status_icons.get(c["status"], "❓")
        status_label = "进行中" if c["status"] == "ACTIVE" else "已完成"
        lines.append(
            f"━━━━━━━━━━━━\n"
            f"🎁 {html.escape(c['promo_name'])}\n"
            f"状态：{icon} {status_label}\n"
            f"充值：RM{c['deposit_amount']:,.2f}\n"
            f"奖金：RM{c['bonus_amount']:,.2f}\n"
            f"总额度：RM{c['total_credit']:,.2f}\n"
            f"最低出款进度：RM{completed:,.2f} / RM{required:,.2f}\n"
            f"还需出款：RM{still_needed:,.2f}"
        )
    await answer_fn("\n".join(lines), parse_mode="HTML")
