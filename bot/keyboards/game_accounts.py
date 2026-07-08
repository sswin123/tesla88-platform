from __future__ import annotations

import logging
from typing import Any, Sequence

import asyncpg
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
)

from bot.constants import PROVIDERS
from db.repositories.button_repo import get_buttons_by_group

logger = logging.getLogger(__name__)


def build_main_menu_keyboard() -> ReplyKeyboardMarkup:
    """Persistent 5×2 main menu shown to registered users (hardcoded fallback)."""
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="📋 我的资料"), KeyboardButton(text="🎮 我的游戏账号")],
            [KeyboardButton(text="💰 充值"), KeyboardButton(text="💸 提款")],
            [KeyboardButton(text="📜 充值记录"), KeyboardButton(text="📜 提款记录")],
            [KeyboardButton(text="🎁 优惠中心"), KeyboardButton(text="🎁 我的优惠")],
            [KeyboardButton(text="🔄 更换游戏账号"), KeyboardButton(text="📞 联系客服")],
        ],
        resize_keyboard=True,
        is_persistent=True,
    )


async def build_main_menu_keyboard_from_cms(
    pool: asyncpg.Pool,
    language: str = "zh",
) -> ReplyKeyboardMarkup:
    """Load main menu from bot_buttons CMS. Falls back to hardcoded on DB error or empty result."""
    try:
        buttons = await get_buttons_by_group(pool, "main_menu", language)
        active = [b for b in buttons if b["is_active"]]
        if not active:
            return build_main_menu_keyboard()

        rows_map: dict[int, list[dict]] = {}
        for btn in active:
            rows_map.setdefault(btn["row_order"], []).append(btn)

        keyboard = [
            [
                KeyboardButton(text=btn["label"])
                for btn in sorted(rows_map[r], key=lambda x: x["column_order"])
            ]
            for r in sorted(rows_map)
        ]
        return ReplyKeyboardMarkup(keyboard=keyboard, resize_keyboard=True, is_persistent=True)
    except Exception:
        logger.exception("build_main_menu_keyboard_from_cms: DB error, using hardcoded fallback")
        return build_main_menu_keyboard()


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
        p = acc["provider"]
        rows.append([
            InlineKeyboardButton(
                text=f"📋 复制{p}账号",
                callback_data=f"game_copy_user:{p}",
            ),
            InlineKeyboardButton(
                text=f"📋 复制{p}密码",
                callback_data=f"game_copy_pass:{p}",
            ),
        ])
        rows.append([
            InlineKeyboardButton(
                text=f"🔄 更换{p}",
                callback_data=f"game_change:{p}",
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
