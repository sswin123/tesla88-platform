from __future__ import annotations

import html
import logging
from decimal import Decimal, InvalidOperation
from typing import Optional

import asyncpg
from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from bot.filters import IsAdmin
from bot.keyboards.promotions import (
    build_admin_promo_list_keyboard,
    build_bonus_type_keyboard,
    build_claim_action_keyboard,
    build_promo_type_keyboard,
    build_turnover_type_keyboard,
    games_label,
    promo_type_label,
    turnover_type_label,
)
from db.repositories.promotion_repo import (
    create_promotion,
    get_all_promotions,
    get_pending_claims,
    get_promotion_by_id,
    set_promotion_active,
    update_claim_status,
)

logger = logging.getLogger(__name__)
router = Router()

_ALL_GAMES = ["SLOT", "LIVE", "SPORTS", "LOTTERY"]

_GAME_LABELS: dict[str, str] = {
    "SLOT": "🎰 老虎机",
    "LIVE": "🎲 真人",
    "SPORTS": "⚽ 体育",
    "LOTTERY": "🎫 彩票",
}


# ── FSM for creating a new promotion ─────────────────────────────────────────


class PromoCreateStates(StatesGroup):
    name = State()
    description = State()
    promotion_type = State()
    bonus_type = State()
    bonus_value = State()
    min_deposit = State()
    max_bonus = State()
    turnover_multiplier = State()
    turnover_type = State()
    allowed_games = State()


# ── Admin main entry ──────────────────────────────────────────────────────────


@router.message(F.text == "🎁 Promotion Manager", IsAdmin())
async def handle_promo_manager(
    message: Message, pool: asyncpg.Pool
) -> None:
    promotions = await get_all_promotions(pool)
    count = len(promotions)
    active = sum(1 for p in promotions if p["is_active"])
    await message.answer(
        f"🎁 <b>Promotion Manager</b>\n\n"
        f"共 {count} 个优惠 | ✅ 启用 {active} | ⏸ 停用 {count - active}\n\n"
        f"点击优惠名称查看详情，或使用右侧按钮切换状态。",
        reply_markup=build_admin_promo_list_keyboard(promotions),
        parse_mode="HTML",
    )


# ── View single promotion (admin) ─────────────────────────────────────────────


@router.callback_query(F.data.startswith("apromo_view:"), IsAdmin())
async def cb_admin_promo_view(
    callback: CallbackQuery, pool: asyncpg.Pool
) -> None:
    promo_id = int(callback.data.split(":", 1)[1])
    promo = await get_promotion_by_id(pool, promo_id)
    if not promo:
        await callback.answer("⚠️ 优惠不存在", show_alert=True)
        return

    status = "✅ 启用" if promo["is_active"] else "⏸ 停用"
    max_bonus_line = (
        f"\n最高奖金：RM{promo['max_bonus']:,.2f}" if promo["max_bonus"] else ""
    )
    bonus_val = (
        f"{promo['bonus_value']:g}%"
        if promo["bonus_type"] == "PERCENTAGE"
        else f"RM{promo['bonus_value']:,.2f}"
    )
    text = (
        f"🎁 <b>{html.escape(promo['name'])}</b>\n\n"
        f"状态：{status}\n"
        f"类型：{promo_type_label(promo['promotion_type'])}\n"
        f"奖金：{bonus_val}{max_bonus_line}\n"
        f"最低充值：RM{promo['min_deposit']:,.2f}\n"
        f"流水倍数：×{promo['turnover_multiplier']:g}\n"
        f"适用游戏：{games_label(promo['allowed_games'])}\n\n"
        f"📝 {html.escape(promo['description'] or '无描述')}\n\n"
        f"创建：{promo['created_at'].strftime('%Y-%m-%d %H:%M')}"
    )

    toggle_text = "⏸ 停用此优惠" if promo["is_active"] else "▶️ 启用此优惠"
    from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(
                text=toggle_text,
                callback_data=f"apromo_toggle:{promo_id}",
            ),
        ],
        [
            InlineKeyboardButton(
                text="⬅️ 返回列表",
                callback_data="apromo_list",
            ),
        ],
    ])

    await callback.message.edit_text(text, reply_markup=kb, parse_mode="HTML")
    await callback.answer()


# ── Toggle active status ──────────────────────────────────────────────────────


