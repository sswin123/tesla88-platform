from __future__ import annotations

from aiogram import F, Router
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

import asyncpg

from bot.config import Config
from bot.constants import PROVIDERS
from bot.keyboards.game_accounts import build_game_accounts_keyboard
from bot.utils.formatters import format_user_info
from db.repositories.account_repo import (
    assign_account,
    get_provider_available_counts,
    get_user_game_accounts,
)
from db.repositories.user_repo import get_user_by_telegram_id

router = Router()


@router.message(F.text == "📋 我的资料")
async def handle_my_profile(message: Message, pool: asyncpg.Pool) -> None:
    user = await get_user_by_telegram_id(pool, message.from_user.id)
    if not user:
        await message.answer("您尚未注册。请发送 /start 开始注册。")
        return
    await message.answer(format_user_info(user))


@router.message(F.text == "📞 联系客服")
async def handle_contact_cs(message: Message, config: Config) -> None:
    cs_url = f"https://t.me/{config.cs_username}"
    keyboard = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="💬 联系客服", url=cs_url)
    ]])
    await message.answer(
        f"请联系在线客服：\n\n{cs_url}",
        reply_markup=keyboard,
    )


@router.message(F.text == "🎮 我的游戏账号")
async def handle_my_game_accounts(message: Message, pool: asyncpg.Pool) -> None:
    user = await get_user_by_telegram_id(pool, message.from_user.id)
    if not user:
        await message.answer("您尚未注册。请发送 /start 开始注册。")
        return

    accounts = await get_user_game_accounts(pool, user["id"])
    available_counts = await get_provider_available_counts(pool)

    assigned_providers = {acc["provider"] for acc in accounts}
    claimable = [
        p for p in PROVIDERS
        if p not in assigned_providers and available_counts.get(p, 0) > 0
    ]

    # Build message text
    lines = ["🎮 我的游戏账号"]
    for acc in accounts:
        lines.append(
            f"\n{acc['provider']}\n"
            f"账号：`{acc['username']}`\n"
            f"密码：`{acc['password']}`"
        )

    if claimable:
        lines.append(f"\n\n可领取（有库存）：{'、'.join(claimable)}")

    if not accounts and not claimable:
        lines.append("\n\n🎮 当前没有可领取的账号，请联系客服。")

    keyboard = build_game_accounts_keyboard(accounts, claimable)
    await message.answer(
        "\n".join(lines),
        reply_markup=keyboard,
        parse_mode="Markdown",
    )


@router.callback_query(F.data.startswith("game_claim:"))
async def handle_claim_account(
    callback: CallbackQuery, pool: asyncpg.Pool
) -> None:
    provider = callback.data.split(":", 1)[1]
    if provider not in PROVIDERS:
        await callback.answer("无效的平台。", show_alert=True)
        return

    user = await get_user_by_telegram_id(pool, callback.from_user.id)
    if not user:
        await callback.answer("您尚未注册。", show_alert=True)
        return

    account = await assign_account(pool, user["id"], provider)

    if not account:
        await callback.answer(
            "⚠️ 当前暂无可用账号，请稍后再试或联系客服。",
            show_alert=True,
        )
        return

    await callback.message.answer(
        f"✅ 领取成功\n\n"
        f"游戏平台：{provider}\n"
        f"账号：`{account['username']}`\n"
        f"密码：`{account['password']}`",
        parse_mode="Markdown",
    )
    await callback.answer()
