from __future__ import annotations
import asyncpg


async def get_active_banks(pool: asyncpg.Pool) -> list[asyncpg.Record]:
    return await pool.fetch(
        "SELECT id, bank_name, account_name, account_number "
        "FROM payment_banks WHERE is_active = TRUE "
        "ORDER BY display_order, id"
    )
