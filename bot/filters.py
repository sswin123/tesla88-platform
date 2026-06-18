from __future__ import annotations

from aiogram.filters import BaseFilter
from aiogram.types import CallbackQuery, Message


class IsAdmin(BaseFilter):
    def __init__(self, roles: list[str] | None = None):
        self.roles = roles or ["SUPER_ADMIN", "ADMIN", "CS"]

    async def __call__(
        self,
        event: Message | CallbackQuery,
        admin_record=None,
    ) -> bool:
        if not admin_record:
            return False
        return admin_record["role"] in self.roles
