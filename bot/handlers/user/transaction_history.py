from __future__ import annotations

from aiogram import F, Router
from aiogram.types import Message

import asyncpg

from bot.services import BotMessageService
from db.repositories.deposit_repo import get_user_deposit_history
from db.repositories.user_repo import get_user_by_telegram_id
from db.repositories.withdrawal_repo import get_user_withdrawal_history

router = Router()

_SEP = "──────────────"

_DEPOSIT_STATUS = {
    "PENDING": "⏳ 审核中",
    "APPROVED": "✅ 已批准",
    "REJECTED": "❌ 已拒绝",
}
_WITHDRAWAL_STATUS = {
    "PENDING": "⏳ 审核中",
    "PAID": "✅ 已付款",
    "REJECTED": "❌ 已拒绝",
}


@router.message(F.text == "📜 充值记录")
async def handle_deposit_history(
    message: Message, pool: asyncpg.Pool, messages: BotMessageService
) -> None:
    lang = message.from_user.language_code or "zh"
    user = await get_user_by_telegram_id(pool, message.from_user.id)
    if not user:
        await message.answer(await messages.get_message("support_not_registered", language=lang))
        return

    records = await get_user_deposit_history(pool, user["id"])
    if not records:
        await message.answer(await messages.get_message("history_deposit_empty", language=lang))
        return

    header = await messages.get_message("history_deposit_header", language=lang)
    parts = [header + "\n"]
    for r in records:
        bonus_amount = float(r["bonus_amount"])
        credit_amount = float(r["credit_amount"])
        deposit_amount = float(r["deposit_amount"])
        status_text = _DEPOSIT_STATUS.get(r["status"], r["status"])

        entry = f"{_SEP}\n#{r['id']}\n{r['provider']}\n\n充值：RM {deposit_amount:.2f}"
        if bonus_amount > 0:
            entry += f"\nBonus：RM {bonus_amount:.2f}\n上分：RM {credit_amount:.2f}"
        else:
            entry += f"\n上分：RM {credit_amount:.2f}"
        entry += f"\n\n{status_text}"
        parts.append(entry)

    await message.answer("\n".join(parts))


@router.message(F.text == "📜 提款记录")
async def handle_withdrawal_history(
    message: Message, pool: asyncpg.Pool, messages: BotMessageService
) -> None:
    lang = message.from_user.language_code or "zh"
    user = await get_user_by_telegram_id(pool, message.from_user.id)
    if not user:
        await message.answer(await messages.get_message("support_not_registered", language=lang))
        return

    records = await get_user_withdrawal_history(pool, user["id"])
    if not records:
        await message.answer(await messages.get_message("history_withdraw_empty", language=lang))
        return

    header = await messages.get_message("history_withdraw_header", language=lang)
    parts = [header + "\n"]
    for r in records:
        status_text = _WITHDRAWAL_STATUS.get(r["status"], r["status"])
        entry = (
            f"{_SEP}\n#{r['id']}\n{r['provider']}\n\n"
            f"提款：RM {float(r['withdraw_amount']):.2f}\n\n"
            f"{status_text}"
        )
        parts.append(entry)

    await message.answer("\n".join(parts))
