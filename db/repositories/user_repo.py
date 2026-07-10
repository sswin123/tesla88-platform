from __future__ import annotations

from typing import Optional

import asyncpg


async def get_user_by_telegram_id(
    pool: asyncpg.Pool, telegram_id: int
) -> Optional[asyncpg.Record]:
    return await pool.fetchrow(
        "SELECT * FROM users WHERE telegram_id = $1", telegram_id
    )


async def get_user_by_phone(
    pool: asyncpg.Pool, phone: str
) -> Optional[asyncpg.Record]:
    return await pool.fetchrow(
        "SELECT * FROM users WHERE phone = $1", phone
    )


async def get_user_by_bank_account(
    pool: asyncpg.Pool, bank_account: str
) -> Optional[asyncpg.Record]:
    return await pool.fetchrow(
        "SELECT * FROM users WHERE bank_account = $1", bank_account
    )


async def get_user_by_id(
    pool: asyncpg.Pool, user_id: int
) -> Optional[asyncpg.Record]:
    return await pool.fetchrow(
        "SELECT * FROM users WHERE id = $1", user_id
    )


async def create_user(
    pool: asyncpg.Pool,
    *,
    telegram_id: int,
    telegram_username: Optional[str],
    first_name: str,
    phone: str,
    bank_name: str,
    bank_account: str,
    bank_holder_name: str,
    eligible_free_credit: bool,
    website_password_hash: Optional[str] = None,
) -> asyncpg.Record:
    new_user = await pool.fetchrow(
        """
        INSERT INTO users (
            telegram_id, telegram_username, first_name,
            phone, bank_name, bank_account, bank_holder_name,
            eligible_free_credit, website_password_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
        """,
        telegram_id, telegram_username, first_name,
        phone, bank_name, bank_account, bank_holder_name,
        eligible_free_credit, website_password_hash,
    )
    prefix_row = await pool.fetchrow(
        "SELECT member_id_prefix FROM brand_settings WHERE id = 1"
    )
    prefix = (prefix_row["member_id_prefix"] if prefix_row else None) or "SS"
    return await pool.fetchrow(
        "UPDATE users SET public_id = $1 WHERE id = $2 RETURNING *",
        f"{prefix}{1000000 + new_user['id']}",
        new_user["id"],
    )


async def update_user_status(
    pool: asyncpg.Pool, user_id: int, status: str
) -> Optional[asyncpg.Record]:
    return await pool.fetchrow(
        "UPDATE users SET status = $1 WHERE id = $2 RETURNING *",
        status, user_id,
    )


async def update_user_bank(
    pool: asyncpg.Pool,
    user_id: int,
    bank_name: str,
    bank_account: str,
    bank_holder_name: str,
) -> Optional[asyncpg.Record]:
    return await pool.fetchrow(
        """
        UPDATE users
        SET bank_name = $1, bank_account = $2, bank_holder_name = $3
        WHERE id = $4
        RETURNING *
        """,
        bank_name, bank_account, bank_holder_name, user_id,
    )


async def get_stats(pool: asyncpg.Pool) -> dict:
    async with pool.acquire() as conn:
        total = await conn.fetchval("SELECT COUNT(*) FROM users")
        today = await conn.fetchval(
            "SELECT COUNT(*) FROM users WHERE created_at >= CURRENT_DATE"
        )
        this_week = await conn.fetchval(
            "SELECT COUNT(*) FROM users "
            "WHERE created_at >= date_trunc('week', NOW())"
        )
        free_credit = await conn.fetchval(
            "SELECT COUNT(*) FROM users WHERE eligible_free_credit = TRUE"
        )
        frozen = await conn.fetchval(
            "SELECT COUNT(*) FROM users WHERE status = 'FROZEN'"
        )
        admin_count = await conn.fetchval("SELECT COUNT(*) FROM admins")
    return {
        "total": total,
        "today": today,
        "this_week": this_week,
        "free_credit": free_credit,
        "frozen": frozen,
        "admin_count": admin_count,
    }
