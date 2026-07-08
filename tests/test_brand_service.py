"""Tests for BrandService — Phase 6.0 Task 3.

6 scenarios:
  1. Load brand from DB
  2. Brand fallback (DB row absent / DB error)
  3. Message variable replacement (BotMessageService + BrandService)
  4. Cache reload (check_and_reload triggers on version change)
  5. Brand update reflected (reload picks up new values)
  6. Missing DB does not crash bot

All tests are unit tests (mocked asyncpg pool — no real DB required).
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
import pytest

from bot.services.brand_service import BrandService
from bot.services.message_service import BotMessageService


# ── Test helpers ──────────────────────────────────────────────────────────────

def _brand_row(**overrides) -> dict:
    """Minimal brand_settings dict (asyncpg.Record-like)."""
    base = {
        "id": 1,
        "brand_name": "SSWIN88",
        "company_name": "SSWIN88 Sdn Bhd",
        "tagline": None,
        "logo_media_id": None,
        "favicon_media_id": None,
        "primary_color": "#1d4ed8",
        "secondary_color": "#1e40af",
        "theme_mode": "light",
        "website_domain": "https://sswin88.com",
        "api_domain": None,
        "support_whatsapp": "+60123456789",
        "support_telegram": None,
        "telegram_channel": "@sswin88_channel",
        "facebook_url": None,
        "seo_title": None,
        "seo_description": None,
        "seo_keywords": None,
    }
    base.update(overrides)
    return base


def _pool(row=None, version: int = 1, fetch_error=None, version_error=None) -> MagicMock:
    """Return a mocked asyncpg pool for BrandService."""
    p = MagicMock()
    if fetch_error:
        p.fetchrow = AsyncMock(side_effect=fetch_error)
    else:
        p.fetchrow = AsyncMock(return_value=row)
    if version_error:
        p.fetchval = AsyncMock(side_effect=version_error)
    else:
        p.fetchval = AsyncMock(return_value=version)
    return p


def _msg_pool(rows=None, version: int = 1) -> MagicMock:
    """Return a mocked asyncpg pool for BotMessageService."""
    p = MagicMock()
    p.fetch = AsyncMock(return_value=rows if rows is not None else [])
    p.fetchval = AsyncMock(return_value=version)
    return p


# ── 1. Load brand from DB ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_load_brand_from_db():
    """BrandService.get_brand() returns DB row after loading."""
    row = _brand_row()
    pool = _pool(row=row)
    svc = BrandService(pool)

    brand = await svc.get_brand()

    assert brand["brand_name"] == "SSWIN88"
    assert brand["company_name"] == "SSWIN88 Sdn Bhd"
    assert brand["support_whatsapp"] == "+60123456789"
    assert brand["telegram_channel"] == "@sswin88_channel"
    assert brand["website_domain"] == "https://sswin88.com"
    pool.fetchrow.assert_called_once()


@pytest.mark.asyncio
async def test_get_variables_returns_string_dict():
    """get_variables() returns dict of str values for CMS substitution."""
    row = _brand_row()
    svc = BrandService(_pool(row=row))

    variables = await svc.get_variables()

    assert variables["brand_name"] == "SSWIN88"
    assert variables["company_name"] == "SSWIN88 Sdn Bhd"
    assert variables["support_whatsapp"] == "+60123456789"
    assert variables["telegram_channel"] == "@sswin88_channel"
    assert variables["website_domain"] == "https://sswin88.com"
    assert all(isinstance(v, str) for v in variables.values())


@pytest.mark.asyncio
async def test_cache_loaded_once_across_multiple_calls():
    """DB is queried once; subsequent calls use in-memory cache."""
    svc = BrandService(_pool(row=_brand_row()))
    for _ in range(5):
        await svc.get_brand()
    # fetchrow should only be called once (first call; rest hit cache)
    assert svc._pool.fetchrow.call_count == 1


# ── 2. Brand fallback ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_brand_fallback_when_db_row_absent():
    """When brand_settings has no row (None), fallback defaults are used."""
    svc = BrandService(_pool(row=None))
    brand = await svc.get_brand()
    # Fallback values
    assert brand["brand_name"] == "SSWIN88"
    assert brand["primary_color"] == "#1d4ed8"


@pytest.mark.asyncio
async def test_brand_fallback_on_db_error():
    """DB fetch exception → fallback to SSWIN88 defaults, no crash."""
    svc = BrandService(_pool(fetch_error=OSError("connection refused")))
    brand = await svc.get_brand()
    assert brand["brand_name"] == "SSWIN88"
    variables = await svc.get_variables()
    assert variables["brand_name"] == "SSWIN88"


# ── 3. Message variable replacement ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_message_variable_brand_name_substituted():
    """BotMessageService auto-injects brand_name from BrandService into templates."""
    msg_pool = _msg_pool([
        {"message_key": "welcome", "language_code": "zh", "content": "欢迎来到 {brand_name}！"},
    ])
    brand_svc = BrandService(_pool(row=_brand_row(brand_name="TestBrand")))
    svc = BotMessageService(msg_pool, brand_service=brand_svc)

    result = await svc.get_message("welcome", language="zh")

    assert result == "欢迎来到 TestBrand！"


@pytest.mark.asyncio
async def test_message_variable_support_whatsapp_substituted():
    """BotMessageService auto-injects support_whatsapp into templates."""
    msg_pool = _msg_pool([
        {"message_key": "help", "language_code": "zh", "content": "联系客服：{support_whatsapp}"},
    ])
    brand_svc = BrandService(_pool(row=_brand_row(support_whatsapp="+60111222333")))
    svc = BotMessageService(msg_pool, brand_service=brand_svc)

    result = await svc.get_message("help", language="zh")

    assert result == "联系客服：+60111222333"


@pytest.mark.asyncio
async def test_caller_variables_override_brand_variables():
    """Caller-supplied variables take priority over auto-injected brand variables."""
    msg_pool = _msg_pool([
        {"message_key": "msg", "language_code": "zh", "content": "{brand_name} - {user}"},
    ])
    brand_svc = BrandService(_pool(row=_brand_row(brand_name="SSWIN88")))
    svc = BotMessageService(msg_pool, brand_service=brand_svc)

    result = await svc.get_message("msg", variables={"brand_name": "OVERRIDE", "user": "Alice"})

    assert result == "OVERRIDE - Alice"


@pytest.mark.asyncio
async def test_message_without_brand_service_still_works():
    """BotMessageService without BrandService works as before (no brand injection)."""
    msg_pool = _msg_pool([
        {"message_key": "key", "language_code": "zh", "content": "Hello {name}"},
    ])
    svc = BotMessageService(msg_pool)  # no brand_service

    result = await svc.get_message("key", variables={"name": "World"})

    assert result == "Hello World"


# ── 4. Cache reload ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_check_and_reload_triggers_on_version_change():
    """check_and_reload() detects DB version bump and reloads — returns True."""
    pool = _pool(row=_brand_row(), version=1)
    svc = BrandService(pool)
    await svc.load_cache()
    assert svc._version == 1

    pool.fetchval.return_value = 2  # ERP bumped the version
    reloaded, _, _ = await svc.check_and_reload()

    assert reloaded is True
    assert svc._version == 2


@pytest.mark.asyncio
async def test_check_and_reload_no_op_when_version_unchanged():
    """check_and_reload() with same version returns False and skips DB fetch."""
    pool = _pool(row=_brand_row(), version=3)
    svc = BrandService(pool)
    await svc.load_cache()
    fetch_count_before = pool.fetchrow.call_count

    reloaded, _, _ = await svc.check_and_reload()

    assert reloaded is False
    assert pool.fetchrow.call_count == fetch_count_before  # no extra DB call


@pytest.mark.asyncio
async def test_check_and_reload_reports_name_change():
    """check_and_reload() returns old/new brand_name when brand_name changed."""
    pool = _pool(row=_brand_row(brand_name="OldBrand"), version=1)
    svc = BrandService(pool)
    await svc.load_cache()

    # Simulate ERP update: version bumped, brand_name changed
    pool.fetchval.return_value = 2
    pool.fetchrow.return_value = _brand_row(brand_name="NewBrand")

    reloaded, old_name, new_name = await svc.check_and_reload()

    assert reloaded is True
    assert old_name == "OldBrand"
    assert new_name == "NewBrand"


@pytest.mark.asyncio
async def test_check_and_reload_no_name_change_returns_none():
    """When brand_name is unchanged, old/new are None even if reloaded."""
    pool = _pool(row=_brand_row(brand_name="SSWIN88"), version=1)
    svc = BrandService(pool)
    await svc.load_cache()

    pool.fetchval.return_value = 2  # version bumped but name unchanged
    reloaded, old_name, new_name = await svc.check_and_reload()

    assert reloaded is True
    assert old_name is None
    assert new_name is None


# ── 5. Brand update reflected ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_brand_update_reflected_after_reload():
    """reload_cache() picks up new brand values from DB."""
    pool = _pool(row=_brand_row(brand_name="OldBrand"))
    svc = BrandService(pool)
    assert (await svc.get_brand())["brand_name"] == "OldBrand"

    # Simulate ERP update
    pool.fetchrow.return_value = _brand_row(brand_name="UpdatedBrand")
    await svc.reload_cache()

    assert (await svc.get_brand())["brand_name"] == "UpdatedBrand"


@pytest.mark.asyncio
async def test_invalidate_cache_forces_next_call_to_reload():
    """After invalidate_cache(), next get_brand() re-queries the DB."""
    pool = _pool(row=_brand_row())
    svc = BrandService(pool)
    await svc.get_brand()
    assert pool.fetchrow.call_count == 1

    await svc.invalidate_cache()
    assert not svc._loaded

    await svc.get_brand()
    assert pool.fetchrow.call_count == 2


# ── 6. Missing DB does not crash bot ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_db_error_does_not_crash_get_brand():
    """DB fetch exception → returns SSWIN88 fallback, never raises."""
    svc = BrandService(_pool(fetch_error=OSError("DB offline")))
    brand = await svc.get_brand()
    assert isinstance(brand, dict)
    assert brand["brand_name"] == "SSWIN88"


@pytest.mark.asyncio
async def test_db_error_does_not_crash_get_variables():
    """DB error → get_variables() returns default brand values, never raises."""
    svc = BrandService(_pool(fetch_error=OSError("DB offline")))
    variables = await svc.get_variables()
    assert variables["brand_name"] == "SSWIN88"
    assert isinstance(variables, dict)


@pytest.mark.asyncio
async def test_db_error_on_version_fetch_still_loads_brand():
    """Version fetch failure → brand row still loaded with version=0."""
    pool = _pool(row=_brand_row(brand_name="Test"), version_error=OSError("version DB error"))
    svc = BrandService(pool)
    brand = await svc.get_brand()
    assert brand["brand_name"] == "Test"
    assert svc._version == 0


@pytest.mark.asyncio
async def test_check_and_reload_db_error_returns_no_reload():
    """check_and_reload() on DB version error returns False — no reload."""
    pool = _pool(row=_brand_row(), version=5)
    svc = BrandService(pool)
    await svc.load_cache()
    assert svc._version == 5

    pool.fetchval = AsyncMock(side_effect=OSError("DB offline"))
    reloaded, _, _ = await svc.check_and_reload()

    assert reloaded is False
