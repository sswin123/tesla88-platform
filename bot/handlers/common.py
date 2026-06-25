from __future__ import annotations

import logging

from aiogram import F, Router
from aiogram.filters import Command, StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.types import Message

from bot.keyboards.game_accounts import build_main_menu_keyboard

logger = logging.getLogger(__name__)
router = Router()


@router.message(~StateFilter(None), F.text == "🏠 主菜单")
async def handle_global_home(message: Message, state: FSMContext) -> None:
    """Return to main menu from any active FSM state."""
    current = await state.get_state()
    logger.info("Global home user=%s state=%s", message.from_user.id, current)
    await state.clear()
    await message.answer("🏠 已返回主菜单", reply_markup=build_main_menu_keyboard())


@router.message(~StateFilter(None), F.text == "❌ 取消")
@router.message(~StateFilter(None), Command("cancel"))
async def handle_global_cancel(message: Message, state: FSMContext) -> None:
    """Clear any active FSM state and return user to main menu."""
    current = await state.get_state()
    logger.info("Global cancel user=%s state=%s", message.from_user.id, current)
    await state.clear()
    await message.answer("❌ 已取消操作", reply_markup=build_main_menu_keyboard())
