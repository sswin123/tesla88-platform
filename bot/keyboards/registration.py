from __future__ import annotations

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

BANKS = [
    "Maybank", "CIMB Bank", "Public Bank", "RHB Bank",
    "Hong Leong Bank", "AmBank", "Bank Islam", "Bank Muamalat",
    "Bank Rakyat", "BSN", "Affin Bank", "Alliance Bank",
    "OCBC Bank", "UOB Bank", "HSBC Bank", "Standard Chartered",
    "KFH", "Agrobank", "Al Rajhi Bank", "MBSB Bank",
]

EWALLETS = [
    "Touch 'n Go", "ShopeePay", "Boost", "GrabPay",
    "MAE Wallet", "BigPay", "Setel Wallet",
]

BANK_FULL_NAMES: dict[str, str] = {
    "Maybank": "Maybank",
    "CIMB Bank": "CIMB Bank",
    "Public Bank": "Public Bank",
    "RHB Bank": "RHB Bank",
    "Hong Leong Bank": "Hong Leong Bank",
    "AmBank": "AmBank",
    "Bank Islam": "Bank Islam",
    "Bank Muamalat": "Bank Muamalat",
    "Bank Rakyat": "Bank Rakyat",
    "BSN": "BSN (Bank Simpanan Nasional)",
    "Affin Bank": "Affin Bank",
    "Alliance Bank": "Alliance Bank",
    "OCBC Bank": "OCBC Bank",
    "UOB Bank": "UOB Bank",
    "HSBC Bank": "HSBC Bank",
    "Standard Chartered": "Standard Chartered Bank",
    "KFH": "Kuwait Finance House (KFH)",
    "Agrobank": "Agrobank",
    "Al Rajhi Bank": "Al Rajhi Bank",
    "MBSB Bank": "MBSB Bank",
    "Touch 'n Go": "Touch 'n Go eWallet",
    "ShopeePay": "ShopeePay",
    "Boost": "Boost",
    "GrabPay": "GrabPay",
    "MAE Wallet": "MAE Wallet",
    "BigPay": "BigPay",
    "Setel Wallet": "Setel Wallet",
    "Other": "Other",
}


def build_bank_keyboard(prefix: str = "bank") -> InlineKeyboardMarkup:
    """Build 2-column bank selection keyboard. 'Other' is full-width last row."""
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

    rows.append([InlineKeyboardButton(
        text="Other", callback_data=f"{prefix}:Other"
    )])

    return InlineKeyboardMarkup(inline_keyboard=rows)


def registration_start_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="✅ 注册会员", callback_data="register:start")
    ]])
