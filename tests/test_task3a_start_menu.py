"""Tests for Phase 5.8 Task 3A — /start + main menu CMS integration.

7 scenarios:
  1. /start CMS message returned for returning user key
  2. Variable replacement in start_returning_user
  3. Missing CMS key falls back to key string
  4. DB offline — get_message returns key string (no crash)
  5. Main menu buttons loaded from CMS
  6. Disabled button (is_active=False) hidden from keyboard
  7. Button order (row_order + column_order) respected
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from bot.keyboards.game_accounts import build_main_menu_keyboard_from_cms
from bot.services.message_service import BotMessageService


# ── Helpers ───────────────────────────────────────────────────────────────────

def _msg_pool(rows=None, version: int = 1) -> MagicMock:
    p = MagicMock()
    p.fetch = AsyncMock(return_value=rows if rows is not None else [])
    p.fetchval = AsyncMock(return_value=version)
    return p


def _msg_row(key: str, lang: str, content: str) -> dict:
    return {"message_key": key, "language_code": lang, "content": content}


def _btn_pool(buttons: list[dict]) -> MagicMock:
    """Mock pool whose fetch() returns button rows (for get_buttons_by_group)."""
    p = MagicMock()
    p.fetch = AsyncMock(return_value=buttons)
    return p


def _btn(label: str, row: int, col: int, active: bool = True) -> dict:
    return {"label": label, "row_order": row, "column_order": col, "is_active": active}


# ── 1. /start returns CMS message for returning user ─────────────────────────

@pytest.mark.asyncio
async def test_start_returning_user_cms_message():
    """get_message('start_returning_user') returns seeded CMS content."""
    pool = _msg_pool([_msg_row("start_returning_user", "zh", "欢迎回来，{first_name}！")])
    svc = BotMessageService(pool)
    result = await svc.get_message("start_returning_user", variables={"first_name": "Ali"})
    assert "欢迎回来" in result
    assert "Ali" in result


# ── 2. Variable replacement in returning user message ────────────────────────

@pytest.mark.asyncio
async def test_start_returning_user_variable_replacement():
    """start_returning_user replaces first_name, status_emoji, status."""
    content = "欢迎回来，{first_name}！\n状态：{status_emoji} {status}\n\n请选择操作："
    pool = _msg_pool([_msg_row("start_returning_user", "zh", content)])
    svc = BotMessageService(pool)
    result = await svc.get_message(
        "start_returning_user",
        variables={"first_name": "Ali", "status_emoji": "🟢", "status": "ACTIVE"},
    )
    assert result == "欢迎回来，Ali！\n状态：🟢 ACTIVE\n\n请选择操作："


# ── 3. Missing CMS key fallback ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_start_missing_cms_key_returns_key_string():
    """Unknown message key returns key string — never crashes."""
    pool = _msg_pool([])  # No keys seeded
    svc = BotMessageService(pool)
    result = await svc.get_message("start_returning_user")
    assert result == "start_returning_user"


# ── 4. DB offline — no crash ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_start_db_offline_returns_key_string():
    """DB error during /start → get_message returns key string, no exception raised."""
    pool = MagicMock()
    pool.fetch = AsyncMock(side_effect=OSError("connection refused"))
    pool.fetchval = AsyncMock(side_effect=OSError("connection refused"))
    svc = BotMessageService(pool)
    result = await svc.get_message("start_returning_user")
    assert result == "start_returning_user"


# ── 5. Main menu buttons loaded from CMS ─────────────────────────────────────

@pytest.mark.asyncio
async def test_main_menu_buttons_from_cms():
    """build_main_menu_keyboard_from_cms builds keyboard from DB rows."""
    pool = _btn_pool([
        _btn("📋 我的资料", 0, 0),
        _btn("🎮 我的游戏账号", 0, 1),
        _btn("💰 充值", 1, 0),
        _btn("💸 提款", 1, 1),
    ])
    kb = await build_main_menu_keyboard_from_cms(pool)
    labels = [[btn.text for btn in row] for row in kb.keyboard]
    assert labels[0] == ["📋 我的资料", "🎮 我的游戏账号"]
    assert labels[1] == ["💰 充值", "💸 提款"]


# ── 6. Disabled button hidden ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_main_menu_disabled_button_hidden():
    """Buttons with is_active=False are excluded from the keyboard."""
    pool = _btn_pool([
        _btn("📋 我的资料", 0, 0, active=True),
        _btn("🎮 我的游戏账号", 0, 1, active=False),  # disabled
        _btn("💰 充值", 1, 0, active=True),
    ])
    kb = await build_main_menu_keyboard_from_cms(pool)
    all_labels = [btn.text for row in kb.keyboard for btn in row]
    assert "🎮 我的游戏账号" not in all_labels
    assert "📋 我的资料" in all_labels
    assert "💰 充值" in all_labels


# ── 7. Button order respected ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_main_menu_button_order():
    """Buttons appear in row_order then column_order — regardless of DB return order."""
    # DB returns out of order deliberately
    pool = _btn_pool([
        _btn("C", 1, 1),
        _btn("A", 0, 0),
        _btn("D", 2, 0),
        _btn("B", 0, 1),
    ])
    kb = await build_main_menu_keyboard_from_cms(pool)
    labels = [[btn.text for btn in row] for row in kb.keyboard]
    assert labels[0] == ["A", "B"]
    assert labels[1] == ["C"]
    assert labels[2] == ["D"]


# ── Bonus: DB offline falls back to hardcoded keyboard ────────────────────────

@pytest.mark.asyncio
async def test_main_menu_db_offline_falls_back_to_hardcoded():
    """DB error in build_main_menu_keyboard_from_cms → returns hardcoded keyboard."""
    pool = MagicMock()
    pool.fetch = AsyncMock(side_effect=OSError("DB offline"))
    kb = await build_main_menu_keyboard_from_cms(pool)
    # Hardcoded keyboard has 5 rows
    assert len(kb.keyboard) == 5
