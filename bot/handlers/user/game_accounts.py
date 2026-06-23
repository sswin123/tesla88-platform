from __future__ import annotations

import html

from aiogram import F, Router
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

import asyncpg

from bot.config import Config
from bot.constants import PROVIDERS
from bot.keyboards.game_accounts import build_game_accounts_keyboard, build_provider_select_keyboard
from bot.utils.formatters import format_user_profile
from db.repositories.account_repo import (
    assign_account,
    get_provider_available_counts,
    get_user_game_accounts,
    is_cooldown_active,
    release_and_reassign,
)
from db.repositories.user_repo import get_user_by_telegram_id

router = Router()


@router.message(F.text == "📋 我的资料")
async def handle_my_profile(message: Message, pool: asyncpg.Pool) -> None:
    user = await get_user_by_telegram_id(pool, message.from_user.id)
    if not user:
        await message.answer("您尚未注册。请发送 /start 开始注册。")
        return
    await message.answer(format_user_profile(user))



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
            f"\n🎮 {html.escape(acc['provider'])}\n"
            f"👤 账号：<code>{html.escape(acc['username'])}</code>\n"
            f"🔑 密码：<code>{html.escape(acc['password'])}</code>"
        )

    if claimable:
        lines.append(f"\n\n可领取（有库存）：{'、'.join(html.escape(p) for p in claimable)}")

    if not accounts and not claimable:
        lines.append("\n\n🎮 当前没有可领取的账号，请联系客服。")

    keyboard = build_game_accounts_keyboard(accounts, claimable)
    await message.answer(
        "\n".join(lines),
        reply_markup=keyboard,
        parse_mode="HTML",
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
        f"🎮 平台：{html.escape(provider)}\n"
        f"👤 账号：<code>{html.escape(account['username'])}</code>\n"
        f"🔑 密码：<code>{html.escape(account['password'])}</code>",
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(F.text == "🔄 更换游戏账号")
async def handle_change_account_menu(
    message: Message, pool: asyncpg.Pool
) -> None:
    user = await get_user_by_telegram_id(pool, message.from_user.id)
    if not user:
        await message.answer("您尚未注册。请发送 /start 开始注册。")
        return

    accounts = await get_user_game_accounts(pool, user["id"])
    if not accounts:
        await message.answer("您尚未领取任何游戏账号。\n请先在「🎮 我的游戏账号」领取账号。")
        return

    providers_with_accounts = [acc["provider"] for acc in accounts]
    keyboard = build_provider_select_keyboard("game_change", providers_with_accounts)
    await message.answer("请选择要更换的游戏平台：", reply_markup=keyboard)


@router.callback_query(F.data.startswith("game_change:"))
async def handle_change_account(
    callback: CallbackQuery,
    pool: asyncpg.Pool,
    config: Config,
) -> None:
    provider = callback.data.split(":", 1)[1]
    if provider not in PROVIDERS:
        await callback.answer("无效的平台。", show_alert=True)
        return

    user = await get_user_by_telegram_id(pool, callback.from_user.id)
    if not user:
        await callback.answer("您尚未注册。", show_alert=True)
        return

    # Check cooldown
    in_cooldown, next_time = await is_cooldown_active(
        pool, user["id"], provider, config.account_change_cooldown_hours
    )
    if in_cooldown:
        next_str = next_time.strftime("%Y-%m-%d %H:%M UTC") if next_time else "稍后"
        await callback.answer(
            f"❌ {provider} 距上次更换不足 {config.account_change_cooldown_hours} 小时。\n"
            f"请于 {next_str} 后再试。",
            show_alert=True,
        )
        return

    # Attempt atomic release + reassign
    result = await release_and_reassign(pool, user["id"], provider)

    if result is None:
        # No new stock — fetch current account to show in error
        accounts = await get_user_game_accounts(pool, user["id"])
        current = next((a for a in accounts if a["provider"] == provider), None)
        current_info = (
            f"\n账号：{current['username']}\n密码：{current['password']}"
            if current
            else ""
        )
        await callback.answer(
            f"⚠️ 当前没有可用的新账号。\n您的现有账号保持不变。{current_info}",
            show_alert=True,
        )
        return

    old_username, new_account = result
    keyboard = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="📋 复制账号",
            callback_data=f"game_copy_user:{provider}",
        ),
        InlineKeyboardButton(
            text="📋 复制密码",
            callback_data=f"game_copy_pass:{provider}",
        ),
    ]])

    await callback.message.answer(
        f"✅ 更换成功\n\n"
        f"🎮 平台：{html.escape(provider)}\n\n"
        f"📤 旧账号：{html.escape(old_username)}\n"
        f"📥 新账号：<code>{html.escape(new_account['username'])}</code>\n"
        f"🔑 密码：<code>{html.escape(new_account['password'])}</code>",
        reply_markup=keyboard,
        parse_mode="HTML",
    )
    await callback.answer()


@router.callback_query(F.data.startswith("game_copy_user:"))
async def handle_copy_username(callback: CallbackQuery, pool: asyncpg.Pool) -> None:
    provider = callback.data.split(":", 1)[1]
    user = await get_user_by_telegram_id(pool, callback.from_user.id)
    if not user:
        await callback.answer("您尚未注册。", show_alert=True)
        return
    accounts = await get_user_game_accounts(pool, user["id"])
    account = next((a for a in accounts if a["provider"] == provider), None)
    if not account:
        await callback.answer("找不到该平台账号。", show_alert=True)
        return
    await callback.message.answer(f"账号：<code>{html.escape(account['username'])}</code>", parse_mode="HTML")
    await callback.answer()


@router.callback_query(F.data.startswith("game_copy_pass:"))
async def handle_copy_password(callback: CallbackQuery, pool: asyncpg.Pool) -> None:
    provider = callback.data.split(":", 1)[1]
    user = await get_user_by_telegram_id(pool, callback.from_user.id)
    if not user:
        await callback.answer("您尚未注册。", show_alert=True)
        return
    accounts = await get_user_game_accounts(pool, user["id"])
    account = next((a for a in accounts if a["provider"] == provider), None)
    if not account:
        await callback.answer("找不到该平台账号。", show_alert=True)
        return
    await callback.message.answer(f"密码：<code>{html.escape(account['password'])}</code>", parse_mode="HTML")
    await callback.answer()
