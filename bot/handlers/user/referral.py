from __future__ import annotations

import asyncpg
import os
from aiogram import F, Router
from aiogram.types import Message

from bot.services import BotMessageService
from db.repositories.user_repo import get_user_by_telegram_id

router = Router()

_BOT_USERNAME = os.getenv("BOT_USERNAME", "")


@router.message(F.text == "🎁 我的邀请")
async def cmd_my_referral(
    message: Message,
    pool: asyncpg.Pool,
    messages: BotMessageService,
) -> None:
    user = await get_user_by_telegram_id(pool, message.from_user.id)
    if not user:
        await message.answer("请先完成注册。")
        return

    referral_code = user.get("referral_code") or user.get("public_id") or ""
    referral_count = await pool.fetchval(
        "SELECT COUNT(*) FROM users WHERE referred_by = $1", user["id"]
    ) or 0

    bot_username = _BOT_USERNAME
    invite_link = f"https://t.me/{bot_username}?start={referral_code}" if bot_username and referral_code else "—"

    text = (
        f"🎁 <b>我的邀请</b>\n\n"
        f"📌 邀请码：<code>{referral_code}</code>\n"
        f"🔗 邀请链接：\n<code>{invite_link}</code>\n\n"
        f"👥 已邀请好友：<b>{referral_count}</b> 人\n\n"
        f"分享邀请链接给好友，好友通过链接注册即可建立邀请关系。"
    )
    await message.answer(text, parse_mode="HTML")
