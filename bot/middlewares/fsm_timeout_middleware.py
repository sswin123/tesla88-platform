from __future__ import annotations

import logging
import time
from typing import Any, Awaitable, Callable, Dict

from aiogram import BaseMiddleware
from aiogram.fsm.context import FSMContext
from aiogram.types import Message

from bot.keyboards.game_accounts import build_main_menu_keyboard

logger = logging.getLogger(__name__)

FSM_TIMEOUT_SECONDS: int = 30 * 60  # 30 minutes


class FsmTimeoutMiddleware(BaseMiddleware):
    """Clears FSM state and notifies user after 30 minutes of inactivity."""

    async def __call__(
        self,
        handler: Callable[[Message, Dict[str, Any]], Awaitable[Any]],
        event: Message,
        data: Dict[str, Any],
    ) -> Any:
        state: FSMContext | None = data.get("state")
        if state is None:
            return await handler(event, data)

        current = await state.get_state()
        if current is None:
            return await handler(event, data)

        fsm_data = await state.get_data()
        last_seen: float | None = fsm_data.get("_fsm_last_seen")
        user_id = getattr(getattr(event, "from_user", None), "id", "?")

        logger.info(
            "FSM_MW user=%s state=%s last_seen=%s",
            user_id,
            current,
            f"{time.time() - last_seen:.0f}s ago" if last_seen else "never",
        )

        if last_seen is not None and (time.time() - last_seen) > FSM_TIMEOUT_SECONDS:
            await state.clear()
            logger.info("FSM_TIMEOUT user=%s state=%s", user_id, current)
            await event.answer(
                "⏰ 操作已超时，请重新开始。",
                reply_markup=build_main_menu_keyboard(),
            )
            return

        # Always update timestamp, but never let a storage error block the handler.
        try:
            await state.update_data(_fsm_last_seen=time.time())
        except Exception:
            logger.exception("FSM_MW update_data failed user=%s state=%s", user_id, current)

        return await handler(event, data)
