from __future__ import annotations

from typing import Optional

import asyncpg


async def get_admin_by_telegram_id(
    pool: asyncpg.Pool, telegram_id: int
) -> Optional[asyncpg.Record]:
    return await pool.fetchrow(
        "SELECT * FROM admins WHERE telegram_id = $1", telegram_id
    )


async def create_or_ensure_super_admin(
    pool: asyncpg.Pool, telegram_id: int
) -> None:
    await pool.execute(
        """
        INSERT INTO admins (telegram_id, role)
        VALUES ($1, 'SUPER_ADMIN')
        ON CONFLICT (telegram_id) DO NOTHING
        """,
        telegram_id,
    )


async def add_admin(
    pool: asyncpg.Pool,
    telegram_id: int,
    role: str,
    added_by: int,
) -> asyncpg.Record:
    return await pool.fetchrow(
        """
        INSERT INTO admins (telegram_id, role, added_by)
        VALUES ($1, $2, $3)
        ON CONFLICT (telegram_id) DO UPDATE
            SET role = EXCLUDED.role, added_by = EXCLUDED.added_by
            WHERE admins.role != 'SUPER_ADMIN'
        RETURNING *
        """,
        telegram_id, role, added_by,
    )


async def remove_admin(pool: asyncpg.Pool, telegram_id: int) -> bool:
    result = await pool.execute(
        "DELETE FROM admins WHERE telegram_id = $1 AND role != 'SUPER_ADMIN'",
        telegram_id,
    )
    return result == "DELETE 1"


async def list_admins(pool: asyncpg.Pool) -> list[asyncpg.Record]:
    return await pool.fetch(
        "SELECT * FROM admins ORDER BY created_at ASC"
    )
