from __future__ import annotations

from typing import Any, Sequence

from aiogram.types import (
    CopyTextButton,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
)

from bot.constants import PROVIDERS


def build_main_menu_keyboard() -> ReplyKeyboardMarkup:
    """Persistent 2x2 main menu shown to registered users."""
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="📋 我的资料"), KeyboardButton(text="🎮 我的游戏账号")],
            [KeyboardButton(text="🔄 更换游戏账号"), KeyboardButton(text="📞 联系客服")],
        ],
        resize_keyboard=True,
        is_persistent=True,
    )


def build_provider_select_keyboard(
    prefix: str,
    providers: Sequence[str] | None = None,
) -> InlineKeyboardMarkup:
    """2-column provider selection keyboard."""
    items = list(providers) if providers is not None else PROVIDERS
    rows: list[list[InlineKeyboardButton]] = []
    row: list[InlineKeyboardButton] = []
    for p in items:
        row.append(InlineKeyboardButton(text=p, callback_data=f"{prefix}:{p}"))
        if len(row) == 2:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_game_accounts_keyboard(
    accounts: Sequence[Any],
    claimable_providers: Sequence[str],
) -> InlineKeyboardMarkup:
    """Keyboard for 🎮 我的游戏账号 message.
    Assigned accounts: [📋 Copy username] [📋 Copy password] then [🔄 Change] row.
    Claimable providers: [🟢 Claim] rows at bottom.
    """
    rows: list[list[InlineKeyboardButton]] = []

    for acc in accounts:
        rows.append([
            InlineKeyboardButton(
                text="📋 复制账号",
                copy_text=CopyTextButton(text=acc["username"]),
            ),
            InlineKeyboardButton(
                text="📋 复制密码",
                copy_text=CopyTextButton(text=acc["password"]),
            ),
        ])
        rows.append([
            InlineKeyboardButton(
                text=f"🔄 更换 {acc['provider']}",
                callback_data=f"game_change:{acc['provider']}",
            )
        ])

    for provider in claimable_providers:
        rows.append([
            InlineKeyboardButton(
                text=f"🟢 领取 {provider}",
                callback_data=f"game_claim:{provider}",
            )
        ])

    return InlineKeyboardMarkup(inline_keyboard=rows)
