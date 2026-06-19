from __future__ import annotations

import asyncpg
from aiogram.filters import BaseFilter
from aiogram.types import CallbackQuery, Message

from db.repositories.admin_repo import get_admin_by_telegram_id


class IsAdmin(BaseFilter):
    def __init__(self, roles: list[str] | None = None):
        self.roles = roles or ["SUPER_ADMIN", "ADMIN", "CS"]

    async def __call__(
        self,
        event: Message | CallbackQuery,
        pool: asyncpg.Pool,
    ) -> bool:
        user_id = event.from_user.id if event.from_user else None
        if not user_id:
            return False
        record = await get_admin_by_telegram_id(pool, user_id)
        if not record:
            return False
        return record["role"] in self.roles
