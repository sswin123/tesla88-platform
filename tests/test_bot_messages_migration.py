"""Tests for Phase 5.8 — migration 031 bot messages tables."""
from __future__ import annotations
import pytest

# These tests connect to the real DB via the pool fixture in conftest.py.
# They are READ-ONLY and safe to run against production.

EXPECTED_TABLES = {
    "bot_message_keys",
    "bot_message_translations",
    "bot_message_history",
    "bot_buttons",
    "cache_versions",
}

EXPECTED_CATEGORY_COUNTS = {
    "WELCOME": 4,
    "REGISTER": 17,
    "DEPOSIT": 21,
    "WITHDRAW": 12,
    "GAME": 11,
    "PROMOTION": 10,
    "SUPPORT": 9,
    "HISTORY": 4,
    "BUTTON": 19,
    "PROFILE": 9,
}

SPOT_CHECK_KEYS = [
    "start_returning_user",
    "register_success",
    "deposit_confirm",
    "withdraw_confirm",
    "game_claim_success",
    "promo_list_header",
    "support_submitted",
    "history_deposit_header",
    "btn_home",
    "profile_header",
]


@pytest.mark.asyncio
async def test_tables_exist(pool):
    rows = await pool.fetch(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
    )
    existing = {r["tablename"] for r in rows}
    for table in EXPECTED_TABLES:
        assert table in existing, f"Table '{table}' not found"


@pytest.mark.asyncio
async def test_total_message_keys(pool):
    count = await pool.fetchval("SELECT COUNT(*) FROM bot_message_keys")
    assert count == 116, f"Expected 116 message keys, got {count}"


@pytest.mark.asyncio
async def test_total_translations(pool):
    count = await pool.fetchval("SELECT COUNT(*) FROM bot_message_translations")
    assert count == 116, f"Expected 116 translations, got {count}"


@pytest.mark.asyncio
async def test_category_counts(pool):
    rows = await pool.fetch(
        "SELECT category, COUNT(*) AS cnt FROM bot_message_keys GROUP BY category"
    )
    actual = {r["category"]: r["cnt"] for r in rows}
    for cat, expected in EXPECTED_CATEGORY_COUNTS.items():
        assert actual.get(cat) == expected, (
            f"Category {cat}: expected {expected}, got {actual.get(cat)}"
        )


@pytest.mark.asyncio
async def test_seed_content_matches(pool):
    """content and seed_content must be identical at seed time."""
    mismatched = await pool.fetchval(
        "SELECT COUNT(*) FROM bot_message_translations WHERE content != seed_content"
    )
    assert mismatched == 0, f"{mismatched} rows have content != seed_content"


@pytest.mark.asyncio
async def test_no_draft_content_at_seed(pool):
    drafts = await pool.fetchval(
        "SELECT COUNT(*) FROM bot_message_translations WHERE draft_content IS NOT NULL"
    )
    assert drafts == 0, "Seed data should not have draft_content set"


@pytest.mark.asyncio
async def test_spot_check_keys_exist(pool):
    for key in SPOT_CHECK_KEYS:
        row = await pool.fetchrow(
            "SELECT id FROM bot_message_keys WHERE message_key = $1", key
        )
        assert row is not None, f"message_key '{key}' not found in bot_message_keys"


@pytest.mark.asyncio
async def test_translations_have_content(pool):
    """No translation should have empty content."""
    empty = await pool.fetchval(
        "SELECT COUNT(*) FROM bot_message_translations WHERE content = '' OR content IS NULL"
    )
    assert empty == 0, f"{empty} translations have empty content"


@pytest.mark.asyncio
async def test_cache_versions_seeded(pool):
    rows = await pool.fetch("SELECT component, version FROM cache_versions ORDER BY component")
    components = {r["component"]: r["version"] for r in rows}
    assert "bot_messages" in components, "cache_versions missing bot_messages"
    assert "bot_buttons" in components, "cache_versions missing bot_buttons"
    assert components["bot_messages"] == 1
    assert components["bot_buttons"] == 1


@pytest.mark.asyncio
async def test_bot_buttons_seeded(pool):
    count = await pool.fetchval("SELECT COUNT(*) FROM bot_buttons")
    assert count == 13, f"Expected 13 bot_buttons rows, got {count}"
    groups = await pool.fetch(
        "SELECT DISTINCT group_key FROM bot_buttons ORDER BY group_key"
    )
    group_keys = {r["group_key"] for r in groups}
    assert "main_menu" in group_keys
    assert "navigation" in group_keys


@pytest.mark.asyncio
async def test_history_table_empty_at_seed(pool):
    """History is written only on publish, never at seed time."""
    count = await pool.fetchval("SELECT COUNT(*) FROM bot_message_history")
    assert count == 0, f"History should be empty after seed, got {count} rows"


@pytest.mark.asyncio
async def test_trigger_records_history_on_content_change(pool):
    """Verify history trigger fires when content changes (but not on draft_content changes)."""
    key_id = await pool.fetchval(
        "SELECT id FROM bot_message_keys WHERE message_key = 'cancel_done'"
    )
    trans_id = await pool.fetchval(
        "SELECT id FROM bot_message_translations WHERE key_id = $1 AND language_code = 'zh'",
        key_id,
    )
    original = await pool.fetchval(
        "SELECT content FROM bot_message_translations WHERE id = $1", trans_id
    )

    # Set draft_content — should NOT trigger history
    await pool.execute(
        "UPDATE bot_message_translations SET draft_content = 'draft only' WHERE id = $1",
        trans_id,
    )
    history_count = await pool.fetchval(
        "SELECT COUNT(*) FROM bot_message_history WHERE translation_id = $1", trans_id
    )
    assert history_count == 0, "Draft save must not create history entry"

    # Change content (simulate publish) — SHOULD trigger history
    await pool.execute(
        "UPDATE bot_message_translations SET content = '❌ 已取消 (test)', updated_by = 'test' WHERE id = $1",
        trans_id,
    )
    history_count = await pool.fetchval(
        "SELECT COUNT(*) FROM bot_message_history WHERE translation_id = $1", trans_id
    )
    assert history_count == 1, "Content change must create exactly one history entry"

    # Restore original
    await pool.execute(
        "UPDATE bot_message_translations SET content = $1, draft_content = NULL, updated_by = NULL WHERE id = $2",
        original, trans_id,
    )
    # cleanup the history entry we created
    await pool.execute(
        "DELETE FROM bot_message_history WHERE translation_id = $1", trans_id
    )
