from __future__ import annotations

from aiogram import F, Router
from aiogram.types import Message

import asyncpg

from db.repositories.deposit_repo import get_user_deposit_history
from db.repositories.user_repo import get_user_by_telegram_id
from db.repositories.withdrawal_repo import get_user_withdrawal_history

router = Router()

_DEPOSIT_STATUS_EMOJI = {"PENDING": "⏳", "APPROVED": "✅", "REJECTED": "❌"}
_WITHDRAWAL_STATUS_EMOJI = {"PENDING": "⏳", "PAID": "✅", "REJECTED": "❌"}


@router.message(F.text == "📜 充值记录")
async def handle_deposit_history(message: Message, pool: asyncpg.Pool) -> None:
    user = await get_user_by_telegram_id(pool, message.from_user.id)
    if not user:
        await message.answer("您尚未注册。请发送 /start 开始注册。")
        return

    records = await get_user_deposit_history(pool, user["id"])
    if not records:
        await message.answer("📜 充值记录\n\n暂无充值记录。")
        return

    lines = ["📜 充值记录（最近 10 条）\n"]
    for r in records:
        ts = r["created_at"].strftime("%m-%d %H:%M")
        emoji = _DEPOSIT_STATUS_EMOJI.get(r["status"], "❓")
        if r["bonus_amount"] > 0:
            credit_str = f"RM {r['deposit_amount']:.2f} + Bonus RM {r['bonus_amount']:.2f} = RM {r['credit_amount']:.2f}"
        else:
            credit_str = f"RM {r['credit_amount']:.2f}"
        lines.append(
            f"{emoji} #{r['id']}  {r['provider']}  {credit_str}  {ts}"
        )

    await message.answer("\n".join(lines))


@router.message(F.text == "📜 提款记录")
async def handle_withdrawal_history(message: Message, pool: asyncpg.Pool) -> None:
    user = await get_user_by_telegram_id(pool, message.from_user.id)
    if not user:
        await message.answer("您尚未注册。请发送 /start 开始注册。")
        return

    records = await get_user_withdrawal_history(pool, user["id"])
    if not records:
        await message.answer("📜 提款记录\n\n暂无提款记录。")
        return

    lines = ["📜 提款记录（最近 10 条）\n"]
    for r in records:
        ts = r["created_at"].strftime("%m-%d %H:%M")
        emoji = _WITHDRAWAL_STATUS_EMOJI.get(r["status"], "❓")
        lines.append(
            f"{emoji} #{r['id']}  {r['provider']}  RM {r['withdraw_amount']:.2f}  {ts}"
        )

    await message.answer("\n".join(lines))
