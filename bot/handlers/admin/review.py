from __future__ import annotations

import html
import re

from aiogram import Bot, F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, ForceReply, Message

import asyncpg

from bot.config import Config
from bot.filters import IsAdmin
from db.repositories.deposit_repo import (
    approve_deposit,
    get_deposit_request,
    get_pending_deposits,
    reject_deposit,
)
from db.repositories.withdrawal_repo import (
    get_pending_withdrawals,
    get_withdrawal_request,
    mark_withdrawal_paid,
    reject_withdrawal,
)

router = Router()

# Pattern in ForceReply prompt text to identify reject context.
# Bot sends: "DEP_REJECT:123\n📝 ..." or "WD_REJECT:456\n📝 ..."
_DEP_REJECT_RE = re.compile(r"^DEP_REJECT:(\d+)")
_WD_REJECT_RE = re.compile(r"^WD_REJECT:(\d+)")


# ── Deposit: Approve ──────────────────────────────────────────────────────────

@router.callback_query(
    F.data.startswith("dep_approve:"),
    IsAdmin(["SUPER_ADMIN", "ADMIN"]),
)
async def cb_dep_approve(
    callback: CallbackQuery,
    pool: asyncpg.Pool,
    bot: Bot,
    config: Config,
) -> None:
    request_id = int(callback.data.split(":", 1)[1])
    req = await get_deposit_request(pool, request_id)
    if not req:
        await callback.answer("申请不存在。", show_alert=True)
        return

    updated = await approve_deposit(
        pool, request_id, reviewed_by=callback.from_user.id, admin_note=None
    )
    if not updated:
        await callback.answer("该申请已处理。", show_alert=True)
        return

    admin_name = callback.from_user.username or str(callback.from_user.id)

    # Remove keyboard from notification
    await bot.edit_message_reply_markup(
        chat_id=config.admin_chat_id,
        message_id=req["notification_msg_id"],
        reply_markup=None,
    )
    # Reply status to notification
    await bot.send_message(
        chat_id=config.admin_chat_id,
        text=f"✅ Deposit #{request_id} 已批准 by @{admin_name}",
        reply_to_message_id=req["notification_msg_id"],
    )

    # DM user
    try:
        bonus_amount = float(req["bonus_amount"])
        credit_amount = float(req["credit_amount"])
        deposit_amount = float(req["deposit_amount"])
        if bonus_amount > 0:
            bonus_line = f"🎁 Bonus：RM {bonus_amount:.2f}\n🪙 实际上分：RM {credit_amount:.2f}"
        else:
            bonus_line = f"🪙 实际上分：RM {credit_amount:.2f}"
        await bot.send_message(
            chat_id=req["telegram_id"],
            text=(
                f"✅ 您的充值申请已批准！\n\n"
                f"申请编号：#{request_id}\n"
                f"🎮 平台：{html.escape(req['provider'])}\n"
                f"💵 充值金额：RM {deposit_amount:.2f}\n"
                f"{bonus_line}"
            ),
            parse_mode="HTML",
        )
    except Exception:
        pass  # User may have blocked the bot

    await callback.answer("✅ 已批准")


# ── Deposit: Reject (step 1 — send ForceReply prompt) ─────────────────────────

@router.callback_query(
    F.data.startswith("dep_reject:"),
    IsAdmin(["SUPER_ADMIN", "ADMIN"]),
)
async def cb_dep_reject(
    callback: CallbackQuery,
    pool: asyncpg.Pool,
) -> None:
    request_id = int(callback.data.split(":", 1)[1])
    req = await get_deposit_request(pool, request_id)
    if not req:
        await callback.answer("申请不存在。", show_alert=True)
        return
    if req["status"] != "PENDING":
        await callback.answer("该申请已处理。", show_alert=True)
        return

    await callback.message.answer(
        f"DEP_REJECT:{request_id}\n"
        f"📝 Deposit #{request_id} 拒绝原因\n"
        f"请回复此消息填写拒绝原因：",
        reply_markup=ForceReply(selective=True),
    )
    await callback.answer()


# ── Withdrawal: Approve ───────────────────────────────────────────────────────