@router.callback_query(F.data.startswith("apromo_toggle:"), IsAdmin())
async def cb_admin_promo_toggle(
    callback: CallbackQuery, pool: asyncpg.Pool
) -> None:
    promo_id = int(callback.data.split(":", 1)[1])
    promo = await get_promotion_by_id(pool, promo_id)
    if not promo:
        await callback.answer("⚠️ 优惠不存在", show_alert=True)
        return

    new_active = not promo["is_active"]
    await set_promotion_active(pool, promo_id, new_active)
    action = "✅ 已启用" if new_active else "⏸ 已停用"
    await callback.answer(f"{action}：{promo['name']}", show_alert=False)

    # Refresh the list
    promotions = await get_all_promotions(pool)
    await callback.message.edit_reply_markup(
        reply_markup=build_admin_promo_list_keyboard(promotions)
    )


# ── Back to promo list (admin) ────────────────────────────────────────────────


@router.callback_query(F.data == "apromo_list", IsAdmin())
async def cb_admin_promo_list(
    callback: CallbackQuery, pool: asyncpg.Pool
) -> None:
    promotions = await get_all_promotions(pool)
    count = len(promotions)
    active = sum(1 for p in promotions if p["is_active"])
    await callback.message.edit_text(
        f"🎁 <b>Promotion Manager</b>\n\n"
        f"共 {count} 个优惠 | ✅ 启用 {active} | ⏸ 停用 {count - active}",
        reply_markup=build_admin_promo_list_keyboard(promotions),
        parse_mode="HTML",
    )
    await callback.answer()


# ── Pending claims panel ──────────────────────────────────────────────────────


@router.callback_query(F.data == "apromo_claims", IsAdmin())
async def cb_admin_claims(callback: CallbackQuery, pool: asyncpg.Pool) -> None:
    claims = await get_pending_claims(pool)
    if not claims:
        await callback.message.edit_text(
            "📋 <b>待处理优惠申请</b>\n\n暂无待处理申请。",
            parse_mode="HTML",
            reply_markup=None,
        )
        await callback.answer()
        return

    from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
    rows = []
    for c in claims:
        rows.append([
            InlineKeyboardButton(
                text=f"#{c['id']} {c['first_name']} — RM{c['deposit_amount']:,.0f} {c['promo_name']}",
                callback_data=f"apromo_claim_view:{c['id']}",
            )
        ])
    rows.append([
        InlineKeyboardButton(text="⬅️ 返回", callback_data="apromo_list"),
    ])
    await callback.message.edit_text(
        f"📋 <b>待处理优惠申请</b>\n\n共 {len(claims)} 笔待处理：",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=rows),
        parse_mode="HTML",
    )
    await callback.answer()


@router.callback_query(F.data.startswith("apromo_claim_view:"), IsAdmin())
async def cb_admin_claim_view(
    callback: CallbackQuery, pool: asyncpg.Pool
) -> None:
    claim_id = int(callback.data.split(":", 1)[1])
    claims = await get_pending_claims(pool)
    claim = next((c for c in claims if c["id"] == claim_id), None)
    if not claim:
        await callback.answer("⚠️ 申请不存在或已处理", show_alert=True)
        return

    text = (
        f"📋 <b>优惠申请 #{claim['id']}</b>\n\n"
        f"👤 用户：{html.escape(claim['first_name'])}\n"
        f"📱 电话：{html.escape(claim['phone'])}\n\n"
        f"🎁 优惠：{html.escape(claim['promo_name'])}\n"
        f"💰 充值：RM{claim['deposit_amount']:,.2f}\n"
        f"🎯 奖金：RM{claim['bonus_amount']:,.2f}\n"
        f"📊 总额度：RM{claim['total_credit']:,.2f}\n"
        f"⭐ 流水要求：RM{claim['turnover_required']:,.2f}\n\n"
        f"🕒 申请时间：{claim['claimed_at'].strftime('%Y-%m-%d %H:%M:%S')}"
    )
    await callback.message.edit_text(
        text,
        reply_markup=build_claim_action_keyboard(claim_id),
        parse_mode="HTML",
    )
    await callback.answer()


@router.callback_query(F.data.startswith("apromo_claim_ok:"), IsAdmin())
async def cb_admin_claim_approve(
    callback: CallbackQuery, pool: asyncpg.Pool
) -> None:
    claim_id = int(callback.data.split(":", 1)[1])
    updated = await update_claim_status(pool, claim_id, "ACTIVE")
    if not updated:
        await callback.answer("⚠️ 申请不存在", show_alert=True)
        return
    await callback.answer("✅ 已批准，状态更新为 ACTIVE")
    logger.info("Claim approved claim=%s admin=%s", claim_id, callback.from_user.id)
    # Return to claims list
    await cb_admin_claims(callback, pool)


