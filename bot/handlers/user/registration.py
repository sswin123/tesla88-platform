from __future__ import annotations

import secrets
import string

import bcrypt

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message, ReplyKeyboardRemove

import asyncpg

from bot.keyboards.game_accounts import build_main_menu_keyboard, build_main_menu_keyboard_from_cms
from bot.keyboards.registration import (
    BANK_FULL_NAMES,
    back_keyboard,
    build_bank_keyboard,
    registration_start_keyboard,
)
from bot.services import BotMessageService
from bot.utils.phone import normalize_phone
from db.repositories.free_list_repo import check_phone_in_free_list
from db.repositories.user_repo import (
    create_user,
    get_user_by_bank_account,
    get_user_by_phone,
    get_user_by_telegram_id,
)


def _generate_website_password(length: int = 10) -> str:
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def _hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()

router = Router()


class RegistrationStates(StatesGroup):
    waiting_phone = State()
    waiting_bank = State()
    waiting_bank_custom = State()
    waiting_bank_account = State()
    waiting_bank_holder = State()


@router.message(Command("start"))
async def cmd_start(
    message: Message,
    state: FSMContext,
    pool: asyncpg.Pool,
    messages: BotMessageService,
) -> None:
    await state.clear()
    lang = message.from_user.language_code or "zh"

    user = await get_user_by_telegram_id(pool, message.from_user.id)
    if user:
        status_emoji = "🟢" if user["status"] == "ACTIVE" else "🔴"
        text = await messages.get_message(
            "start_returning_user",
            language=lang,
            variables={
                "first_name": user["first_name"],
                "status_emoji": status_emoji,
                "status": user["status"],
            },
        )
        keyboard = await build_main_menu_keyboard_from_cms(pool, lang)
        await message.answer(text, reply_markup=keyboard)
        return

    # Parse referral code from deep link: /start REF_CODE
    parts = (message.text or "").split(maxsplit=1)
    if len(parts) == 2:
        candidate = parts[1].strip()
        if candidate:
            referrer = await pool.fetchrow(
                "SELECT id FROM users WHERE referral_code = $1 AND id != $2",
                candidate, message.from_user.id,
            )
            if referrer:
                await state.update_data(referrer_id=referrer["id"])

    text = await messages.get_message("start_new_user", language=lang)
    await message.answer(text, reply_markup=registration_start_keyboard())


@router.callback_query(F.data == "register:start")
async def cb_register_start(
    callback: CallbackQuery,
    state: FSMContext,
    pool: asyncpg.Pool,
    messages: BotMessageService,
) -> None:
    user = await get_user_by_telegram_id(pool, callback.from_user.id)
    if user:
        lang = callback.from_user.language_code or "zh"
        text = await messages.get_message("register_telegram_exists", language=lang)
        await callback.answer(text, show_alert=True)
        return

    lang = callback.from_user.language_code or "zh"
    await state.set_state(RegistrationStates.waiting_phone)
    text = await messages.get_message("register_enter_phone", language=lang)
    await callback.message.answer(text, reply_markup=back_keyboard())
    await callback.answer()


# ── Back navigation ───────────────────────────────────────────────────────────

@router.message(RegistrationStates.waiting_phone, F.text == "⬅️ 返回")
async def reg_back_to_start(
    message: Message,
    state: FSMContext,
    messages: BotMessageService,
) -> None:
    await state.clear()
    lang = message.from_user.language_code or "zh"
    text = await messages.get_message("start_new_user", language=lang)
    await message.answer(text, reply_markup=registration_start_keyboard())


@router.message(RegistrationStates.waiting_bank, F.text == "⬅️ 返回")
async def reg_back_to_phone(
    message: Message,
    state: FSMContext,
    messages: BotMessageService,
) -> None:
    data = await state.get_data()
    phone = data.get("phone", "")
    hint = f"（上次输入：{phone}）\n\n" if phone else ""
    await state.set_state(RegistrationStates.waiting_phone)
    lang = message.from_user.language_code or "zh"
    text = await messages.get_message(
        "register_back_to_phone",
        language=lang,
        variables={"hint": hint},
    )
    await message.answer(text, reply_markup=back_keyboard())


@router.message(RegistrationStates.waiting_bank_custom, F.text == "⬅️ 返回")
async def reg_back_to_bank_from_custom(
    message: Message,
    state: FSMContext,
    messages: BotMessageService,
) -> None:
    await state.set_state(RegistrationStates.waiting_bank)
    lang = message.from_user.language_code or "zh"
    text = await messages.get_message("register_back_to_bank", language=lang)
    await message.answer(text, reply_markup=build_bank_keyboard("reg_bank"))


@router.message(RegistrationStates.waiting_bank_account, F.text == "⬅️ 返回")
async def reg_back_to_bank(
    message: Message,
    state: FSMContext,
    messages: BotMessageService,
) -> None:
    await state.set_state(RegistrationStates.waiting_bank)
    lang = message.from_user.language_code or "zh"
    text = await messages.get_message("register_back_to_bank", language=lang)
    await message.answer(text, reply_markup=build_bank_keyboard("reg_bank"))


@router.message(RegistrationStates.waiting_bank_holder, F.text == "⬅️ 返回")
async def reg_back_to_account(
    message: Message,
    state: FSMContext,
    messages: BotMessageService,
) -> None:
    data = await state.get_data()
    bank_name = data.get("bank_name", "")
    await state.set_state(RegistrationStates.waiting_bank_account)
    lang = message.from_user.language_code or "zh"
    text = await messages.get_message(
        "register_back_to_account",
        language=lang,
        variables={"bank_name": bank_name},
    )
    await message.answer(text, reply_markup=back_keyboard())


# ── Forward navigation ────────────────────────────────────────────────────────

