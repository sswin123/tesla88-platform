from __future__ import annotations

from typing import Any, Awaitable, Callable

import asyncpg
from aiogram import BaseMiddleware
from aiogram.types import TelegramObject

from db.repositories.admin_repo import get_admin_by_telegram_id


class AdminMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        user = data.get("event_from_user")
        pool: asyncpg.Pool | None = data.get("pool")

        if user and pool:
            data["admin_record"] = await get_admin_by_telegram_id(pool, user.id)
        else:
            data["admin_record"] = None

        return await handler(event, data)