@router.callback_query(F.data.startswith("apromo_claim_cancel:"), IsAdmin())
async def cb_admin_claim_reject(
    callback: CallbackQuery, pool: asyncpg.Pool
) -> None:
    claim_id = int(callback.data.split(":", 1)[1])
    updated = await update_claim_status(pool, claim_id, "CANCELLED")
    if not updated:
        await callback.answer("⚠️ 申请不存在", show_alert=True)
        return
    await callback.answer("❌ 已拒绝，状态更新为 CANCELLED")
    logger.info("Claim rejected claim=%s admin=%s", claim_id, callback.from_user.id)
    await cb_admin_claims(callback, pool)


# ── Add new promotion (multi-step FSM) ────────────────────────────────────────


@router.callback_query(F.data == "apromo_add", IsAdmin())
async def cb_admin_promo_add(
    callback: CallbackQuery, state: FSMContext
) -> None:
    await state.set_state(PromoCreateStates.name)
    await callback.message.edit_text(
        "➕ <b>新增优惠</b>\n\n"
        "第 1 步：请输入优惠名称：\n\n"
        "<i>例如：50% Welcome Bonus</i>",
        parse_mode="HTML",
        reply_markup=None,
    )
    await callback.answer()


@router.message(PromoCreateStates.name, IsAdmin())
async def promo_add_name(message: Message, state: FSMContext) -> None:
    name = message.text.strip() if message.text else ""
    if not name:
        await message.answer("⚠️ 名称不能为空，请重新输入：")
        return
    await state.update_data(name=name)
    await state.set_state(PromoCreateStates.description)
    await message.answer(
        f"✅ 优惠名称：{name}\n\n"
        "第 2 步：请输入优惠描述（输入「-」跳过）："
    )


@router.message(PromoCreateStates.description, IsAdmin())
async def promo_add_description(message: Message, state: FSMContext) -> None:
    desc = (message.text or "").strip()
    await state.update_data(description="" if desc == "-" else desc)
    await state.set_state(PromoCreateStates.promotion_type)
    await message.answer(
        "第 3 步：请选择优惠类型：",
        reply_markup=build_promo_type_keyboard(),
    )


@router.callback_query(F.data.startswith("apct:"), IsAdmin())
async def promo_add_promo_type(
    callback: CallbackQuery, state: FSMContext
) -> None:
    ptype = callback.data.split(":", 1)[1]
    await state.update_data(promotion_type=ptype)
    await state.set_state(PromoCreateStates.bonus_type)
    await callback.message.edit_text(
        f"✅ 优惠类型：{promo_type_label(ptype)}\n\n"
        "第 4 步：请选择奖金类型：",
        reply_markup=build_bonus_type_keyboard(),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("apbt:"), IsAdmin())
async def promo_add_bonus_type(
    callback: CallbackQuery, state: FSMContext
) -> None:
    btype = callback.data.split(":", 1)[1]
    await state.update_data(bonus_type=btype)
    await state.set_state(PromoCreateStates.bonus_value)
    hint = "例如：50（代表 50%）" if btype == "PERCENTAGE" else "例如：88（代表 RM88）"
    await callback.message.edit_text(
        f"✅ 奖金类型：{'百分比' if btype == 'PERCENTAGE' else '固定金额'}\n\n"
        f"第 5 步：请输入奖金数值（{hint}）：",
        reply_markup=None,
    )
    await callback.answer()


@router.message(PromoCreateStates.bonus_value, IsAdmin())
async def promo_add_bonus_value(message: Message, state: FSMContext) -> None:
    try:
        val = Decimal(message.text.strip())
        if val <= 0:
            raise ValueError
    except (InvalidOperation, ValueError):
        await message.answer("⚠️ 请输入有效的数值（大于 0）：")
        return
    await state.update_data(bonus_value=str(val))
    await state.set_state(PromoCreateStates.min_deposit)
    await message.answer("第 6 步：请输入最低充值金额（例如：100）：")


@router.message(PromoCreateStates.min_deposit, IsAdmin())
async def promo_add_min_deposit(message: Message, state: FSMContext) -> None:
    try:
        val = Decimal(message.text.strip())
        if val < 0:
            raise ValueError
    except (InvalidOperation, ValueError):
        await message.answer("⚠️ 请输入有效金额（≥ 0）：")
        return
    await state.update_data(min_deposit=str(val))
    await state.set_state(PromoCreateStates.max_bonus)
    await message.answer(
        "第 7 步：请输入最高奖金上限（例如：300），\n无上限请输入「无」："
    )


