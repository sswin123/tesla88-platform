from __future__ import annotations

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

import asyncpg

from bot.filters import IsAdmin
from db.repositories.user_repo import get_user_by_id, update_user_status

router = Router()


async def _get_user_id_from_command(message: Message, command: str) -> int | None:
    parts = (message.text or "").split()
    if len(parts) < 2:
        await message.answer(f"用法：/{command} <用户ID>")
        return None
    try:
        return int(parts[1])
    except ValueError:
        await message.answer("用户ID 必须是数字。")
        return None


@router.message(Command("freeze_user"), IsAdmin(["SUPER_ADMIN"]))
async def cmd_freeze_user(message: Message, pool: asyncpg.Pool):
    user_id = await _get_user_id_from_command(message, "freeze_user")
    if user_id is None:
        return

    user = await get_user_by_id(pool, user_id)
    if not user:
        await message.answer(f"未找到用户ID #{user_id}。")
        return

    if user["status"] == "FROZEN":
        await message.answer(f"会员 #{user_id} 已经是冻结状态。")
        return

    await update_user_status(pool, user_id, "FROZEN")
    await message.answer(f"🔴 已冻结会员 #{user_id}（{user['phone']}）")


@router.message(Command("unfreeze_user"), IsAdmin(["SUPER_ADMIN"]))
async def cmd_unfreeze_user(message: Message, pool: asyncpg.Pool):
    user_id = await _get_user_id_from_command(message, "unfreeze_user")
    if user_id is None:
        return

    user = await get_user_by_id(pool, user_id)
    if not user:
        await message.answer(f"未找到用户ID #{user_id}。")
        return

    if user["status"] == "ACTIVE":
        await message.answer(f"会员 #{user_id} 已经是正常状态。")
        return

    await update_user_status(pool, user_id, "ACTIVE")
    await message.answer(f"🟢 已解冻会员 #{user_id}（{user['phone']}）")
