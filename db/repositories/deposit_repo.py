from __future__ import annotations

import logging
from typing import Optional

import asyncpg

logger = logging.getLogger(__name__)


async def has_pending_deposit(pool: asyncpg.Pool, user_id: int) -> bool:
    row = await pool.fetchrow(
        "SELECT id FROM deposit_requests WHERE user_id = $1 AND status = 'PENDING'",
        user_id,
    )
    return row is not None


async def create_deposit_request(
    pool: asyncpg.Pool,
    *,
    user_id: int,
    provider: str,
    game_username: str,
    deposit_amount: float,
    bonus_type_id: Optional[int],
    promotion_id: Optional[int],
    bonus_amount: float,
    credit_amount: float,
    payment_bank: str,
    receipt_file_id: str,
    receiving_bank_id: Optional[int] = None,
) -> asyncpg.Record:
    """Insert a new deposit request.

    Tries the new schema (migration 027: receiving_bank_id column) first,
    falls back to the legacy schema if the column does not yet exist.
    """
    base_params = (
        user_id, provider, game_username,
        deposit_amount, bonus_type_id, promotion_id, bonus_amount, credit_amount,
        payment_bank, receipt_file_id,
    )

    # New schema: includes receiving_bank_id FK (migration 027)
    if receiving_bank_id is not None:
        try:
            return await pool.fetchrow(
                """
                INSERT INTO deposit_requests (
                    user_id, provider, game_username,
                    deposit_amount, bonus_type_id, promotion_id, bonus_amount, credit_amount,
                    payment_bank, receipt_file_id, receiving_bank_id
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                RETURNING *
                """,
                *base_params, receiving_bank_id,
            )
        except asyncpg.exceptions.UndefinedColumnError:
            logger.warning("deposit_repo: receiving_bank_id column missing (migration 027 pending), falling back")

    # Legacy schema: no receiving_bank_id column
    return await pool.fetchrow(
        """
        INSERT INTO deposit_requests (
            user_id, provider, game_username,
            deposit_amount, bonus_type_id, promotion_id, bonus_amount, credit_amount,
            payment_bank, receipt_file_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING *
        """,
        *base_params,
    )


async def update_deposit_notification_msg_id(
    pool: asyncpg.Pool, request_id: int, msg_id: int
) -> None:
    await pool.execute(
        "UPDATE deposit_requests SET notification_msg_id = $1 WHERE id = $2",
        msg_id, request_id,
    )


async def get_deposit_request(
    pool: asyncpg.Pool, request_id: int
) -> Optional[asyncpg.Record]:
    return await pool.fetchrow(
        """
        SELECT dr.*, u.telegram_id, u.phone, u.bank_holder_name,
               bt.name AS bonus_name,
               p.name  AS promo_name
        FROM deposit_requests dr
        JOIN users u ON u.id = dr.user_id
        LEFT JOIN bonus_types bt ON bt.id = dr.bonus_type_id
        LEFT JOIN promotions p ON p.id = dr.promotion_id
        WHERE dr.id = $1
        """,
        request_id,
    )


async def approve_deposit(
    pool: asyncpg.Pool,
    request_id: int,
    reviewed_by: int,
    admin_note: Optional[str],
) -> Optional[asyncpg.Record]:
    """Approve and update user totals atomically. Returns None if already processed."""
    async with pool.acquire() as conn:
        async with conn.transaction():
            req = await conn.fetchrow(
                "SELECT * FROM deposit_requests WHERE id = $1 AND status = 'PENDING'",
                request_id,
            )
            if not req:
                return None
            updated = await conn.fetchrow(
                """
                UPDATE deposit_requests
                SET status = 'APPROVED', reviewed_by = $2,
                    admin_note = $3, reviewed_at = NOW()
                WHERE id = $1
                RETURNING *
                """,
                request_id, reviewed_by, admin_note,
            )
            await conn.execute(
                """
                UPDATE users
                SET total_deposit = total_deposit + $2,
                    total_bonus   = total_bonus   + $3
                WHERE id = $1
                """,
                req["user_id"], req["deposit_amount"], req["bonus_amount"],
            )
            return updated


async def reject_deposit(
    pool: asyncpg.Pool,
    request_id: int,
    reviewed_by: int,
    admin_note: str,
) -> Optional[asyncpg.Record]:
    """Reject a PENDING deposit. Returns None if already processed."""
    return await pool.fetchrow(
        """
        UPDATE deposit_requests
        SET status = 'REJECTED', reviewed_by = $2,
            admin_note = $3, reviewed_at = NOW()
        WHERE id = $1 AND status = 'PENDING'
        RETURNING *
        """,
        request_id, reviewed_by, admin_note,
    )


async def get_user_deposit_history(
    pool: asyncpg.Pool, user_id: int, limit: int = 10
) -> list[asyncpg.Record]:
    return await pool.fetch(
        """
        SELECT dr.*, bt.name AS bonus_name, p.name AS promo_name
        FROM deposit_requests dr
        LEFT JOIN bonus_types bt ON bt.id = dr.bonus_type_id
        LEFT JOIN promotions p ON p.id = dr.promotion_id
        WHERE dr.user_id = $1
        ORDER BY dr.created_at DESC
        LIMIT $2
        """,
        user_id, limit,
    )


async def get_pending_deposits(pool: asyncpg.Pool) -> list[asyncpg.Record]:
    return await pool.fetch(
        """
        SELECT dr.*, u.phone, u.bank_holder_name,
               bt.name AS bonus_name, p.name AS promo_name
        FROM deposit_requests dr
        JOIN users u ON u.id = dr.user_id
        LEFT JOIN bonus_types bt ON bt.id = dr.bonus_type_id
        LEFT JOIN promotions p ON p.id = dr.promotion_id
        WHERE dr.status = 'PENDING'
        ORDER BY dr.created_at
        """,
    )
