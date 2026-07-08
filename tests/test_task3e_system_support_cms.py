"""Tests for Phase 5.8 Task 3E — System / Support / History CMS migration.

8 scenarios:
  History:
    1. history_deposit_empty returns CMS text
    2. history_deposit_header returns CMS text
    3. history_withdraw_empty returns CMS text
    4. history_withdraw_header returns CMS text

  Support:
    5. support_not_registered returns CMS text
    6. support_session_exists substitutes {session_id}
    7. support_submitted substitutes {session_id}
    8. support_cancelled / support_account_frozen / support_system_busy / support_menu

  Fallback:
    9. Missing key returns key string (no crash)
    10. DB offline returns key string (no crash)
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


# ── 1. history_deposit_empty ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_history_deposit_empty_cms():
    """history_deposit_empty returns CMS text."""
    pool = _pool(_row("history_deposit_empty", "zh", "📜 充值记录\n\n暂无充值记录。"))
    svc = BotMessageService(pool)
    result = await svc.get_message("history_deposit_empty")
    assert result == "📜 充值记录\n\n暂无充值记录。"


# ── 2. history_deposit_header ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_history_deposit_header_cms():
    """history_deposit_header returns CMS text (no trailing newline in DB)."""
    pool = _pool(_row("history_deposit_header", "zh", "📜 充值记录（最近 10 条）"))
    svc = BotMessageService(pool)
    result = await svc.get_message("history_deposit_header")
    assert result == "📜 充值记录（最近 10 条）"


# ── 3. history_withdraw_empty ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_history_withdraw_empty_cms():
    """history_withdraw_empty returns CMS text."""
    pool = _pool(_row("history_withdraw_empty", "zh", "📜 提款记录\n\n暂无提款记录。"))
    svc = BotMessageService(pool)
    result = await svc.get_message("history_withdraw_empty")
    assert result == "📜 提款记录\n\n暂无提款记录。"


# ── 4. history_withdraw_header ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_history_withdraw_header_cms():
    """history_withdraw_header returns CMS text."""
    pool = _pool(_row("history_withdraw_header", "zh", "📜 提款记录（最近 10 条）"))
    svc = BotMessageService(pool)
    result = await svc.get_message("history_withdraw_header")
    assert result == "📜 提款记录（最近 10 条）"


# ── 5. support_not_registered ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_support_not_registered_cms():
    """support_not_registered returns CMS text."""
    pool = _pool(_row("support_not_registered", "zh", "您尚未注册。请发送 /start 开始注册。"))
    svc = BotMessageService(pool)
    result = await svc.get_message("support_not_registered")
    assert result == "您尚未注册。请发送 /start 开始注册。"


# ── 6. support_session_exists with {session_id} ───────────────────────────────

@pytest.mark.asyncio
async def test_support_session_exists_variable_replacement():
    """support_session_exists substitutes #{session_id} correctly."""
    content = "⚠️ 您已有进行中的客服会话。\n\n会话编号：#{session_id}\n\n请直接发送消息继续沟通。"
    pool = _pool(_row("support_session_exists", "zh", content))
    svc = BotMessageService(pool)
    result = await svc.get_message(
        "support_session_exists",
        variables={"session_id": 42},
    )
    assert "#42" in result
    assert "请直接发送消息继续沟通" in result


# ── 7. support_submitted with {session_id} ────────────────────────────────────

@pytest.mark.asyncio
async def test_support_submitted_variable_replacement():
    """support_submitted substitutes #{session_id} correctly."""
    content = "✅ 客服请求已提交\n\n会话编号：\n#{session_id}\n\n客服将尽快为您服务。\n\n请保持在线。"
    pool = _pool(_row("support_submitted", "zh", content))
    svc = BotMessageService(pool)
    result = await svc.get_message(
        "support_submitted",
        variables={"session_id": 99},
    )
    assert "#99" in result
    assert "客服请求已提交" in result
    assert "请保持在线" in result


# ── 8. support_cancelled / account_frozen / system_busy / menu ───────────────

@pytest.mark.asyncio
async def test_support_cancelled_cms():
    """support_cancelled returns CMS text."""
    pool = _pool(_row("support_cancelled", "zh", "❌ 已取消客服请求。"))
    svc = BotMessageService(pool)
    result = await svc.get_message("support_cancelled")
    assert result == "❌ 已取消客服请求。"


@pytest.mark.asyncio
async def test_support_account_frozen_cms():
    """support_account_frozen returns CMS text."""
    pool = _pool(_row("support_account_frozen", "zh", "❌ 您的账号已被冻结，无法联系客服。"))
    svc = BotMessageService(pool)
    result = await svc.get_message("support_account_frozen")
    assert "冻结" in result


@pytest.mark.asyncio
async def test_support_system_busy_cms():
    """support_system_busy returns CMS text."""
    pool = _pool(_row("support_system_busy", "zh", "⚠️ 系统繁忙，请稍后重试。"))
    svc = BotMessageService(pool)
    result = await svc.get_message("support_system_busy")
    assert "系统繁忙" in result


@pytest.mark.asyncio
async def test_support_menu_cms():
    """support_menu returns CMS livechat instructions."""
    content = "💬 联系客服\n\n请描述您遇到的问题。\n\n支持：\n✅ 文字\n✅ 图片\n✅ 文件\n✅ 语音\n\n客服会尽快回复您。"
    pool = _pool(_row("support_menu", "zh", content))
    svc = BotMessageService(pool)
    result = await svc.get_message("support_menu")
    assert "联系客服" in result
    assert "✅ 文字" in result


# ── 9. Missing key fallback ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_missing_history_support_key_returns_key_string():
    """Unknown key returns the key string — bot does not crash."""
    pool = _pool()  # no keys seeded
    svc = BotMessageService(pool)
    assert await svc.get_message("history_deposit_empty") == "history_deposit_empty"
    assert await svc.get_message("support_not_registered") == "support_not_registered"
    assert await svc.get_message("support_submitted") == "support_submitted"


# ── 10. DB offline fallback ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_history_support_db_offline_returns_key_string():
    """DB offline → get_message returns key string for all Task 3E keys."""
    svc = BotMessageService(_offline_pool())
    assert await svc.get_message("history_deposit_empty") == "history_deposit_empty"
    assert await svc.get_message("history_withdraw_header") == "history_withdraw_header"
    assert await svc.get_message("support_session_exists") == "support_session_exists"
    assert await svc.get_message("support_submitted") == "support_submitted"
    assert await svc.get_message("support_cancelled") == "support_cancelled"
