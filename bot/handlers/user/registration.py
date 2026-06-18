from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

import asyncpg

from bot.keyboards.registration import (
    BANK_FULL_NAMES,
    build_bank_keyboard,
    registration_start_keyboard,
)
from bot.utils.phone import normalize_phone
from db.repositories.free_list_repo import check_phone_in_free_list
from db.repositories.user_repo import (
    create_user,
    get_user_by_bank_account,
    get_user_by_phone,
    get_user_by_telegram_id,
)

router = Router()


class RegistrationStates(StatesGroup):
    waiting_phone = State()
    waiting_bank = State()
    waiting_bank_custom = State()
    waiting_bank_account = State()
    waiting_bank_holder = State()


@router.message(Command("start"))
async def cmd_start(message: Message, state: FSMContext, pool: asyncpg.Pool) -> None:
    await state.clear()

    user = await get_user_by_telegram_id(pool, message.from_user.id)
    if user:
        from bot.keyboards.game_accounts import build_main_menu_keyboard
        status_emoji = "🟢" if user["status"] == "ACTIVE" else "🔴"
        await message.answer(
            f"欢迎回来，{user['first_name']}！\n"
            f"状态：{status_emoji} {user['status']}\n\n"
            f"请选择操作：",
            reply_markup=build_main_menu_keyboard(),
        )
        return

    await message.answer(
        "欢迎注册会员\n\n请选择：",
        reply_markup=registration_start_keyboard(),
    )


@router.callback_query(F.data == "register:start")
async def cb_register_start(
    callback: CallbackQuery,
    state: FSMContext,
    pool: asyncpg.Pool,
) -> None:
    user = await get_user_by_telegram_id(pool, callback.from_user.id)
    if user:
        await callback.answer("此 Telegram 已注册。", show_alert=True)
        return

    await state.set_state(RegistrationStates.waiting_phone)
    await callback.message.edit_text(
        "请输入您的电话号码：\n\n"
        "支持格式：\n"
        "  0123456789\n"
        "  60123456789\n"
        "  +60123456789"
    )
    await callback.answer()


@router.message(RegistrationStates.waiting_phone)
async def process_phone(
    message: Message,
    state: FSMContext,
    pool: asyncpg.Pool,
) -> None:
    phone = normalize_phone(message.text or "")
    if phone is None:
        await message.answer(
            "电话号码格式不正确，请重新输入：\n\n"
            "支持格式：\n"
            "  0123456789\n"
            "  60123456789\n"
            "  +60123456789"
        )
        return

    existing = await get_user_by_phone(pool, phone)
    if existing:
        await state.clear()
        await message.answer("此电话号码已注册。")
        return

    await state.update_data(phone=phone)
    await state.set_state(RegistrationStates.waiting_bank)
    await message.answer(
        "请选择您的银行或电子钱包：",
        reply_markup=build_bank_keyboard("reg_bank"),
    )


@router.callback_query(RegistrationStates.waiting_bank, F.data.startswith("reg_bank:"))
async def process_bank_selection(callback: CallbackQuery, state: FSMContext) -> None:
    bank_key = callback.data.split(":", 1)[1]

    if bank_key == "Other":
        await state.set_state(RegistrationStates.waiting_bank_custom)
        await callback.message.edit_text("请输入银行或电子钱包名称：")
        await callback.answer()
        return

    bank_name = BANK_FULL_NAMES[bank_key]
    await state.update_data(bank_name=bank_name)
    await state.set_state(RegistrationStates.waiting_bank_account)
    await callback.message.edit_text(
        f"已选择：{bank_name}\n\n请输入银行账号："
    )
    await callback.answer()


@router.message(RegistrationStates.waiting_bank_custom)
async def process_bank_custom(message: Message, state: FSMContext) -> None:
    bank_name = (message.text or "").strip()
    if not bank_name:
        await message.answer("银行名称不能为空，请重新输入：")
        return
    await state.update_data(bank_name=bank_name)
    await state.set_state(RegistrationStates.waiting_bank_account)
    await message.answer(f"已填写：{bank_name}\n\n请输入银行账号：")


@router.message(RegistrationStates.waiting_bank_account)
async def process_bank_account(
    message: Message,
    state: FSMContext,
    pool: asyncpg.Pool,
) -> None:
    bank_account = (message.text or "").strip()
    if not bank_account:
        await message.answer("银行账号不能为空，请重新输入：")
        return

    existing = await get_user_by_bank_account(pool, bank_account)
    if existing:
        await message.answer("此银行账号已被使用，请输入其他账号：")
        return

    await state.update_data(bank_account=bank_account)
    await state.set_state(RegistrationStates.waiting_bank_holder)
    await message.answer("请输入银行户口姓名（请与银行资料一致）：")


@router.message(RegistrationStates.waiting_bank_holder)
async def process_bank_holder(
    message: Message,
    state: FSMContext,
    pool: asyncpg.Pool,
) -> None:
    bank_holder_name = (message.text or "").strip()
    if not bank_holder_name:
        await message.answer("银行户口姓名不能为空，请重新输入：")
        return

    data = await state.get_data()
    await state.clear()

    eligible = await check_phone_in_free_list(pool, data["phone"])

    try:
        user = await create_user(
            pool,
            telegram_id=message.from_user.id,
            telegram_username=message.from_user.username,
            first_name=message.from_user.first_name or "Unknown",
            phone=data["phone"],
            bank_name=data["bank_name"],
            bank_account=data["bank_account"],
            bank_holder_name=bank_holder_name,
            eligible_free_credit=eligible,
        )
    except asyncpg.exceptions.UniqueViolationError:
        await state.clear()
        await message.answer("注册失败：信息冲突，请重新注册。")
        return

    free_text = "✅ 符合" if eligible else "❌ 不符合"
    await message.answer(
        f"✅ 注册成功！\n\n"
        f"用户ID：#{user['id']}\n"
        f"电话：{data['phone']}\n"
        f"银行：{data['bank_name']}\n"
        f"账号：{data['bank_account']}\n"
        f"户口姓名：{bank_holder_name}\n"
        f"免费资格：{free_text}"
    )
