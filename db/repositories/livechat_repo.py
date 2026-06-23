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
