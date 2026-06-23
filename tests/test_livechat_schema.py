from __future__ import annotations

import re
from pathlib import Path

SQL_PATH = Path(__file__).parent.parent / "database.sql"


def _load_sql() -> str:
    return SQL_PATH.read_text()


def _extract_table_block(sql: str, table_name: str) -> str:
    match = re.search(
        rf"CREATE TABLE IF NOT EXISTS {re.escape(table_name)}\s*\((.*?)\);",
        sql,
        re.DOTALL,
    )
    assert match, f"Table '{table_name}' not found in database.sql"
    return match.group(1)


# ── support_sessions ────────────────────────────────────────────────────────


def test_support_sessions_table_exists():
    assert "CREATE TABLE IF NOT EXISTS support_sessions" in _load_sql()


def test_support_sessions_required_columns():
    block = _extract_table_block(_load_sql(), "support_sessions")
    for col in (
        "user_id",
        "agent_id",
        "agent_username",
        "status",
        "notification_msg_id",
        "control_msg_id",
        "last_message_at",
        "accepted_at",
        "closed_at",
        "close_reason",
        "rating",
        "rated_at",
    ):
        assert col in block, f"Column '{col}' missing from support_sessions"


def test_support_sessions_status_values():
    sql = _load_sql()
    # All three status values must appear (in the CHECK constraint)
    for val in ("'OPEN'", "'ACTIVE'", "'CLOSED'"):
        assert val in sql, f"Status value {val} missing from support_sessions"


def test_support_sessions_close_reason_values():
    sql = _load_sql()
    for val in ("'USER'", "'AGENT'", "'TIMEOUT'"):
        assert val in sql, f"close_reason value {val} missing from support_sessions"


def test_support_sessions_rating_columns_present():
    block = _extract_table_block(_load_sql(), "support_sessions")
    assert "rating" in block
    assert "rated_at" in block


def test_support_sessions_agent_username_column():
    block = _extract_table_block(_load_sql(), "support_sessions")
    assert "agent_username" in block


def test_support_sessions_indexes_exist():
    sql = _load_sql()
    assert "idx_sessions_user_status" in sql
    assert "idx_sessions_status" in sql
    assert "idx_sessions_last_message" in sql


# ── support_messages ────────────────────────────────────────────────────────


def test_support_messages_table_exists():
    assert "CREATE TABLE IF NOT EXISTS support_messages" in _load_sql()


def test_support_messages_required_columns():
    block = _extract_table_block(_load_sql(), "support_messages")
    for col in (
        "session_id",
        "sender_type",
        "message_type",
        "user_msg_id",
        "group_msg_id",
        "content",
    ):
        assert col in block, f"Column '{col}' missing from support_messages"


def test_support_messages_sender_type_values():
    sql = _load_sql()
    assert "'USER'" in sql
    assert "'AGENT'" in sql


def test_support_messages_message_type_values():
    sql = _load_sql()
    for val in ("'TEXT'", "'PHOTO'", "'DOCUMENT'", "'VOICE'", "'STICKER'", "'OTHER'"):
        assert val in sql, f"message_type value {val} missing"


def test_support_messages_indexes_exist():
    sql = _load_sql()
    assert "idx_messages_session" in sql
    assert "idx_messages_group_msg_id" in sql


def test_support_messages_fk_references_support_sessions():
    block = _extract_table_block(_load_sql(), "support_messages")
    assert "REFERENCES support_sessions" in block
