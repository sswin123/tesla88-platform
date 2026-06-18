from __future__ import annotations

from aiogram import F, Router
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message

import asyncpg

from bot.config import Config
from bot.utils.formatters import format_user_info
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
