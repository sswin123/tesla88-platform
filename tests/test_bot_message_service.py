"""Tests for BotMessageService — Phase 5.8 Task 2.

8 scenarios:
  1. Get message by key
  2. Variable replacement
  3. Language fallback
  4. Missing key fallback
  5. Cache hit
  6. Cache invalidation
  7. Version reload
  8. Database error fallback

All tests are unit tests (mocked asyncpg pool — no real DB required).
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
import pytest

from bot.services.message_service import BotMessageService


# ── Test helpers ──────────────────────────────────────────────────────────────

def _row(message_key: str, language_code: str, content: str) -> dict:
    """Minimal dict acting as an asyncpg.Record (supports row["field"] access)."""
    return {
        "message_key": message_key,
        "language_code": language_code,
        "content": content,
    }


def _pool(rows=None, version: int = 1) -> MagicMock:
    """Return a mocked asyncpg pool with pre-configured fetch/fetchval responses."""
    p = MagicMock()
    p.fetch = AsyncMock(return_value=rows if rows is not None else [])
    p.fetchval = AsyncMock(return_value=version)
    return p


# ── 1. Get message by key ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_message_by_key():
    """Retrieve a seeded message by its key in the default language."""
    pool = _pool([_row("start_returning_user", "zh", "欢迎回来！")])
    svc = BotMessageService(pool)
    result = await svc.get_message("start_returning_user", language="zh")
    assert result == "欢迎回来！"


@pytest.mark.asyncio
async def test_get_message_returns_string():
    """get_message always returns a str, never None or bytes."""
    pool = _pool([_row("btn_home", "zh", "🏠 主页")])
    svc = BotMessageService(pool)
    result = await svc.get_message("btn_home")
    assert isinstance(result, str)
    assert len(result) > 0


# ── 2. Variable replacement ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_variable_replacement_full():
    """All variables in template are replaced correctly."""
    pool = _pool([_row("welcome_msg", "zh", "你好 {first_name}，余额：{balance}")])
    svc = BotMessageService(pool)
    result = await svc.get_message(
        "welcome_msg",
        variables={"first_name": "John", "balance": "RM100"},
    )
    assert result == "你好 John，余额：RM100"


@pytest.mark.asyncio
async def test_variable_replacement_partial_does_not_crash():
    """Missing variable in template returns the original template — no crash."""
    pool = _pool([_row("msg", "zh", "Hello {name} and {other}")])
    svc = BotMessageService(pool)
    result = await svc.get_message("msg", variables={"name": "John"})  # {other} missing
    assert result == "Hello {name} and {other}"


@pytest.mark.asyncio
async def test_no_variables_returns_template_unchanged():
    """Template with no variables returned as-is."""
    pool = _pool([_row("simple", "zh", "固定文字")])
    svc = BotMessageService(pool)
    result = await svc.get_message("simple")
    assert result == "固定文字"


# ── 3. Language fallback ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_language_fallback_to_zh_when_requested_missing():
    """Requested language not seeded → falls back to zh."""
    pool = _pool([_row("btn_home", "zh", "🏠 主页")])  # Only zh seeded
    svc = BotMessageService(pool)
    result = await svc.get_message("btn_home", language="en")
    assert result == "🏠 主页"


@pytest.mark.asyncio
async def test_requested_language_takes_priority_over_zh():
    """When requested language exists, use it — not the zh default."""
    pool = _pool([
        _row("btn_home", "zh", "主页"),
        _row("btn_home", "en", "Home"),
    ])
    svc = BotMessageService(pool)
    result = await svc.get_message("btn_home", language="en")
    assert result == "Home"


# ── 4. Missing key fallback ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_missing_key_returns_key_string():
    """Unknown message key returns the key string itself — never crashes."""
    pool = _pool([])
    svc = BotMessageService(pool)
    result = await svc.get_message("nonexistent.key")
    assert result == "nonexistent.key"


@pytest.mark.asyncio
async def test_missing_key_with_variables_returns_key_string():
    """Unknown key + variables still returns key safely."""
    pool = _pool([])
    svc = BotMessageService(pool)
    result = await svc.get_message("no.such.key", variables={"x": "y"})
    assert result == "no.such.key"


# ── 5. Cache hit ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cache_hit_db_queried_once_for_multiple_calls():
    """Repeated get_message() calls use cache — DB fetch called exactly once."""
    pool = _pool([_row("start_returning_user", "zh", "欢迎回来！")])
    svc = BotMessageService(pool)
    for _ in range(5):
        await svc.get_message("start_returning_user")
    assert pool.fetch.call_count == 1


@pytest.mark.asyncio
async def test_load_cache_builds_lookup_for_all_keys():
    """All seeded rows are accessible after a single load."""
    pool = _pool([
        _row("key_a", "zh", "A"),
        _row("key_b", "zh", "B"),
        _row("key_c", "zh", "C"),
    ])
    svc = BotMessageService(pool)
    assert await svc.get_message("key_a") == "A"
    assert await svc.get_message("key_b") == "B"
    assert await svc.get_message("key_c") == "C"
    assert pool.fetch.call_count == 1  # All from same load


# ── 6. Cache invalidation ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_invalidation_clears_cache_and_forces_reload():
    """After invalidate_cache(), next get_message() re-queries the DB."""
    pool = _pool([_row("start_returning_user", "zh", "欢迎回来！")])
    svc = BotMessageService(pool)
    await svc.get_message("start_returning_user")
    assert pool.fetch.call_count == 1

    await svc.invalidate_cache()
    assert not svc._loaded

    await svc.get_message("start_returning_user")
    assert pool.fetch.call_count == 2  # Reloaded from DB


@pytest.mark.asyncio
async def test_reload_cache_fetches_updated_content():
    """reload_cache() picks up new content from DB."""
    pool = _pool([_row("msg", "zh", "旧内容")])
    svc = BotMessageService(pool)
    assert await svc.get_message("msg") == "旧内容"

    # Simulate DB updated with new content
    pool.fetch.return_value = [_row("msg", "zh", "新内容")]
    await svc.reload_cache()
    assert await svc.get_message("msg") == "新内容"


# ── 7. Version reload ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_version_change_triggers_cache_reload():
    """check_and_reload() detects version bump and reloads — returns True."""
    pool = _pool([_row("start_returning_user", "zh", "欢迎回来！")], version=1)
    svc = BotMessageService(pool)
    await svc.load_cache()
    assert svc._version == 1

    pool.fetchval.return_value = 2  # ERP bumped the version
    reloaded = await svc.check_and_reload()
    assert reloaded is True
    assert svc._version == 2


@pytest.mark.asyncio
async def test_same_version_no_reload():
    """check_and_reload() with unchanged version returns False, no extra DB call."""
    pool = _pool([_row("start_returning_user", "zh", "欢迎回来！")], version=1)
    svc = BotMessageService(pool)
    await svc.load_cache()
    fetch_before = pool.fetch.call_count

    reloaded = await svc.check_and_reload()
    assert reloaded is False
    assert pool.fetch.call_count == fetch_before  # No reload


@pytest.mark.asyncio
async def test_get_current_version_returns_db_value():
    """get_current_version() returns the integer from cache_versions table."""
    pool = _pool(version=7)
    svc = BotMessageService(pool)
    v = await svc.get_current_version()
    assert v == 7


# ── 8. Database error fallback ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_db_error_on_fetch_returns_key_fallback():
    """If DB is offline during fetch, get_message returns key string — no crash."""
    pool = MagicMock()
    pool.fetch = AsyncMock(side_effect=OSError("connection refused"))
    pool.fetchval = AsyncMock(side_effect=OSError("connection refused"))
    svc = BotMessageService(pool)
    result = await svc.get_message("some.key")
    assert result == "some.key"


@pytest.mark.asyncio
async def test_db_error_on_version_fetch_still_loads_messages():
    """DB error on version fetch only → messages still loaded with version=0."""
    rows = [_row("msg", "zh", "内容")]
    pool = MagicMock()
    pool.fetch = AsyncMock(return_value=rows)
    pool.fetchval = AsyncMock(side_effect=OSError("version DB error"))
    svc = BotMessageService(pool)
    result = await svc.get_message("msg")
    assert result == "内容"
    assert svc._version == 0  # Falls back to 0 when version unavailable


@pytest.mark.asyncio
async def test_get_current_version_db_error_returns_cached_version():
    """get_current_version() on DB error returns the last known version."""
    pool = _pool(version=5)
    svc = BotMessageService(pool)
    await svc.load_cache()
    assert svc._version == 5

    pool.fetchval = AsyncMock(side_effect=OSError("DB offline"))
    v = await svc.get_current_version()
    assert v == 5  # Returns cached version, not 0
