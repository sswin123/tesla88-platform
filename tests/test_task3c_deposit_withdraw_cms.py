"""Tests for Phase 5.8 Task 3C — Deposit + Withdrawal flow CMS migration.

8 scenarios:
  Deposit:
    1. deposit start (deposit_select_platform) CMS text
    2. deposit amount validation (deposit_amount_invalid) CMS text
    3. deposit pending message (deposit_pending_exists) CMS text
    4. deposit submitted variable replacement ({req_id})
  Withdraw:
    5. withdraw start (withdraw_select_platform) CMS text
    6. withdraw amount validation (withdraw_amount_invalid) CMS text
    7. withdraw pending message (withdraw_pending_exists) CMS text
  System:
    8. DB offline fallback — returns key string, no crash

  Additional coverage:
    9.  deposit_min_not_met with {promo_name} and {min_deposit}
   10.  deposit_confirm with all variables including {amount:.2f} format spec
   11.  deposit_promo_first_only / daily / weekly limit keys
   12.  withdraw_min_not_met with {min_amount:.2f} format spec
   13.  withdraw_confirm with all variables
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from bot.services.message_service import BotMessageService


# ── Helpers ───────────────────────────────────────────────────────────────────

def _row(key: str, lang: str, content: str) -> dict:
    return {"message_key": key, "language_code": lang, "content": content}


def _pool(*rows: dict, version: int = 1) -> MagicMock:
    p = MagicMock()
    p.fetch = AsyncMock(return_value=list(rows))
    p.fetchval = AsyncMock(return_value=version)
    return p


def _offline_pool() -> MagicMock:
    p = MagicMock()
    p.fetch = AsyncMock(side_effect=OSError("connection refused"))
    p.fetchval = AsyncMock(side_effect=OSError("connection refused"))
    return p


# ── 1. Deposit start CMS text ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_deposit_select_platform_cms_text():
    """deposit_select_platform returns CMS content."""
    pool = _pool(_row("deposit_select_platform", "zh", "💰 充值\n\n请选择游戏平台："))
    svc = BotMessageService(pool)
    result = await svc.get_message("deposit_select_platform")
    assert result == "💰 充值\n\n请选择游戏平台："


# ── 2. Deposit amount validation CMS text ────────────────────────────────────

@pytest.mark.asyncio
async def test_deposit_amount_invalid_cms_text():
    """deposit_amount_invalid returns validation error from CMS."""
    content = "⚠️ 输入格式错误\n\n请输入正确金额，例如：\n\n100\n300\n500"
    pool = _pool(_row("deposit_amount_invalid", "zh", content))
    svc = BotMessageService(pool)
    result = await svc.get_message("deposit_amount_invalid")
    assert "输入格式错误" in result


# ── 3. Deposit pending exists CMS text ───────────────────────────────────────

@pytest.mark.asyncio
async def test_deposit_pending_exists_cms_text():
    """deposit_pending_exists key returns CMS content."""
    content = "⚠️ 您有一个待审核的充值申请，请等待处理后再提交新申请。"
    pool = _pool(_row("deposit_pending_exists", "zh", content))
    svc = BotMessageService(pool)
    result = await svc.get_message("deposit_pending_exists")
    assert "待审核" in result


# ── 4. Deposit submitted variable replacement ─────────────────────────────────

@pytest.mark.asyncio
async def test_deposit_submitted_variable_replacement():
    """deposit_submitted substitutes {req_id} correctly."""
    content = "✅ 充值申请已提交！\n申请编号：#{req_id}\n请等待管理员审核。"
    pool = _pool(_row("deposit_submitted", "zh", content))
    svc = BotMessageService(pool)
    result = await svc.get_message("deposit_submitted", variables={"req_id": 42})
    assert result == "✅ 充值申请已提交！\n申请编号：#42\n请等待管理员审核。"


# ── 5. Withdraw start CMS text ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_withdraw_select_platform_cms_text():
    """withdraw_select_platform returns CMS content."""
    pool = _pool(_row("withdraw_select_platform", "zh", "💸 提款\n\n请选择游戏平台："))
    svc = BotMessageService(pool)
    result = await svc.get_message("withdraw_select_platform")
    assert result == "💸 提款\n\n请选择游戏平台："


# ── 6. Withdraw amount validation CMS text ───────────────────────────────────

@pytest.mark.asyncio
async def test_withdraw_amount_invalid_cms_text():
    """withdraw_amount_invalid returns validation error from CMS."""
    content = "⚠️ 输入格式错误\n\n请输入正确金额，例如：\n\n100\n300\n500"
    pool = _pool(_row("withdraw_amount_invalid", "zh", content))
    svc = BotMessageService(pool)
    result = await svc.get_message("withdraw_amount_invalid")
    assert "格式错误" in result


# ── 7. Withdraw pending exists CMS text ──────────────────────────────────────

@pytest.mark.asyncio
async def test_withdraw_pending_exists_cms_text():
    """withdraw_pending_exists key returns CMS content."""
    content = "⚠️ 您有一个待审核的提款申请，请等待处理后再提交新申请。"
    pool = _pool(_row("withdraw_pending_exists", "zh", content))
    svc = BotMessageService(pool)
    result = await svc.get_message("withdraw_pending_exists")
    assert "待审核" in result


# ── 8. DB offline fallback ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_deposit_withdraw_db_offline_returns_key_string():
    """DB offline → get_message returns key string for both deposit and withdraw keys."""
    svc = BotMessageService(_offline_pool())
    d_result = await svc.get_message("deposit_select_platform")
    w_result = await svc.get_message("withdraw_select_platform")
    assert d_result == "deposit_select_platform"
    assert w_result == "withdraw_select_platform"


# ── 9. Deposit min not met with format-spec variables ─────────────────────────

@pytest.mark.asyncio
async def test_deposit_min_not_met_variables():
    """deposit_min_not_met substitutes {promo_name} and {min_deposit:.2f}."""
    content = "⚠️ 使用「{promo_name}」最低充值为 RM {min_deposit:.2f}\n\n您的金额不符合条件，请重新输入："
    pool = _pool(_row("deposit_min_not_met", "zh", content))
    svc = BotMessageService(pool)
    result = await svc.get_message(
        "deposit_min_not_met",
        variables={"promo_name": "50% Welcome Bonus", "min_deposit": 50.0},
    )
    assert "50% Welcome Bonus" in result
    assert "RM 50.00" in result


# ── 10. Deposit confirm with {amount:.2f} format spec ─────────────────────────

@pytest.mark.asyncio
async def test_deposit_confirm_amount_format_spec():
    """deposit_confirm formats {amount:.2f} correctly when amount is a float."""
    content = "💰 充值确认\n\n💵 充值金额：RM {amount:.2f}\n{credit_block}\n银行：{bank_name}\n账户名：{account_name}\n账号：{account_number}"
    pool = _pool(_row("deposit_confirm", "zh", content))
    svc = BotMessageService(pool)
    result = await svc.get_message(
        "deposit_confirm",
        variables={
            "provider": "Pussy888",
            "game_username": "player001",
            "amount": 100.0,
            "credit_block": "🎁 优惠：无优惠\n🪙 实际上分：RM 100.00\n",
            "bank_name": "Maybank",
            "account_name": "Ali Ahmad",
            "account_number": "1234567890",
        },
    )
    assert "RM 100.00" in result
    assert "Maybank" in result
    assert "实际上分" in result


# ── 11. Deposit promo limit keys ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_deposit_promo_limit_keys():
    """deposit_promo_first_only, daily_limit, weekly_limit all return correct text."""
    pool = _pool(
        _row("deposit_promo_first_only", "zh", "此优惠每位用户只能领取一次，您已达到领取上限。"),
        _row("deposit_promo_daily_limit", "zh", "此优惠今日已领取，请明天再来。"),
        _row("deposit_promo_weekly_limit", "zh", "此优惠本周已领取，请下周再来。"),
    )
    svc = BotMessageService(pool)
    assert "一次" in await svc.get_message("deposit_promo_first_only")
    assert "今日" in await svc.get_message("deposit_promo_daily_limit")
    assert "本周" in await svc.get_message("deposit_promo_weekly_limit")


# ── 12. Withdraw min not met with {min_amount:.2f} format spec ────────────────

@pytest.mark.asyncio
async def test_withdraw_min_not_met_format_spec():
    """withdraw_min_not_met formats {min_amount:.2f} when min_amount is a float."""
    content = "⚠️ 最低提款金额为 RM {min_amount:.2f}\n\n请重新输入金额："
    pool = _pool(_row("withdraw_min_not_met", "zh", content))
    svc = BotMessageService(pool)
    result = await svc.get_message("withdraw_min_not_met", variables={"min_amount": 30.0})
    assert result == "⚠️ 最低提款金额为 RM 30.00\n\n请重新输入金额："


# ── 13. Withdraw confirm with all variables ───────────────────────────────────

@pytest.mark.asyncio
async def test_withdraw_confirm_all_variables():
    """withdraw_confirm substitutes all six variables correctly."""
    content = (
        "💸 提款确认\n\n🎮 平台：{provider}\n👤 游戏账号：{game_username}\n"
        "💵 提款金额：RM {amount:.2f}\n\n🏦 收款银行：{bank_name}\n"
        "💳 收款账号：{bank_account}\n👤 账户名：{bank_holder_name}"
    )
    pool = _pool(_row("withdraw_confirm", "zh", content))
    svc = BotMessageService(pool)
    result = await svc.get_message(
        "withdraw_confirm",
        variables={
            "provider": "Mega888",
            "game_username": "player002",
            "amount": 200.0,
            "bank_name": "CIMB",
            "bank_account": "9876543210",
            "bank_holder_name": "Tan Ah Kow",
        },
    )
    assert "Mega888" in result
    assert "RM 200.00" in result
    assert "CIMB" in result
    assert "Tan Ah Kow" in result
