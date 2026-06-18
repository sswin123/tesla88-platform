from __future__ import annotations

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

import asyncpg

from bot.filters import IsAdmin
from db.repositories.user_repo import get_stats

router = Router()


@router.message(Command("stats"), IsAdmin())
async def cmd_stats(message: Message, pool: asyncpg.Pool):
    stats = await get_stats(pool)
    await message.answer(
        f"📊 系统统计\n\n"
        f"总会员数：{stats['total']:,}\n"
        f"今日注册：{stats['today']:,}\n"
        f"本周注册：{stats['this_week']:,}\n"
        f"符合免费资格：{stats['free_credit']:,}\n"
        f"已冻结会员：{stats['frozen']:,}\n"
        f"管理员人数：{stats['admin_count']:,}"
    )
