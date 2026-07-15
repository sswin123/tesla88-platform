from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

import asyncpg

from bot.filters import IsAdmin
from bot.keyboards.game_accounts import build_provider_select_keyboard
from db.repositories.account_repo import bulk_import_accounts, parse_account_csv
from db.repositories.provider_repo import get_active_providers

router = Router()


class ImportAccountsStates(StatesGroup):
    waiting_provider = State()
    waiting_file = State()


@router.message(Command("import_accounts"), IsAdmin(["SUPER_ADMIN"]))
async def cmd_import_accounts(message: Message, state: FSMContext, pool: asyncpg.Pool) -> None:
    providers = await get_active_providers(pool)
    await state.set_state(ImportAccountsStates.waiting_provider)
    keyboard = build_provider_select_keyboard("imp_prov", providers)
    await message.answer(
        "请选择要导入账号的游戏平台：\n\n或发送 /cancel 取消。",
        reply_markup=keyboard,
    )


@router.message(Command("cancel"), ImportAccountsStates.waiting_provider)
@router.message(Command("cancel"), ImportAccountsStates.waiting_file)
async def cmd_cancel_import_accounts(message: Message, state: FSMContext) -> None:
    await state.clear()
    await message.answer("已取消导入。")


@router.callback_query(
    ImportAccountsStates.waiting_provider,
    F.data.startswith("imp_prov:"),
)
async def process_provider_selection(
    callback: CallbackQuery, state: FSMContext, pool: asyncpg.Pool
) -> None:
    provider = callback.data.split(":", 1)[1]
    providers = await get_active_providers(pool)
    if provider not in providers:
        await callback.answer("无效的平台。", show_alert=True)
        return

    await state.update_data(provider=provider)
    await state.set_state(ImportAccountsStates.waiting_file)
    await callback.message.edit_text(
        f"已选择：{provider}\n\n"
        f"请上传 CSV 文件（格式如下），或发送 /cancel 取消：\n\n"
        f"username,password\n"
        f"918001,Aaaa1111\n"
        f"918002,Aaaa1111"
    )
    await callback.answer()


@router.message(ImportAccountsStates.waiting_file, F.document)
async def process_accounts_file(
    message: Message,
    state: FSMContext,
    pool: asyncpg.Pool,
) -> None:
    doc = message.document
    if not (doc.file_name or "").endswith(".csv"):
        await message.answer("请上传 .csv 格式文件，或发送 /cancel 取消。")
        return

    data = await state.get_data()
    provider = data["provider"]
    await state.clear()

    processing_msg = await message.answer("⏳ 正在处理文件，请稍候...")

    file = await message.bot.get_file(doc.file_id)
    downloaded = await message.bot.download_file(file.file_path)
    content = downloaded.read()

    try:
        records = parse_account_csv(content)
    except Exception:
        await processing_msg.edit_text("❌ CSV 解析失败，请检查文件格式。")
        return

    if not records:
        await processing_msg.edit_text(
            "CSV 文件为空或格式不正确（需含 'username' 和 'password' 列）。"
        )
        return

    try:
        result = await bulk_import_accounts(pool, provider, records)
        await processing_msg.edit_text(
            f"导入完成 ✅\n"
            f"Provider：{provider}\n\n"
            f"总记录：{result.total:,}\n"
            f"新增：{result.inserted:,}\n"
            f"重复：{result.duplicates:,}\n"
            f"失败：{result.failed:,}"
        )
    except Exception:
        await processing_msg.edit_text("❌ 数据库写入失败，请重试。")


@router.message(ImportAccountsStates.waiting_file)
async def process_accounts_not_file(message: Message) -> None:
    await message.answer("请上传 .csv 文件，或发送 /cancel 取消。")
