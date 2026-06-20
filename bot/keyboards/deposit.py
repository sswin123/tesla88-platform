from __future__ import annotations

from typing import Any, Sequence

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from bot.constants import PROVIDERS


def build_deposit_provider_keyboard(providers: Sequence[str]) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    row: list[InlineKeyboardButton] = []
    for p in providers:
        row.append(InlineKeyboardButton(text=p, callback_data=f"dep_prov:{p}"))
        if len(row) == 2:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    rows.append([InlineKeyboardButton(text="❌ 取消", callback_data="dep_cancel")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_bonus_keyboard(bonuses: Sequence[Any]) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    for b in bonuses:
        rows.append([
            InlineKeyboardButton(
                text=f"{b['name']}（最高 RM {b['max_bonus']:.0f}）",
                callback_data=f"dep_bonus:{b['id']}",
            )
        ])
    rows.append([InlineKeyboardButton(text="无优惠", callback_data="dep_bonus:none")])
    rows.append([InlineKeyboardButton(text="⬅️ 返回", callback_data="dep_back_prov")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_deposit_review_keyboard(request_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="✅ Approve", callback_data=f"dep_approve:{request_id}"),
        InlineKeyboardButton(text="❌ Reject", callback_data=f"dep_reject:{request_id}"),
    ]])
