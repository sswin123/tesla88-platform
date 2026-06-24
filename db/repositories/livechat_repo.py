from __future__ import annotations

from typing import Optional

import asyncpg


async def create_support_session(
    pool: asyncpg.Pool, user_id: int
) -> asyncpg.Record:
    return await pool.fetchrow(
        """
        INSERT INTO support_sessions (user_id, last_message_at)
        VALUES ($1, NOW())
        RETURNING *
        """,
        user_id,
    )


async def get_open_or_active_session(
    pool: asyncpg.Pool, user_id: int
) -> Optional[asyncpg.Record]:
    return await pool.fetchrow(
        """
        SELECT * FROM support_sessions
        WHERE user_id = $1 AND status IN ('OPEN', 'ACTIVE')
        ORDER BY created_at DESC
        LIMIT 1
        """,
        user_id,
    )


async def update_session_notification_msg_id(
    pool: asyncpg.Pool, session_id: int, msg_id: int
) -> None:
    await pool.execute(
        "UPDATE support_sessions SET notification_msg_id = $2 WHERE id = $1",
        session_id,
        msg_id,
    )


async def accept_session(
    pool: asyncpg.Pool,
    session_id: int,
    agent_id: int,
    agent_username: str,
) -> Optional[asyncpg.Record]:
    """Atomically accept an OPEN session. Returns updated record or None if already taken."""
    return await pool.fetchrow(
        """
        UPDATE support_sessions
        SET status         = 'ACTIVE',
            agent_id       = $2,
            agent_username = $3,
            accepted_at    = NOW()
        WHERE id = $1 AND status = 'OPEN'
        RETURNING *
        """,
        session_id,
        agent_id,
        agent_username,
    )


async def get_session_with_user(
    pool: asyncpg.Pool, session_id: int
) -> Optional[asyncpg.Record]:
    """Fetch session joined with user info (telegram_id, first_name, phone)."""
    return await pool.fetchrow(
        """
        SELECT ss.*, u.telegram_id, u.first_name, u.phone
        FROM support_sessions ss
        JOIN users u ON u.id = ss.user_id
        WHERE ss.id = $1
        """,
        session_id,
    )


async def store_message(
    pool: asyncpg.Pool,
    *,
    session_id: int,
    sender_type: str,
    msg_type: str,
    user_msg_id: Optional[int],
    group_msg_id: Optional[int],
    content: Optional[str],
) -> None:
    await pool.execute(
        """
        INSERT INTO support_messages
            (session_id, sender_type, message_type, user_msg_id, group_msg_id, content)
        VALUES ($1, $2, $3, $4, $5, $6)
        """,
        session_id,
        sender_type,
        msg_type,
        user_msg_id,
        group_msg_id,
        content,
    )


async def get_session_by_group_msg_id(
    pool: asyncpg.Pool, group_msg_id: int
) -> Optional[asyncpg.Record]:
    """Return the ACTIVE session (with telegram_id) that owns a given group message."""
    return await pool.fetchrow(
        """
        SELECT ss.*, u.telegram_id
        FROM support_messages sm
        JOIN support_sessions ss ON ss.id = sm.session_id
        JOIN users u ON u.id = ss.user_id
        WHERE sm.group_msg_id = $1
        LIMIT 1
        """,
        group_msg_id,
    )


async def update_last_message_at(pool: asyncpg.Pool, session_id: int) -> None:
    await pool.execute(
        "UPDATE support_sessions SET last_message_at = NOW() WHERE id = $1",
        session_id,
    )


async def update_session_control_msg_id(
    pool: asyncpg.Pool, session_id: int, msg_id: int
) -> None:
    await pool.execute(
        "UPDATE support_sessions SET control_msg_id = $2 WHERE id = $1",
        session_id,
        msg_id,
    )


async def close_session(
    pool: asyncpg.Pool, session_id: int, reason: str
) -> Optional[asyncpg.Record]:
    """Close an ACTIVE session. Returns updated record or None if already closed."""
    return await pool.fetchrow(
        """
        UPDATE support_sessions
        SET status      = 'CLOSED',
            closed_at   = NOW(),
            close_reason = $2
        WHERE id = $1 AND status = 'ACTIVE'
        RETURNING *
        """,
        session_id,
        reason,
    )
