from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import Message

import asyncpg

from bot.filters import IsAdmin
from db.repositories.free_list_repo import bulk_import_phones, parse_csv_phones

router = Router()


class ImportFreeListStates(StatesGroup):
    waiting_file = State()


@router.message(Command("import_free_list"), IsAdmin(["SUPER_ADMIN"]))
async def cmd_import_free_list(message: Message, state: FSMContext):
    await state.set_state(ImportFreeListStates.waiting_file)
    await message.answer(
        "请上传 free_list.csv 文件。\n\n"
        "CSV 格式：\n"
        "phone\n"
        "60123456789\n"
        "60123456788\n"
        "...\n\n"
        "发送 /cancel 取消。"
    )


@router.message(Command("cancel"), ImportFreeListStates.waiting_file)
async def cmd_cancel_import(message: Message, state: FSMContext):
    await state.clear()
    await message.answer("已取消导入。")


@router.message(ImportFreeListStates.waiting_file, F.document)
async def process_import_file(
    message: Message,
    state: FSMContext,
    pool: asyncpg.Pool,
):
    doc = message.document
    if not (doc.file_name or "").endswith(".csv"):
        await message.answer("请上传 .csv 格式文件。")
        return

    await state.clear()
    processing_msg = await message.answer("⏳ 正在处理文件，请稍候...")

    file = await message.bot.get_file(doc.file_id)
    downloaded = await message.bot.download_file(file.file_path)
    content = downloaded.read()

    try:
        phones = parse_csv_phones(content)
    except Exception:
        await processing_msg.edit_text("❌ CSV 解析失败，请检查文件格式。")
        return

    if not phones:
        await processing_msg.edit_text("CSV 文件为空或格式不正确（需含 'phone' 列）。")
        return

    try:
        result = await bulk_import_phones(pool, phones)
        await processing_msg.edit_text(
            f"导入完成 ✅\n\n"
            f"总记录：{result.total:,}\n"
            f"新增：{result.inserted:,}\n"
            f"重复：{result.duplicates:,}\n"
            f"失败（格式错误）：{result.failed:,}"
        )
    except Exception:
        await processing_msg.edit_text("❌ 数据库写入失败，请重试。")
        return


@router.message(ImportFreeListStates.waiting_file)
async def process_import_not_file(message: Message):
    await message.answer("请上传 .csv 文件，或发送 /cancel 取消。")
