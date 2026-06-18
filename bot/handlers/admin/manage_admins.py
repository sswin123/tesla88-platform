from __future__ import annotations

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

import asyncpg

from bot.filters import IsAdmin
from db.repositories.admin_repo import add_admin, list_admins, remove_admin

router = Router()

VALID_ROLES = {"ADMIN", "CS"}


@router.message(Command("add_admin"), IsAdmin(["SUPER_ADMIN"]))
async def cmd_add_admin(message: Message, pool: asyncpg.Pool):
    parts = (message.text or "").split()
    if len(parts) < 2:
        await message.answer(
            "用法：/add_admin <telegram_id> [ADMIN|CS]\n"
            "默认角色：ADMIN"
        )
        return

    try:
        target_id = int(parts[1])
    except ValueError:
        await message.answer("telegram_id 必须是数字。")
        return

    role = parts[2].upper() if len(parts) > 2 else "ADMIN"
    if role not in VALID_ROLES:
        await message.answer(f"角色必须是 ADMIN 或 CS，收到：{role}")
        return

    admin = await add_admin(pool, target_id, role, added_by=message.from_user.id)
    await message.answer(
        f"✅ 已添加管理员\n\n"
        f"Telegram ID：{admin['telegram_id']}\n"
        f"角色：{admin['role']}"
    )


@router.message(Command("remove_admin"), IsAdmin(["SUPER_ADMIN"]))
async def cmd_remove_admin(message: Message, pool: asyncpg.Pool):
    parts = (message.text or "").split()
    if len(parts) < 2:
        await message.answer("用法：/remove_admin <telegram_id>")
        return

    try:
        target_id = int(parts[1])
    except ValueError:
        await message.answer("telegram_id 必须是数字。")
        return

    if target_id == message.from_user.id:
        await message.answer("无法移除自己。")
        return

    success = await remove_admin(pool, target_id)
    if success:
        await message.answer(f"✅ 已移除管理员 {target_id}")
    else:
        await message.answer(
            f"操作失败：未找到该管理员，或该账号是超级管理员（无法移除）。"
        )


@router.message(Command("list_admins"), IsAdmin(["SUPER_ADMIN", "ADMIN"]))
async def cmd_list_admins(message: Message, pool: asyncpg.Pool):
    admins = await list_admins(pool)
    if not admins:
        await message.answer("暂无管理员记录。")
        return

    lines = ["👮 管理员列表\n"]
    for a in admins:
        created = (
            a["created_at"].strftime("%Y-%m-%d")
            if a["created_at"] else "未知"
        )
        lines.append(
            f"ID：{a['telegram_id']} | 角色：{a['role']} | 加入：{created}"
        )

    await message.answer("\n".join(lines))
