from __future__ import annotations

from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
)

BANKS = [
    "Maybank", "CIMB Bank", "Public Bank", "RHB Bank",
    "Hong Leong Bank", "AmBank", "Bank Islam", "BSN",
]

EWALLETS: list[str] = [
    "Touch 'n Go", "ShopeePay", "Boost", "GrabPay", "MAE Wallet", "BigPay",
]

BANK_FULL_NAMES: dict[str, str] = {
    "Maybank": "Maybank",
    "CIMB Bank": "CIMB Bank",
    "Public Bank": "Public Bank",
    "RHB Bank": "RHB Bank",
    "Hong Leong Bank": "Hong Leong Bank",
    "AmBank": "AmBank",
    "Bank Islam": "Bank Islam",
    "BSN": "BSN (Bank Simpanan Nasional)",
    "Touch 'n Go": "Touch 'n Go eWallet",
    "ShopeePay": "ShopeePay",
    "Boost": "Boost",
    "GrabPay": "GrabPay",
    "MAE Wallet": "MAE Wallet",
    "BigPay": "BigPay",
    "Other": "Other",
}


def back_keyboard() -> ReplyKeyboardMarkup:
    """Single ⬅️ 返回 reply keyboard for text-input steps."""
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text="⬅️ 返回")]],
        resize_keyboard=True,
    )


def build_bank_keyboard(prefix: str = "bank") -> InlineKeyboardMarkup:
    """Build 2-column bank/ewallet keyboard with Other at bottom."""
    all_options = BANKS + EWALLETS
    rows: list[list[InlineKeyboardButton]] = []
    row: list[InlineKeyboardButton] = []

    for item in all_options:
        row.append(InlineKeyboardButton(
            text=item, callback_data=f"{prefix}:{item}"
        ))
        if len(row) == 2:
            rows.append(row)
            row = []

    if row:
        rows.append(row)

    rows.append([InlineKeyboardButton(text="Other", callback_data=f"{prefix}:Other")])

    return InlineKeyboardMarkup(inline_keyboard=rows)


def registration_start_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="✅ 注册会员", callback_data="register:start")
    ]])
