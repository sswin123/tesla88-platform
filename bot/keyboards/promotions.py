from __future__ import annotations

from typing import Sequence

import asyncpg
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

_GAME_LABELS: dict[str, str] = {
    "SLOT": "🎰 老虎机",
    "LIVE": "🎲 真人",
    "SPORTS": "⚽ 体育",
    "LOTTERY": "🎫 彩票",
}

_PROMO_TYPE_LABELS: dict[str, str] = {
    "FIRST_DEPOSIT": "🥇 首充优惠",
    "DAILY": "📅 每日优惠",
    "UNLIMITED": "♾️ 无限优惠",
    "MANUAL": "🎫 手动优惠",
    "WEEKLY": "📆 每周优惠",
}

_PROMO_TYPE_OPTIONS = [
    ("🥇 首充优惠 (FIRST_DEPOSIT)", "FIRST_DEPOSIT"),
    ("📅 每日优惠 (DAILY)", "DAILY"),
    ("♾️ 无限优惠 (UNLIMITED)", "UNLIMITED"),
    ("📆 每周优惠 (WEEKLY)", "WEEKLY"),
    ("🎫 手动优惠 (MANUAL)", "MANUAL"),
]

_TURNOVER_TYPE_OPTIONS = [
    ("📊 总额流水 (BONUS) — 推荐", "BONUS"),
    ("💰 存款流水 (DEPOSIT)", "DEPOSIT"),
]

_BONUS_TYPE_OPTIONS = [
    ("📊 百分比 (PERCENTAGE)", "PERCENTAGE"),
    ("💵 固定金额 (FIXED)", "FIXED"),
]


def games_label(games: list[str]) -> str:
    if not games:
        return "全部游戏"
    return " | ".join(_GAME_LABELS.get(g, g) for g in games)


def promo_type_label(ptype: str) -> str:
    return _PROMO_TYPE_LABELS.get(ptype, ptype)


def build_promo_list_keyboard(
    promotions: Sequence[asyncpg.Record],
) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    for p in promotions:
        rows.append([
            InlineKeyboardButton(
                text=f"🎁 {p['name']}",
                callback_data=f"promo:{p['id']}",
            )
        ])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_promo_detail_keyboard(promo_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(
                text="🧮 计算奖金",
                callback_data=f"promo_calc:{promo_id}",
            ),
            InlineKeyboardButton(
                text="💰 立即充值",
                callback_data=f"dep_from_promo:{promo_id}",
            ),
        ],
        [
            InlineKeyboardButton(text="⬅️ 返回优惠列表", callback_data="promo_list"),
        ],
    ])


def build_promo_calc_result_keyboard(promo_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(
                text="💰 立即充值",
                callback_data=f"dep_from_promo:{promo_id}",
            ),
            InlineKeyboardButton(
                text="🔄 重新计算",
                callback_data=f"promo_calc:{promo_id}",
            ),
        ],
        [
            InlineKeyboardButton(
                text="⬅️ 返回优惠列表",
                callback_data="promo_list",
            ),
        ],
    ])


def build_admin_promo_list_keyboard(
    promotions: Sequence[asyncpg.Record],
) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    for p in promotions:
        status_icon = "✅" if p["is_active"] else "⏸"
        toggle_text = "⏸ 停用" if p["is_active"] else "▶️ 启用"
        rows.append([
            InlineKeyboardButton(
                text=f"{status_icon} {p['name']}",
                callback_data=f"apromo_view:{p['id']}",
            ),
            InlineKeyboardButton(
                text=toggle_text,
                callback_data=f"apromo_toggle:{p['id']}",
            ),
        ])
    rows.append([
        InlineKeyboardButton(text="➕ 新增优惠", callback_data="apromo_add"),
        InlineKeyboardButton(text="📋 待处理申请", callback_data="apromo_claims"),
    ])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def turnover_type_label(ttype: str) -> str:
    return "💰 存款流水" if ttype == "DEPOSIT" else "📊 总额流水"


def build_promo_type_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=label, callback_data=f"apct:{val}")]
        for label, val in _PROMO_TYPE_OPTIONS
    ])


def build_turnover_type_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=label, callback_data=f"aptt:{val}")]
        for label, val in _TURNOVER_TYPE_OPTIONS
    ])


def build_bonus_type_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=label, callback_data=f"apbt:{val}")]
        for label, val in _BONUS_TYPE_OPTIONS
    ])


def build_claim_action_keyboard(claim_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(
                text="✅ 批准", callback_data=f"apromo_claim_ok:{claim_id}"
            ),
            InlineKeyboardButton(
                text="❌ 拒绝", callback_data=f"apromo_claim_cancel:{claim_id}"
            ),
        ],
        [
            InlineKeyboardButton(
                text="⬅️ 返回申请列表", callback_data="apromo_claims"
            ),
        ],
    ])
