from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

import asyncpg

from bot.filters import IsAdmin
from db.repositories.account_repo import (
    disable_account,
    enable_account,
    force_disable_account,
    get_account_by_provider_username,
)
from db.repositories.user_repo import get_user_by_id

router = Router()


def _parse_provider_username(text: str) -> tuple[str, str] | None:
    """Parse '/cmd Provider Username' → (provider, username) or None."""
    parts = text.strip().split(maxsplit=2)
    if len(parts) < 3:
        return None
    return parts[1], parts[2]


@router.message(Command("disable_account"), IsAdmin(["SUPER_ADMIN"]))
async def cmd_disable_account(message: Message, pool: asyncpg.Pool) -> None:
    parsed = _parse_provider_username(message.text or "")
    if not parsed:
        await message.answer("用法：/disable_account <Provider> <Username>\n例如：/disable_account 918Kiss 918001")
        return

    provider, username = parsed
    account = await get_account_by_provider_username(pool, provider, username)

    if not account:
        await message.answer(f"未找到账号：{provider} / {username}")
        return

    if account["status"] == "DISABLED":
        await message.answer(f"该账号已是停用状态：{provider} {username}")
        return

    if account["status"] == "AVAILABLE":
        await disable_account(pool, provider, username)
        await message.answer(f"✅ 账号已停用：{provider} {username}")
        return

    # ASSIGNED — need confirmation with user info
    user = await get_user_by_id(pool, account["assigned_user_id"]) if account["assigned_user_id"] else None
    user_info = (
        f"User ID：#{user['id']} | 电话：{user['phone']}"
        if user
        else f"User ID：#{account['assigned_user_id']}"
    )

    keyboard = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="✅ 强制停用并解除绑定",
            callback_data=f"game_force_disable:{account['id']}",
        ),
        InlineKeyboardButton(text="❌ 取消", callback_data="game_force_cancel"),
    ]])
    await message.answer(
        f"⚠️ 该账号目前已分配给会员：\n{user_info}\n\n请选择：",
        reply_markup=keyboard,
    )


@router.callback_query(F.data.startswith("game_force_disable:"))
async def handle_force_disable(callback: CallbackQuery, pool: asyncpg.Pool) -> None:
    try:
        account_pool_id = int(callback.data.split(":", 1)[1])
    except ValueError:
        await callback.answer("参数错误。", show_alert=True)
        return

    await force_disable_account(pool, account_pool_id)
    await callback.message.edit_text("✅ 账号已强制停用，绑定已解除。")
    await callback.answer()


@router.callback_query(F.data == "game_force_cancel")
async def handle_force_cancel(callback: CallbackQuery) -> None:
    await callback.message.edit_text("操作已取消。")
    await callback.answer()


@router.message(Command("enable_account"), IsAdmin(["SUPER_ADMIN"]))
async def cmd_enable_account(message: Message, pool: asyncpg.Pool) -> None:
    parsed = _parse_provider_username(message.text or "")
    if not parsed:
        await message.answer("用法：/enable_account <Provider> <Username>\n例如：/enable_account 918Kiss 918001")
        return

    provider, username = parsed
    account = await get_account_by_provider_username(pool, provider, username)

    if not account:
        await message.answer(f"未找到账号：{provider} / {username}")
        return

    if account["status"] != "DISABLED":
        await message.answer(
            f"该账号当前状态为 {account['status']}，无需启用。"
        )
        return

    await enable_account(pool, provider, username)
    await message.answer(f"✅ 账号已恢复可用：{provider} {username}")
