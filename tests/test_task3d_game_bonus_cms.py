"""Tests for Phase 5.8 Task 3D — Game Account + Bonus CMS migration.

9 scenarios:
  Game:
    1. provider selection CMS (game_select_change_platform)
    2. account info header CMS (profile_game_accounts_header)
    3. claim success variable replacement ({provider}, {username}, {password})
    4. cooldown CMS with {provider}, {cooldown_hours}, {next_time}

  Bonus:
    5. promo list header CMS (promo_list_header)
    6. claim success — promo_enter_amount CMS text
    7. promo_my_claims_empty CMS text

  System:
    8. missing key fallback (returns key string, no crash)
    9. DB offline fallback (returns key string, no crash)
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


# ── 1. Provider selection CMS ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_game_select_change_platform_cms():
    """game_select_change_platform returns CMS content."""
    pool = _pool(_row("game_select_change_platform", "zh", "请选择要更换的游戏平台："))
    svc = BotMessageService(pool)
    result = await svc.get_message("game_select_change_platform")
    assert result == "请选择要更换的游戏平台："


# ── 2. Account info header CMS ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_profile_game_accounts_header_cms():
    """profile_game_accounts_header returns CMS content."""
    pool = _pool(_row("profile_game_accounts_header", "zh", "🎮 游戏平台账号"))
    svc = BotMessageService(pool)
    result = await svc.get_message("profile_game_accounts_header")
    assert result == "🎮 游戏平台账号"


# ── 3. Claim success variable replacement ────────────────────────────────────

@pytest.mark.asyncio
async def test_game_claim_success_variable_replacement():
    """game_claim_success substitutes {provider}, {username}, {password}."""
    content = "✅ 领取成功\n\n🎮 平台：{provider}\n👤 账号：{username}\n🔑 密码：{password}"
    pool = _pool(_row("game_claim_success", "zh", content))
    svc = BotMessageService(pool)
    result = await svc.get_message(
        "game_claim_success",
        variables={
            "provider": "Mega888",
            "username": "<code>player001</code>",
            "password": "<code>pass123</code>",
        },
    )
    assert "Mega888" in result
    assert "<code>player001</code>" in result
    assert "<code>pass123</code>" in result
    assert "领取成功" in result


# ── 4. Cooldown CMS with variables ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_game_change_cooldown_variables():
    """game_change_cooldown substitutes {provider}, {cooldown_hours}, {next_time}."""
    content = "❌ {provider} 距上次更换不足 {cooldown_hours} 小时。\n请于 {next_time} 后再试。"
    pool = _pool(_row("game_change_cooldown", "zh", content))
    svc = BotMessageService(pool)
    result = await svc.get_message(
        "game_change_cooldown",
        variables={
            "provider": "Pussy888",
            "cooldown_hours": 24,
            "next_time": "2026-07-08 20:00 UTC",
        },
    )
    assert "Pussy888" in result
    assert "24" in result
    assert "2026-07-08 20:00 UTC" in result


# ── 5. Promo list header CMS ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_promo_list_header_cms():
    """promo_list_header returns CMS content."""
    content = "🎁 <b>优惠中心</b>\n\n请选择您感兴趣的优惠："
    pool = _pool(_row("promo_list_header", "zh", content))
    svc = BotMessageService(pool)
    result = await svc.get_message("promo_list_header")
    assert result == content


# ── 6. Promo enter amount CMS ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_promo_enter_amount_cms():
    """promo_enter_amount returns calculator prompt from CMS."""
    content = "🧮 请输入充值金额（RM）\n\n例如：\n100\n300\n500"
    pool = _pool(_row("promo_enter_amount", "zh", content))
    svc = BotMessageService(pool)
    result = await svc.get_message("promo_enter_amount")
    assert "充值金额" in result
    assert "100" in result


# ── 7. My claims empty CMS ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_promo_my_claims_empty_cms():
    """promo_my_claims_empty returns empty-claims message from CMS."""
    content = "🎁 <b>我的优惠</b>\n\n您目前没有进行中的优惠。\n\n点击「🎁 优惠中心」查看可选择的优惠！"
    pool = _pool(_row("promo_my_claims_empty", "zh", content))
    svc = BotMessageService(pool)
    result = await svc.get_message("promo_my_claims_empty")
    assert "没有进行中的优惠" in result


# ── 8. Missing key fallback ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_missing_game_key_returns_key_string():
    """Unknown game key returns the key itself — bot does not crash."""
    pool = _pool()  # no keys seeded
    svc = BotMessageService(pool)
    assert await svc.get_message("game_not_registered") == "game_not_registered"
    assert await svc.get_message("game_change_success") == "game_change_success"
    assert await svc.get_message("promo_unavailable") == "promo_unavailable"


# ── 9. DB offline fallback ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_game_bonus_db_offline_returns_key_string():
    """DB offline → get_message returns key string for game and bonus keys."""
    svc = BotMessageService(_offline_pool())
    assert await svc.get_message("game_select_change_platform") == "game_select_change_platform"
    assert await svc.get_message("promo_list_header") == "promo_list_header"
    assert await svc.get_message("game_claim_success") == "game_claim_success"
    assert await svc.get_message("promo_my_claims_empty") == "promo_my_claims_empty"


# ── Additional coverage ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_game_not_registered_cms():
    """game_not_registered returns CMS text."""
    pool = _pool(_row("game_not_registered", "zh", "您尚未注册。请发送 /start 开始注册。"))
    svc = BotMessageService(pool)
    result = await svc.get_message("game_not_registered")
    assert result == "您尚未注册。请发送 /start 开始注册。"


@pytest.mark.asyncio
async def test_game_no_stock_available_cms():
    """game_no_stock_available returns CMS text."""
    pool = _pool(_row("game_no_stock_available", "zh", "🎮 当前没有可领取的账号，请联系客服。"))
    svc = BotMessageService(pool)
    result = await svc.get_message("game_no_stock_available")
    assert "请联系客服" in result


@pytest.mark.asyncio
async def test_game_change_success_variables():
    """game_change_success substitutes all four variables."""
    content = "✅ 更换成功\n\n🎮 平台：{provider}\n\n📤 旧账号：{old_username}\n📥 新账号：{new_username}\n🔑 密码：{new_password}"
    pool = _pool(_row("game_change_success", "zh", content))
    svc = BotMessageService(pool)
    result = await svc.get_message(
        "game_change_success",
        variables={
            "provider": "Mega888",
            "old_username": "player001",
            "new_username": "<code>player002</code>",
            "new_password": "<code>newpass</code>",
        },
    )
    assert "Mega888" in result
    assert "player001" in result
    assert "<code>player002</code>" in result
    assert "更换成功" in result


@pytest.mark.asyncio
async def test_game_no_new_stock_with_current_info():
    """game_no_new_stock substitutes {current_info} correctly."""
    content = "⚠️ 当前没有可用的新账号。\n您的现有账号保持不变。{current_info}"
    pool = _pool(_row("game_no_new_stock", "zh", content))
    svc = BotMessageService(pool)

    # With current account info
    result = await svc.get_message(
        "game_no_new_stock",
        variables={"current_info": "\n账号：player001\n密码：pass123"},
    )
    assert "player001" in result
    assert "pass123" in result

    # Without current account info (empty string)
    result_empty = await svc.get_message(
        "game_no_new_stock",
        variables={"current_info": ""},
    )
    assert "当前没有可用的新账号" in result_empty
    assert "player001" not in result_empty


@pytest.mark.asyncio
async def test_promo_min_not_met_format_spec():
    """promo_min_not_met formats {min_dep:.2f} with Decimal value."""
    from decimal import Decimal
    content = "⚠️ 此优惠最低充值为 RM{min_dep:.2f}\n\n请重新输入金额："
    pool = _pool(_row("promo_min_not_met", "zh", content))
    svc = BotMessageService(pool)
    result = await svc.get_message(
        "promo_min_not_met",
        variables={"min_dep": Decimal("100.00")},
    )
    assert "RM100.00" in result


@pytest.mark.asyncio
async def test_promo_none_active_cms():
    """promo_none_active returns CMS text when no promotions exist."""
    pool = _pool(_row("promo_none_active", "zh", "目前暂无进行中的优惠。敬请期待！"))
    svc = BotMessageService(pool)
    result = await svc.get_message("promo_none_active")
    assert result == "目前暂无进行中的优惠。敬请期待！"


@pytest.mark.asyncio
async def test_game_account_not_found_cms():
    """game_account_not_found returns CMS text."""
    pool = _pool(_row("game_account_not_found", "zh", "找不到该平台账号。"))
    svc = BotMessageService(pool)
    result = await svc.get_message("game_account_not_found")
    assert result == "找不到该平台账号。"
