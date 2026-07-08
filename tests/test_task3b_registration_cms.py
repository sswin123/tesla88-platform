"""Tests for Phase 5.8 Task 3B — Registration flow CMS migration.

7 scenarios:
  1. Registration start loads CMS text (start_new_user)
  2. Phone request CMS text (register_enter_phone)
  3. Validation error CMS text (register_phone_invalid)
  4. Success message CMS text (register_success)
  5. Variable replacement in register_success
  6. Missing message key fallback (returns key string)
  7. Database offline fallback (returns key string, no crash)

Additional coverage:
  8. register_telegram_exists key present
  9. register_phone_exists key present
 10. register_bank_selected with {bank_name} variable
 11. register_back_to_phone with {hint} variable
 12. register_conflict_error key present
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


# ── 1. Registration start loads CMS text ─────────────────────────────────────

@pytest.mark.asyncio
async def test_registration_start_cms_text():
    """start_new_user key returns seeded CMS content."""
    pool = _pool(_row("start_new_user", "zh", "欢迎注册会员\n\n请选择："))
    svc = BotMessageService(pool)
    result = await svc.get_message("start_new_user")
    assert result == "欢迎注册会员\n\n请选择："


# ── 2. Phone request CMS text ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_enter_phone_cms_text():
    """register_enter_phone returns the phone prompt from CMS."""
    content = "请输入您的电话号码：\n\n支持格式：\n  0123456789\n  60123456789\n  +60123456789"
    pool = _pool(_row("register_enter_phone", "zh", content))
    svc = BotMessageService(pool)
    result = await svc.get_message("register_enter_phone")
    assert "请输入您的电话号码" in result
    assert "0123456789" in result


# ── 3. Validation error CMS text ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_phone_invalid_cms_text():
    """register_phone_invalid returns validation error text from CMS."""
    content = "电话号码格式不正确，请重新输入："
    pool = _pool(_row("register_phone_invalid", "zh", content))
    svc = BotMessageService(pool)
    result = await svc.get_message("register_phone_invalid")
    assert "格式不正确" in result


# ── 4. Success message CMS text ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_success_cms_text():
    """register_success key is resolved from CMS."""
    content = "✅ 注册成功！\n\n📱 电话：{phone}\n🏦 银行：{bank_name}\n💳 账号：{bank_account}\n👤 户口姓名：{bank_holder_name}\n\n欢迎加入会员系统。\n\n请从下方菜单开始使用。"
    pool = _pool(_row("register_success", "zh", content))
    svc = BotMessageService(pool)
    result = await svc.get_message(
        "register_success",
        variables={
            "phone": "+60123456789",
            "bank_name": "Maybank",
            "bank_account": "112233445566",
            "bank_holder_name": "Ali Bin Ahmad",
        },
    )
    assert "注册成功" in result
    assert "+60123456789" in result
    assert "Maybank" in result


# ── 5. Variable replacement works ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_success_variable_replacement():
    """All four variables in register_success are substituted correctly."""
    content = "✅ 注册成功！\n\n📱 电话：{phone}\n🏦 银行：{bank_name}\n💳 账号：{bank_account}\n👤 户口姓名：{bank_holder_name}\n\n欢迎加入会员系统。\n\n请从下方菜单开始使用。"
    pool = _pool(_row("register_success", "zh", content))
    svc = BotMessageService(pool)
    result = await svc.get_message(
        "register_success",
        variables={
            "phone": "+60199990001",
            "bank_name": "CIMB",
            "bank_account": "8001234567",
            "bank_holder_name": "Tan Ah Kow",
        },
    )
    assert result == content.format(
        phone="+60199990001",
        bank_name="CIMB",
        bank_account="8001234567",
        bank_holder_name="Tan Ah Kow",
    )


# ── 6. Missing message key fallback ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_missing_registration_key_returns_key_string():
    """Unknown key returns the key itself — bot does not crash."""
    pool = _pool()  # No keys seeded
    svc = BotMessageService(pool)
    result = await svc.get_message("register_enter_phone")
    assert result == "register_enter_phone"


# ── 7. Database offline fallback ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_registration_db_offline_returns_key_string():
    """DB offline during registration → returns key string, no exception."""
    svc = BotMessageService(_offline_pool())
    result = await svc.get_message("register_success")
    assert result == "register_success"


# ── Additional coverage ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_telegram_exists_key():
    """register_telegram_exists returns the duplicate-Telegram alert text."""
    pool = _pool(_row("register_telegram_exists", "zh", "此 Telegram 已注册。"))
    svc = BotMessageService(pool)
    result = await svc.get_message("register_telegram_exists")
    assert result == "此 Telegram 已注册。"


@pytest.mark.asyncio
async def test_register_phone_exists_key():
    """register_phone_exists returns the duplicate-phone error text."""
    pool = _pool(_row("register_phone_exists", "zh", "此电话号码已注册。"))
    svc = BotMessageService(pool)
    result = await svc.get_message("register_phone_exists")
    assert result == "此电话号码已注册。"


@pytest.mark.asyncio
async def test_register_bank_selected_with_variable():
    """register_bank_selected substitutes {bank_name} correctly."""
    pool = _pool(_row("register_bank_selected", "zh", "已选择：{bank_name}\n\n请输入银行账号："))
    svc = BotMessageService(pool)
    result = await svc.get_message("register_bank_selected", variables={"bank_name": "Maybank"})
    assert result == "已选择：Maybank\n\n请输入银行账号："


@pytest.mark.asyncio
async def test_register_back_to_phone_with_hint():
    """register_back_to_phone substitutes {hint} correctly."""
    content = "请重新输入电话号码：\n\n{hint}支持格式：\n  0123456789\n  60123456789\n  +60123456789"
    pool = _pool(_row("register_back_to_phone", "zh", content))
    svc = BotMessageService(pool)

    hint = "（上次输入：+60199990001）\n\n"
    result = await svc.get_message("register_back_to_phone", variables={"hint": hint})
    assert "上次输入" in result
    assert "+60199990001" in result

    result_no_hint = await svc.get_message("register_back_to_phone", variables={"hint": ""})
    assert "上次输入" not in result_no_hint


@pytest.mark.asyncio
async def test_register_conflict_error_key():
    """register_conflict_error returns the registration-failed text."""
    pool = _pool(_row("register_conflict_error", "zh", "注册失败：信息冲突，请重新注册。"))
    svc = BotMessageService(pool)
    result = await svc.get_message("register_conflict_error")
    assert result == "注册失败：信息冲突，请重新注册。"
