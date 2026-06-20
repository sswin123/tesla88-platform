from __future__ import annotations

import html
import logging
import re
import traceback
from datetime import datetime

from aiogram import Bot, F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, ForceReply, Message

import asyncpg

from bot.config import Config
from bot.filters import IsAdmin

logger = logging.getLogger(__name__)
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

_DEP_REJECT_RE = re.compile(r"^DEP_REJECT:(\d+)")
_WD_REJECT_RE = re.compile(r"^WD_REJECT:(\d+)")


def _now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M")


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

    # Edit the original notification caption (deposit = photo message)
    if req["notification_msg_id"]:
        new_caption = (
            f"💰 充值申请 #{request_id}\n"
            f"✅ 已批准\n\n"
            f"审核人：\n@{admin_name}\n\n"
            f"审核时间：\n{_now_str()}"
        )
        try:
            await bot.edit_message_caption(
                chat_id=config.admin_chat_id,
                message_id=req["notification_msg_id"],
                caption=new_caption,
                reply_markup=None,
            )
        except Exception:
            pass

    # DM user
    bonus_amount = float(req["bonus_amount"])
    credit_amount = float(req["credit_amount"])
    deposit_amount = float(req["deposit_amount"])
    game_username = req["game_username"]

    if bonus_amount > 0:
        bonus_line = f"🎁 Bonus：RM {bonus_amount:.2f}\n🪙 上分：RM {credit_amount:.2f}"
    else:
        bonus_line = f"🪙 上分：RM {credit_amount:.2f}"

    try:
        await bot.send_message(
            chat_id=req["telegram_id"],
            text=(
                f"✅ 您的充值申请 #{request_id} 已批准\n\n"
                f"🎮 平台：{html.escape(req['provider'])}\n"
                f"👤 游戏账号：{html.escape(game_username)}\n\n"
                f"💵 充值：RM {deposit_amount:.2f}\n"
                f"{bonus_line}\n\n"
                f"请查看游戏平台余额。"
            ),
            parse_mode="HTML",
        )
    except Exception:
        pass

    await callback.answer("✅ 已批准")


# ── Deposit: Reject (step 1 — ForceReply prompt) ──────────────────────────────

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
        f"📝 充值申请 #{request_id} — 拒绝原因\n"
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

    # Edit the original notification text (withdrawal = text message)
    if req["notification_msg_id"]:
        new_text = (
            f"💸 提款申请 #{request_id}\n"
            f"✅ 已付款\n\n"
            f"审核人：\n@{admin_name}\n\n"
            f"审核时间：\n{_now_str()}"
        )
        try:
            await bot.edit_message_text(
                chat_id=config.admin_chat_id,
                message_id=req["notification_msg_id"],
                text=new_text,
                reply_markup=None,
            )
        except Exception:
            pass

    # DM user
    try:
        await bot.send_message(
            chat_id=req["telegram_id"],
            text=(
                f"✅ 您的提款申请 #{request_id} 已完成\n\n"
                f"🎮 平台：{html.escape(req['provider'])}\n"
                f"👤 游戏账号：{html.escape(req['game_username'])}\n\n"
                f"💵 提款：RM {float(req['withdraw_amount']):.2f}\n\n"
                f"款项已转入您的银行账号。"
            ),
            parse_mode="HTML",
        )
    except Exception:
        pass

    await callback.answer("✅ 已标记为已付款")


# ── Withdrawal: Reject (step 1 — ForceReply prompt) ──────────────────────────

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
        f"📝 提款申请 #{request_id} — 拒绝原因\n"
        f"请回复此消息填写拒绝原因：",
        reply_markup=ForceReply(selective=True),
    )
    await callback.answer()


# ── Reject reason reply (step 2) ─────────────────────────────────────────────

