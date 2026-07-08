from __future__ import annotations

import logging

import asyncpg
from aiogram import F, Router
from aiogram.filters import Command, StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.types import Message

from bot.keyboards.game_accounts import build_main_menu_keyboard_from_cms
from bot.services import BotMessageService

logger = logging.getLogger(__name__)
router = Router()


@router.message(~StateFilter(None), F.text == "🏠 主菜单")
async def handle_global_home(
    message: Message,
    state: FSMContext,
    pool: asyncpg.Pool,
    messages: BotMessageService,
) -> None:
    """Return to main menu from any active FSM state."""
    current = await state.get_state()
    logger.info("Global home user=%s state=%s", message.from_user.id, current)
    await state.clear()
    lang = message.from_user.language_code or "zh"
    text = await messages.get_message("home_returned", language=lang)
    keyboard = await build_main_menu_keyboard_from_cms(pool, lang)
    await message.answer(text, reply_markup=keyboard)


@router.message(~StateFilter(None), F.text == "❌ 取消")
@router.message(~StateFilter(None), Command("cancel"))
async def handle_global_cancel(
    message: Message,
    state: FSMContext,
    pool: asyncpg.Pool,
    messages: BotMessageService,
) -> None:
    """Clear any active FSM state and return user to main menu."""
    current = await state.get_state()
    logger.info("Global cancel user=%s state=%s", message.from_user.id, current)
    await state.clear()
    lang = message.from_user.language_code or "zh"
    text = await messages.get_message("cancel_done", language=lang)
    keyboard = await build_main_menu_keyboard_from_cms(pool, lang)
    await message.answer(text, reply_markup=keyboard)