@router.message(PromoCreateStates.max_bonus, IsAdmin())
async def promo_add_max_bonus(message: Message, state: FSMContext) -> None:
    raw = (message.text or "").strip()
    if raw in ("无", "-", "0"):
        await state.update_data(max_bonus=None)
    else:
        try:
            val = Decimal(raw)
            if val <= 0:
                raise ValueError
            await state.update_data(max_bonus=str(val))
        except (InvalidOperation, ValueError):
            await message.answer("⚠️ 请输入有效金额，或输入「无」表示无上限：")
            return
    await state.set_state(PromoCreateStates.turnover_multiplier)
    await message.answer("第 8 步：请输入流水倍数（例如：3）：")


@router.message(PromoCreateStates.turnover_multiplier, IsAdmin())
async def promo_add_turnover(message: Message, state: FSMContext) -> None:
    try:
        val = Decimal(message.text.strip())
        if val <= 0:
            raise ValueError
    except (InvalidOperation, ValueError):
        await message.answer("⚠️ 请输入有效倍数（> 0）：")
        return
    await state.update_data(turnover_multiplier=str(val))
    await state.set_state(PromoCreateStates.turnover_type)
    await message.answer(
        "第 9 步：请选择流水计算方式：\n\n"
        "📊 总额流水（BONUS）— 标准优惠\n"
        "   流水 = (充值 + 奖金) × 倍数\n\n"
        "💰 存款流水（DEPOSIT）— Buy 1 Free 1 类型\n"
        "   流水 = 充值 × 倍数",
        reply_markup=build_turnover_type_keyboard(),
    )


@router.callback_query(F.data.startswith("aptt:"), IsAdmin())
async def promo_add_turnover_type(
    callback: CallbackQuery, state: FSMContext
) -> None:
    ttype = callback.data.split(":", 1)[1]
    await state.update_data(turnover_type=ttype)
    await state.set_state(PromoCreateStates.allowed_games)
    await callback.message.edit_text(
        f"✅ 流水方式：{turnover_type_label(ttype)}\n\n"
        "第 10 步：请输入适用游戏（以逗号分隔）：\n\n"
        "可选：SLOT / LIVE / SPORTS / LOTTERY\n"
        "输入「ALL」代表全部游戏\n\n"
        "例如：SLOT,LIVE",
        reply_markup=None,
    )
    await callback.answer()


@router.message(PromoCreateStates.allowed_games, IsAdmin())
async def promo_add_games(
    message: Message, state: FSMContext, pool: asyncpg.Pool
) -> None:
    raw = (message.text or "").strip().upper()
    if raw == "ALL":
        games = _ALL_GAMES
    else:
        games = [g.strip() for g in raw.split(",") if g.strip() in _ALL_GAMES]
        if not games:
            await message.answer(
                "⚠️ 无效游戏类型。请从 SLOT / LIVE / SPORTS / LOTTERY 中选择，\n"
                "或输入「ALL」代表全部。"
            )
            return

    data = await state.get_data()
    await state.clear()

    max_bonus = Decimal(data["max_bonus"]) if data.get("max_bonus") else None

    promo = await create_promotion(
        pool,
        name=data["name"],
        description=data.get("description", ""),
        promotion_type=data["promotion_type"],
        bonus_type=data["bonus_type"],
        bonus_value=Decimal(data["bonus_value"]),
        min_deposit=Decimal(data["min_deposit"]),
        max_bonus=max_bonus,
        turnover_multiplier=Decimal(data["turnover_multiplier"]),
        turnover_type=data.get("turnover_type", "BONUS"),
        allowed_games=games,
    )

    bonus_val = (
        f"{promo['bonus_value']:g}%"
        if promo["bonus_type"] == "PERCENTAGE"
        else f"RM{promo['bonus_value']:,.2f}"
    )
    max_line = (
        f"\n最高奖金：RM{promo['max_bonus']:,.2f}" if promo["max_bonus"] else ""
    )
    await message.answer(
        f"✅ <b>优惠已创建！</b>\n\n"
        f"ID：#{promo['id']}\n"
        f"名称：{html.escape(promo['name'])}\n"
        f"类型：{promo_type_label(promo['promotion_type'])}\n"
        f"奖金：{bonus_val}{max_line}\n"
        f"最低充值：RM{promo['min_deposit']:,.2f}\n"
        f"流水方式：{turnover_type_label(promo['turnover_type'])} × {promo['turnover_multiplier']:g}\n"
        f"适用游戏：{games_label(promo['allowed_games'])}\n"
        f"状态：✅ 已启用",
        parse_mode="HTML",
    )
    logger.info(
        "Promotion created id=%s name=%s admin=%s",
        promo["id"],
        promo["name"],
        message.from_user.id,
    )
