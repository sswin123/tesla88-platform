from __future__ import annotations

import logging

from aiogram.filters import BaseFilter
from aiogram.types import CallbackQuery, Message

logger = logging.getLogger(__name__)


class IsAdmin(BaseFilter):
    def __init__(self, roles: list[str] | None = None):
        self.roles = roles or ["SUPER_ADMIN", "ADMIN", "CS"]

    async def __call__(
        self,
        event: Message | CallbackQuery,
        admin_record=None,
    ) -> bool:
        user_id = event.from_user.id if event.from_user else None
        if not admin_record:
            logger.debug(
                "IsAdmin DENIED: user=%s no admin_record (required=%s)",
                user_id, self.roles,
            )
            return False
        result = admin_record["role"] in self.roles
        logger.debug(
            "IsAdmin %s: user=%s role=%s required=%s",
            "GRANTED" if result else "DENIED",
            user_id, admin_record["role"], self.roles,
        )
        return result
