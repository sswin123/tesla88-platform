from __future__ import annotations

import asyncpg


async def get_buttons_by_group(
    pool: asyncpg.Pool,
    group_key: str,
    language_code: str = "zh",
) -> list[dict]:
    """Return all button rows for a group, ordered by row_order then column_order."""
    rows = await pool.fetch(
        """
        SELECT label, row_order, column_order, is_active
        FROM bot_buttons
        WHERE group_key = $1 AND language_code = $2
        ORDER BY row_order, column_order
        """,
        group_key,
        language_code,
    )
    return [dict(r) for r in rows]
