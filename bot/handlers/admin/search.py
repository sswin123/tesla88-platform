from __future__ import annotations

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

import asyncpg

from bot.filters import IsAdmin
from bot.utils.formatters import format_user_info
from bot.utils.phone import normalize_phone
from db.repositories.user_repo import (
    get_user_by_bank_account,
    get_user_by_id,
    get_user_by_phone,
)

router = Router()


@router.message(Command("search_phone"), IsAdmin())
async def cmd_search_phone(message: Message, pool: asyncpg.Pool):
    parts = (message.text or "").split(maxsplit=1)
    if len(parts) < 2:
        await message.answer("用法：/search_phone <电话号码>")
        return

    phone = normalize_phone(parts[1])
    if phone is None:
        await message.answer("电话号码格式不正确。")
        return

    user = await get_user_by_phone(pool, phone)
    if not user:
        await message.answer("未找到该电话号码的会员。")
        return

    await message.answer(format_user_info(user))


@router.message(Command("search_bank"), IsAdmin())
async def cmd_search_bank(message: Message, pool: asyncpg.Pool):
    parts = (message.text or "").split(maxsplit=1)
    if len(parts) < 2:
        await message.answer("用法：/search_bank <银行账号>")
        return

    bank_account = parts[1].strip()
    user = await get_user_by_bank_account(pool, bank_account)
    if not user:
        await message.answer("未找到该银行账号的会员。")
        return

    await message.answer(format_user_info(user))


@router.message(Command("search_user"), IsAdmin())
async def cmd_search_user(message: Message, pool: asyncpg.Pool):
    parts = (message.text or "").split(maxsplit=1)
    if len(parts) < 2:
        await message.answer("用法：/search_user <用户ID>")
        return

    try:
        user_id = int(parts[1])
    except ValueError:
        await message.answer("用户ID 必须是数字。")
        return

    user = await get_user_by_id(pool, user_id)
    if not user:
        await message.answer("未找到该用户ID的会员。")
        return

    await message.answer(format_user_info(user))
