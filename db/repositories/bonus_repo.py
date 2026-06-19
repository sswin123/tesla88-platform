from __future__ import annotations

from typing import Optional

import asyncpg


async def get_active_bonuses(pool: asyncpg.Pool, provider: str) -> list[asyncpg.Record]:
    """Return active bonus types applicable for the given provider."""
    return await pool.fetch(
        """
        SELECT * FROM bonus_types
        WHERE is_active = TRUE
          AND (provider IS NULL OR provider = $1)
        ORDER BY sort_order, id
        """,
        provider,
    )


async def get_bonus_by_id(pool: asyncpg.Pool, bonus_id: int) -> Optional[asyncpg.Record]:
    return await pool.fetchrow(
        "SELECT * FROM bonus_types WHERE id = $1 AND is_active = TRUE",
        bonus_id,
    )
