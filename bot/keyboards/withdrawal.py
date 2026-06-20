from __future__ import annotations

from typing import Sequence

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup


def build_withdrawal_provider_keyboard(providers: Sequence[str]) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    row: list[InlineKeyboardButton] = []
    for p in providers:
        row.append(InlineKeyboardButton(text=p, callback_data=f"wd_prov:{p}"))
        if len(row) == 2:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    rows.append([InlineKeyboardButton(text="❌ 取消", callback_data="wd_cancel")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_withdrawal_confirm_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="✅ 确认提交", callback_data="wd_confirm"),
        InlineKeyboardButton(text="❌ 取消", callback_data="wd_cancel"),
    ]])


def build_withdrawal_review_keyboard(request_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="✅ Paid", callback_data=f"wd_approve:{request_id}"),
        InlineKeyboardButton(text="❌ Reject", callback_data=f"wd_reject:{request_id}"),
    ]])
