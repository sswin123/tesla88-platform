from __future__ import annotations

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

import asyncpg

from bot.filters import IsAdmin
from db.repositories.account_repo import get_account_stats

router = Router()


@router.message(Command("account_stats"), IsAdmin(["SUPER_ADMIN", "ADMIN"]))
async def cmd_account_stats(message: Message, pool: asyncpg.Pool) -> None:
    stats = await get_account_stats(pool)

    lines = ["📊 账号库存统计\n"]
    for s in stats:
        available = s["available"]
        status = "🔴 库存不足" if available == 0 else "🟢 正常"
        lines.append(
            f"{s['provider']}\n"
            f"总账号：{s['total']:,} | 可用：{available:,} | "
            f"已分配：{s['assigned']:,} | 停用：{s['disabled']:,}\n"
            f"状态：{status}\n"
        )

    await message.answer("\n".join(lines))
