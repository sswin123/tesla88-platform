from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

import asyncpg

from bot.filters import IsAdmin
from bot.keyboards.registration import BANK_FULL_NAMES, build_bank_keyboard
from db.repositories.user_repo import (
    get_user_by_bank_account,
    get_user_by_id,
    update_user_bank,
)

router = Router()


class UpdateBankStates(StatesGroup):
    waiting_bank = State()
    waiting_bank_custom = State()
    waiting_bank_account = State()
    waiting_bank_holder = State()


@router.message(Command("update_bank"), IsAdmin(["SUPER_ADMIN"]))
async def cmd_update_bank(
    message: Message,
    state: FSMContext,
    pool: asyncpg.Pool,
):
    parts = (message.text or "").split()
    if len(parts) < 2:
        await message.answer("用法：/update_bank <用户ID>")
        return

    try:
        user_id = int(parts[1])
    except ValueError:
        await message.answer("用户ID 必须是数字。")
        return

    user = await get_user_by_id(pool, user_id)
    if not user:
        await message.answer(f"未找到用户ID #{user_id}。")
        return

    await state.update_data(user_id=user_id)
    await state.set_state(UpdateBankStates.waiting_bank)
    await message.answer(
        f"修改会员 #{user_id} 的银行资料\n\n"
        f"当前银行：{user['bank_name']}\n"
        f"当前账号：{user['bank_account']}\n"
        f"当前姓名：{user['bank_holder_name']}\n\n"
        f"请选择新银行：",
        reply_markup=build_bank_keyboard("upd_bank"),
    )


@router.callback_query(UpdateBankStates.waiting_bank, F.data.startswith("upd_bank:"))
async def upd_bank_select(callback: CallbackQuery, state: FSMContext):
    bank_key = callback.data.split(":", 1)[1]

    if bank_key == "Other":
        await state.set_state(UpdateBankStates.waiting_bank_custom)
        await callback.message.edit_text("请输入银行或电子钱包名称：")
        await callback.answer()
        return

    bank_name = BANK_FULL_NAMES[bank_key]
    await state.update_data(bank_name=bank_name)
    await state.set_state(UpdateBankStates.waiting_bank_account)
    await callback.message.edit_text(f"已选择：{bank_name}\n\n请输入新银行账号：")
    await callback.answer()


@router.message(UpdateBankStates.waiting_bank_custom)
async def upd_bank_custom(message: Message, state: FSMContext):
    bank_name = (message.text or "").strip()
    if not bank_name:
        await message.answer("银行名称不能为空，请重新输入：")
        return
    await state.update_data(bank_name=bank_name)
    await state.set_state(UpdateBankStates.waiting_bank_account)
    await message.answer(f"已填写：{bank_name}\n\n请输入新银行账号：")


@router.message(UpdateBankStates.waiting_bank_account)
async def upd_bank_account(
    message: Message,
    state: FSMContext,
    pool: asyncpg.Pool,
):
    bank_account = (message.text or "").strip()
    if not bank_account:
        await message.answer("银行账号不能为空，请重新输入：")
        return

    data = await state.get_data()
    existing = await get_user_by_bank_account(pool, bank_account)
    if existing and existing["id"] != data["user_id"]:
        await message.answer("此银行账号已被其他会员使用，请输入其他账号：")
        return

    await state.update_data(bank_account=bank_account)
    await state.set_state(UpdateBankStates.waiting_bank_holder)
    await message.answer("请输入新银行户口姓名：")


@router.message(UpdateBankStates.waiting_bank_holder)
async def upd_bank_holder(
    message: Message,
    state: FSMContext,
    pool: asyncpg.Pool,
):
    bank_holder_name = (message.text or "").strip()
    if not bank_holder_name:
        await message.answer("银行户口姓名不能为空，请重新输入：")
        return

    data = await state.get_data()
    await state.clear()

    user = await update_user_bank(
        pool,
        user_id=data["user_id"],
        bank_name=data["bank_name"],
        bank_account=data["bank_account"],
        bank_holder_name=bank_holder_name,
    )

    if not user:
        await message.answer("更新失败，请重试。")
        return

    await message.answer(
        f"✅ 银行资料已更新\n\n"
        f"用户ID：#{user['id']}\n"
        f"银行名称：{user['bank_name']}\n"
        f"银行账号：{user['bank_account']}\n"
        f"银行户口姓名：{user['bank_holder_name']}"
    )