@router.callback_query(
    F.data.startswith("wd_approve:"),
    IsAdmin(["SUPER_ADMIN", "ADMIN"]),
)
async def cb_wd_approve(
    callback: CallbackQuery,
    pool: asyncpg.Pool,
    bot: Bot,
    config: Config,
) -> None:
    request_id = int(callback.data.split(":", 1)[1])
    req = await get_withdrawal_request(pool, request_id)
    if not req:
        await callback.answer("申请不存在。", show_alert=True)
        return

    updated = await mark_withdrawal_paid(
        pool, request_id, reviewed_by=callback.from_user.id, admin_note=None
    )
    if not updated:
        await callback.answer("该申请已处理。", show_alert=True)
        return

    admin_name = callback.from_user.username or str(callback.from_user.id)

    # Remove keyboard from notification
    await bot.edit_message_reply_markup(
        chat_id=config.admin_chat_id,
        message_id=req["notification_msg_id"],
        reply_markup=None,
    )
    await bot.send_message(
        chat_id=config.admin_chat_id,
        text=f"✅ Withdrawal #{request_id} 已付款 by @{admin_name}",
        reply_to_message_id=req["notification_msg_id"],
    )

    # DM user
    try:
        await bot.send_message(
            chat_id=req["telegram_id"],
            text=(
                f"✅ 您的提款申请已完成！\n\n"
                f"申请编号：#{request_id}\n"
                f"🎮 平台：{html.escape(req['provider'])}\n"
                f"💵 提款金额：RM {float(req['withdraw_amount']):.2f}\n\n"
                f"款项已转入您的银行账号。"
            ),
            parse_mode="HTML",
        )
    except Exception:
        pass

    await callback.answer("✅ 已标记为已付款")


# ── Withdrawal: Reject (step 1 — send ForceReply prompt) ─────────────────────

@router.callback_query(
    F.data.startswith("wd_reject:"),
    IsAdmin(["SUPER_ADMIN", "ADMIN"]),
)
async def cb_wd_reject(
    callback: CallbackQuery,
    pool: asyncpg.Pool,
) -> None:
    request_id = int(callback.data.split(":", 1)[1])
    req = await get_withdrawal_request(pool, request_id)
    if not req:
        await callback.answer("申请不存在。", show_alert=True)
        return
    if req["status"] != "PENDING":
        await callback.answer("该申请已处理。", show_alert=True)
        return

    await callback.message.answer(
        f"WD_REJECT:{request_id}\n"
        f"📝 Withdrawal #{request_id} 拒绝原因\n"
        f"请回复此消息填写拒绝原因：",
        reply_markup=ForceReply(selective=True),
    )
    await callback.answer()


# ── Reject reason reply handler (step 2) ─────────────────────────────────────

async def _is_reject_reply(message: Message) -> bool:
    """Check if this message is a reply to a bot's reject-prompt message."""
    reply = message.reply_to_message
    if not reply:
        return False
    if not reply.from_user or not reply.from_user.is_bot:
        return False
    text = reply.text or ""
    first_line = text.split("\n", 1)[0]
    return bool(_DEP_REJECT_RE.match(first_line) or _WD_REJECT_RE.match(first_line))


