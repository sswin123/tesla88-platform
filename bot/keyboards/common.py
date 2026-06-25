from __future__ import annotations

from aiogram.types import KeyboardButton, ReplyKeyboardMarkup


def build_back_cancel_keyboard() -> ReplyKeyboardMarkup:
    """Three-button reply keyboard shown during all FSM text-input steps."""
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="⬅️ 返回")],
            [KeyboardButton(text="🏠 主菜单")],
            [KeyboardButton(text="❌ 取消")],
        ],
        resize_keyboard=True,
    )