async def _is_reject_reply(message: Message) -> bool:
    reply = message.reply_to_message
    if not reply or not reply.from_user or not reply.from_user.is_bot:
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

    first_line = (message.reply_to_message.text or "").split("\n", 1)[0]
    admin_name = message.from_user.username or str(message.from_user.id)

    dep_match = _DEP_REJECT_RE.match(first_line)
    wd_match = _WD_REJECT_RE.match(first_line)

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

        # Edit original notification caption
        if req["notification_msg_id"]:
            new_caption = (
                f"💰 充值申请 #{request_id}\n"
                f"❌ 已拒绝\n\n"
                f"拒绝原因：\n{html.escape(reason)}\n\n"
                f"审核人：\n@{admin_name}\n\n"
                f"审核时间：\n{_now_str()}"
            )
            try:
                await bot.edit_message_caption(
                    chat_id=config.admin_chat_id,
                    message_id=req["notification_msg_id"],
                    caption=new_caption,
                    reply_markup=None,
                    parse_mode="HTML",
                )
            except Exception:
                pass

        # DM user
        try:
            await bot.send_message(
                chat_id=req["telegram_id"],
                text=(
                    f"❌ 申请已拒绝\n\n"
                    f"申请编号：#{request_id}\n\n"
                    f"原因：\n{html.escape(reason)}"
                ),
                parse_mode="HTML",
            )
        except Exception:
            pass

        await message.answer(f"✅ 已拒绝充值申请 #{request_id}")

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

        # Edit original notification text
        if req["notification_msg_id"]:
            new_text = (
                f"💸 提款申请 #{request_id}\n"
                f"❌ 已拒绝\n\n"
                f"拒绝原因：\n{html.escape(reason)}\n\n"
                f"审核人：\n@{admin_name}\n\n"
                f"审核时间：\n{_now_str()}"
            )
            try:
                await bot.edit_message_text(
                    chat_id=config.admin_chat_id,
                    message_id=req["notification_msg_id"],
                    text=new_text,
                    reply_markup=None,
                    parse_mode="HTML",
                )
            except Exception:
                pass

        # DM user
        try:
            await bot.send_message(
                chat_id=req["telegram_id"],
                text=(
                    f"❌ 申请已拒绝\n\n"
                    f"申请编号：#{request_id}\n\n"
                    f"原因：\n{html.escape(reason)}"
                ),
                parse_mode="HTML",
            )
        except Exception:
            pass

        await message.answer(f"✅ 已拒绝提款申请 #{request_id}")


# ── /pending ──────────────────────────────────────────────────────────────────

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
                f"  #{d['id']} {d['provider']} RM {float(d['deposit_amount']):.0f}"
                f" — {d['phone']} {ts}"
            )
    if withdrawals:
        lines.append("\n💸 提款申请：")
        for w in withdrawals:
            ts = w["created_at"].strftime("%m-%d %H:%M")
            lines.append(
                f"  #{w['id']} {w['provider']} RM {float(w['withdraw_amount']):.0f}"
                f" — {w['phone']} {ts}"
            )

    await message.answer("\n".join(lines))


# ── UAT helpers (SUPER_ADMIN only) ───────────────────────────────────────────

@router.message(Command("clear_pending"), IsAdmin(["SUPER_ADMIN"]))
async def cmd_clear_pending(message: Message, pool: asyncpg.Pool) -> None:
    """UAT: bulk-approve all PENDING deposit_requests so testers can resubmit."""
    result = await pool.execute(
        "UPDATE deposit_requests SET status = 'APPROVED', reviewed_at = NOW() "
        "WHERE status = 'PENDING'"
    )
    count = int(result.split()[-1])
    await message.answer(f"✅ 已清理待审核充值申请\n\n处理数量：{count}")


@router.message(Command("clear_withdrawal_pending"), IsAdmin(["SUPER_ADMIN"]))
async def cmd_clear_withdrawal_pending(message: Message, pool: asyncpg.Pool) -> None:
    """UAT: bulk-mark all PENDING withdrawal_requests as PAID so testers can resubmit."""
    result = await pool.execute(
        "UPDATE withdrawal_requests SET status = 'PAID', reviewed_at = NOW() "
        "WHERE status = 'PENDING'"
    )
    count = int(result.split()[-1])
    await message.answer(f"✅ 已清理待审核提款申请\n\n处理数量：{count}")


@router.message(Command("test_admin_chat"), IsAdmin(["SUPER_ADMIN"]))
async def cmd_test_admin_chat(message: Message, bot: Bot, config: Config) -> None:
    """UAT: send a real message to ADMIN_CHAT_ID and report message_id."""
    chat_id = config.admin_chat_id

    if not chat_id:
        await message.answer(
            f"⚠️ ADMIN_CHAT_ID 未配置（值为 0）\n"
            f"通知将发送至 SUPER_ADMIN 私聊。"
        )
        return

    try:
        msg = await bot.send_message(
            chat_id=chat_id,
            text=f"TEST MESSAGE {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        )
        logger.info(
            "TEST SEND SUCCESS chat=%s msg=%s",
            chat_id,
            msg.message_id,
        )
        await message.answer(
            f"发送成功\n\n"
            f"chat_id: {chat_id}\n"
            f"message_id: {msg.message_id}"
        )
    except Exception:
        logger.exception("TEST SEND FAILED chat=%s", chat_id)
        await message.answer(
            f"❌ 发送失败\n\n"
            f"chat_id: {chat_id}\n\n"
            f"<pre>{html.escape(traceback.format_exc())}</pre>",
            parse_mode="HTML",
        )