@router.message(_is_reject_reply, IsAdmin(["SUPER_ADMIN", "ADMIN"]))
async def process_reject_reason(
    message: Message,
    pool: asyncpg.Pool,
    bot: Bot,
    config: Config,
) -> None:
    reason = (message.text or "").strip()
    if not reason:
        await message.answer("⚠️ 拒绝原因不能为空，请重新回复。")
        return

    reply_text = message.reply_to_message.text or ""
    first_line = reply_text.split("\n", 1)[0]

    dep_match = _DEP_REJECT_RE.match(first_line)
    wd_match = _WD_REJECT_RE.match(first_line)

    admin_name = message.from_user.username or str(message.from_user.id)

    if dep_match:
        request_id = int(dep_match.group(1))
        req = await get_deposit_request(pool, request_id)
        if not req:
            await message.answer("⚠️ 申请不存在。")
            return

        updated = await reject_deposit(
            pool, request_id, reviewed_by=message.from_user.id, admin_note=reason
        )
        if not updated:
            await message.answer("⚠️ 该申请已处理，无法重复拒绝。")
            return

        # Edit admin notification
        if req["notification_msg_id"]:
            await bot.edit_message_reply_markup(
                chat_id=config.admin_chat_id,
                message_id=req["notification_msg_id"],
                reply_markup=None,
            )
            await bot.send_message(
                chat_id=config.admin_chat_id,
                text=(
                    f"❌ Deposit #{request_id} 已拒绝 by @{admin_name}\n"
                    f"原因：{html.escape(reason)}"
                ),
                reply_to_message_id=req["notification_msg_id"],
                parse_mode="HTML",
            )

        # DM user
        try:
            await bot.send_message(
                chat_id=req["telegram_id"],
                text=(
                    f"❌ 您的充值申请已被拒绝。\n\n"
                    f"申请编号：#{request_id}\n"
                    f"🎮 平台：{html.escape(req['provider'])}\n"
                    f"💵 充值金额：RM {float(req['deposit_amount']):.2f}\n\n"
                    f"拒绝原因：{html.escape(reason)}\n\n"
                    f"如有疑问请联系客服。"
                ),
                parse_mode="HTML",
            )
        except Exception:
            pass

        await message.answer(f"✅ 已拒绝 Deposit #{request_id}")

    elif wd_match:
        request_id = int(wd_match.group(1))
        req = await get_withdrawal_request(pool, request_id)
        if not req:
            await message.answer("⚠️ 申请不存在。")
            return

        updated = await reject_withdrawal(
            pool, request_id, reviewed_by=message.from_user.id, admin_note=reason
        )
        if not updated:
            await message.answer("⚠️ 该申请已处理，无法重复拒绝。")
            return

        # Edit admin notification
        if req["notification_msg_id"]:
            await bot.edit_message_reply_markup(
                chat_id=config.admin_chat_id,
                message_id=req["notification_msg_id"],
                reply_markup=None,
            )
            await bot.send_message(
                chat_id=config.admin_chat_id,
                text=(
                    f"❌ Withdrawal #{request_id} 已拒绝 by @{admin_name}\n"
                    f"原因：{html.escape(reason)}"
                ),
                reply_to_message_id=req["notification_msg_id"],
                parse_mode="HTML",
            )

        # DM user
        try:
            await bot.send_message(
                chat_id=req["telegram_id"],
                text=(
                    f"❌ 您的提款申请已被拒绝。\n\n"
                    f"申请编号：#{request_id}\n"
                    f"🎮 平台：{html.escape(req['provider'])}\n"
                    f"💵 提款金额：RM {float(req['withdraw_amount']):.2f}\n\n"
                    f"拒绝原因：{html.escape(reason)}\n\n"
                    f"如有疑问请联系客服。"
                ),
                parse_mode="HTML",
            )
        except Exception:
            pass

        await message.answer(f"✅ 已拒绝 Withdrawal #{request_id}")


# ── /pending command ──────────────────────────────────────────────────────────

@router.message(Command("pending"), IsAdmin())
async def cmd_pending(message: Message, pool: asyncpg.Pool) -> None:
    deposits = await get_pending_deposits(pool)
    withdrawals = await get_pending_withdrawals(pool)

    if not deposits and not withdrawals:
        await message.answer("✅ 暂无待审核申请")
        return

    lines = ["📋 待审核申请\n"]
    if deposits:
        lines.append("💰 充值申请：")
        for d in deposits:
            ts = d["created_at"].strftime("%m-%d %H:%M")
            lines.append(
                f"  #{d['id']} {d['provider']} RM {float(d['deposit_amount']):.2f}"
                f" — {d['phone']} {ts}"
            )
    if withdrawals:
        lines.append("\n💸 提款申请：")
        for w in withdrawals:
            ts = w["created_at"].strftime("%m-%d %H:%M")
            lines.append(
                f"  #{w['id']} {w['provider']} RM {float(w['withdraw_amount']):.2f}"
                f" — {w['phone']} {ts}"
            )

    await message.answer("\n".join(lines))
