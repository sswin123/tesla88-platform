from __future__ import annotations

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup


def build_livechat_cancel_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🔚 取消", callback_data="lc_cancel")]
        ]
    )


def build_livechat_request_keyboard(session_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="✅ 接受", callback_data=f"lc_accept:{session_id}"
                ),
                InlineKeyboardButton(
                    text="❌ 忽略", callback_data=f"lc_ignore:{session_id}"
                ),
            ]
        ]
    )


def build_livechat_end_keyboard(session_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="⏹ 结束会话", callback_data=f"lc_end:{session_id}"
                )
            ]
        ]
    )