@router.message(RegistrationStates.waiting_phone)
async def process_phone(
    message: Message,
    state: FSMContext,
    pool: asyncpg.Pool,
    messages: BotMessageService,
) -> None:
    lang = message.from_user.language_code or "zh"
    phone = normalize_phone(message.text or "")
    if phone is None:
        text = await messages.get_message("register_phone_invalid", language=lang)
        await message.answer(text)
        return

    existing = await get_user_by_phone(pool, phone)
    if existing:
        await state.clear()
        text = await messages.get_message("register_phone_exists", language=lang)
        await message.answer(text, reply_markup=ReplyKeyboardRemove())
        return

    await state.update_data(phone=phone)
    await state.set_state(RegistrationStates.waiting_bank)
    text = await messages.get_message("register_select_bank", language=lang)
    await message.answer(text, reply_markup=build_bank_keyboard("reg_bank"))


# "Other" handler must come BEFORE the general reg_bank handler
@router.callback_query(RegistrationStates.waiting_bank, F.data == "reg_bank:Other")
async def process_bank_other(
    callback: CallbackQuery,
    state: FSMContext,
    messages: BotMessageService,
) -> None:
    await state.set_state(RegistrationStates.waiting_bank_custom)
    lang = callback.from_user.language_code or "zh"
    text = await messages.get_message("register_enter_custom_bank", language=lang)
    await callback.message.answer(text, reply_markup=back_keyboard())
    await callback.answer()


@router.callback_query(RegistrationStates.waiting_bank, F.data.startswith("reg_bank:"))
async def process_bank_selection(
    callback: CallbackQuery,
    state: FSMContext,
    messages: BotMessageService,
) -> None:
    bank_key = callback.data.split(":", 1)[1]
    bank_name = BANK_FULL_NAMES.get(bank_key, bank_key)
    await state.update_data(bank_name=bank_name)
    await state.set_state(RegistrationStates.waiting_bank_account)
    lang = callback.from_user.language_code or "zh"
    text = await messages.get_message(
        "register_bank_selected",
        language=lang,
        variables={"bank_name": bank_name},
    )
    await callback.message.answer(text, reply_markup=back_keyboard())
    await callback.answer()


@router.message(RegistrationStates.waiting_bank_custom)
async def process_bank_custom(
    message: Message,
    state: FSMContext,
    messages: BotMessageService,
) -> None:
    lang = message.from_user.language_code or "zh"
    bank_name = (message.text or "").strip()
    if not bank_name:
        text = await messages.get_message("register_bank_name_empty", language=lang)
        await message.answer(text)
        return
    await state.update_data(bank_name=bank_name)
    await state.set_state(RegistrationStates.waiting_bank_account)
    text = await messages.get_message(
        "register_bank_selected",
        language=lang,
        variables={"bank_name": bank_name},
    )
    await message.answer(text, reply_markup=back_keyboard())


@router.message(RegistrationStates.waiting_bank_account)
async def process_bank_account(
    message: Message,
    state: FSMContext,
    pool: asyncpg.Pool,
    messages: BotMessageService,
) -> None:
    lang = message.from_user.language_code or "zh"
    bank_account = (message.text or "").strip()
    if not bank_account:
        text = await messages.get_message("register_account_empty", language=lang)
        await message.answer(text)
        return

    existing = await get_user_by_bank_account(pool, bank_account)
    if existing:
        text = await messages.get_message("register_account_exists", language=lang)
        await message.answer(text)
        return

    await state.update_data(bank_account=bank_account)
    await state.set_state(RegistrationStates.waiting_bank_holder)
    text = await messages.get_message("register_enter_holder_name", language=lang)
    await message.answer(text, reply_markup=back_keyboard())


@router.message(RegistrationStates.waiting_bank_holder)
async def process_bank_holder(
    message: Message,
    state: FSMContext,
    pool: asyncpg.Pool,
    messages: BotMessageService,
) -> None:
    lang = message.from_user.language_code or "zh"
    bank_holder_name = (message.text or "").strip()
    if not bank_holder_name:
        text = await messages.get_message("register_holder_name_empty", language=lang)
        await message.answer(text)
        return

    data = await state.get_data()
    await state.clear()

    eligible = await check_phone_in_free_list(pool, data["phone"])

    website_password = _generate_website_password()
    website_password_hash = _hash_password(website_password)

    try:
        await create_user(
            pool,
            telegram_id=message.from_user.id,
            telegram_username=message.from_user.username,
            first_name=message.from_user.first_name or "Unknown",
            phone=data["phone"],
            bank_name=data["bank_name"],
            bank_account=data["bank_account"],
            bank_holder_name=bank_holder_name,
            eligible_free_credit=eligible,
            website_password_hash=website_password_hash,
            referred_by=data.get("referrer_id"),
        )
    except asyncpg.exceptions.UniqueViolationError:
        await state.clear()
        text = await messages.get_message("register_conflict_error", language=lang)
        await message.answer(text, reply_markup=ReplyKeyboardRemove())
        return

    text = await messages.get_message(
        "register_success",
        language=lang,
        variables={
            "phone": data["phone"],
            "bank_name": data["bank_name"],
            "bank_account": data["bank_account"],
            "bank_holder_name": bank_holder_name,
        },
    )
    keyboard = await build_main_menu_keyboard_from_cms(pool, lang)
    await message.answer(text, reply_markup=keyboard)

    # Send website login credentials in a separate message
    creds_text = (
        f"🌐 *网站登录信息*\n\n"
        f"账号（手机号）：`{data['phone']}`\n"
        f"密码：`{website_password}`\n\n"
        f"请保存好您的登录信息，密码可在网站个人中心修改。"
    )
    await message.answer(creds_text, parse_mode="Markdown")
