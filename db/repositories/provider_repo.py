from __future__ import annotations

import asyncpg


async def get_active_providers(pool: asyncpg.Pool) -> list[str]:
    """Query website_game_providers for active providers ordered by display_order."""
    rows = await pool.fetch(
        """SELECT provider_name FROM website_game_providers
           WHERE is_active = TRUE
           ORDER BY display_order ASC, id ASC"""
    )
    return [r["provider_name"] for r in rows]
