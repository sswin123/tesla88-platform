from __future__ import annotations

from decimal import Decimal
from typing import Optional

import asyncpg


async def get_active_promotions(pool: asyncpg.Pool) -> list[asyncpg.Record]:
    return await pool.fetch(
        "SELECT * FROM promotions WHERE is_active = TRUE ORDER BY id"
    )


async def get_all_promotions(pool: asyncpg.Pool) -> list[asyncpg.Record]:
    return await pool.fetch("SELECT * FROM promotions ORDER BY id")


async def get_promotion_by_id(
    pool: asyncpg.Pool, promo_id: int
) -> Optional[asyncpg.Record]:
    return await pool.fetchrow(
        "SELECT * FROM promotions WHERE id = $1", promo_id
    )


async def has_first_deposit_claim(pool: asyncpg.Pool, user_id: int) -> bool:
    """True if the user already has a non-cancelled FIRST_DEPOSIT claim."""
    row = await pool.fetchrow(
        """
        SELECT bc.id FROM bonus_claims bc
        JOIN promotions p ON p.id = bc.promotion_id
        WHERE bc.user_id = $1
          AND p.promotion_type = 'FIRST_DEPOSIT'
          AND bc.status != 'CANCELLED'
        LIMIT 1
        """,
        user_id,
    )
    return row is not None


async def has_daily_claim_today(
    pool: asyncpg.Pool, user_id: int, promo_id: int
) -> bool:
    """True if the user already has a non-cancelled claim for this promo today."""
    row = await pool.fetchrow(
        """
        SELECT id FROM bonus_claims
        WHERE user_id = $1
          AND promotion_id = $2
          AND status != 'CANCELLED'
          AND claimed_at::date = CURRENT_DATE
        LIMIT 1
        """,
        user_id,
        promo_id,
    )
    return row is not None


async def has_weekly_claim_this_week(
    pool: asyncpg.Pool, user_id: int, promo_id: int
) -> bool:
    """True if the user already has a non-cancelled claim for this promo this ISO week."""
    row = await pool.fetchrow(
        """
        SELECT id FROM bonus_claims
        WHERE user_id = $1
          AND promotion_id = $2
          AND status != 'CANCELLED'
          AND claimed_at >= date_trunc('week', NOW())
        LIMIT 1
        """,
        user_id,
        promo_id,
    )
    return row is not None


async def create_bonus_claim(
    pool: asyncpg.Pool,
    *,
    user_id: int,
    promotion_id: int,
    deposit_amount: Decimal,
    bonus_amount: Decimal,
    total_credit: Decimal,
    turnover_required: Decimal,
    status: str = "PENDING",
) -> asyncpg.Record:
    return await pool.fetchrow(
        """
        INSERT INTO bonus_claims
            (user_id, promotion_id, deposit_amount, bonus_amount,
             total_credit, turnover_required, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        """,
        user_id,
        promotion_id,
        deposit_amount,
        bonus_amount,
        total_credit,
        turnover_required,
        status,
    )


async def get_user_active_claims(
    pool: asyncpg.Pool, user_id: int
) -> list[asyncpg.Record]:
    return await pool.fetch(
        """
        SELECT bc.*, p.name AS promo_name
        FROM bonus_claims bc
        JOIN promotions p ON p.id = bc.promotion_id
        WHERE bc.user_id = $1
          AND bc.status IN ('ACTIVE', 'COMPLETED')
        ORDER BY bc.claimed_at DESC
        """,
        user_id,
    )


async def get_pending_claims(pool: asyncpg.Pool) -> list[asyncpg.Record]:
    return await pool.fetch(
        """
        SELECT bc.*, p.name AS promo_name, u.first_name, u.phone
        FROM bonus_claims bc
        JOIN promotions p ON p.id = bc.promotion_id
        JOIN users u ON u.id = bc.user_id
        WHERE bc.status = 'PENDING'
        ORDER BY bc.claimed_at
        """
    )


async def update_claim_status(
    pool: asyncpg.Pool, claim_id: int, status: str
) -> Optional[asyncpg.Record]:
    return await pool.fetchrow(
        """
        UPDATE bonus_claims
        SET status = $2,
            completed_at = CASE WHEN $2 IN ('COMPLETED','CANCELLED') THEN NOW() ELSE completed_at END
        WHERE id = $1
        RETURNING *
        """,
        claim_id,
        status,
    )


async def create_promotion(
    pool: asyncpg.Pool,
    *,
    name: str,
    description: str,
    promotion_type: str,
    bonus_type: str,
    bonus_value: Decimal,
    min_deposit: Decimal,
    max_bonus: Optional[Decimal],
    turnover_multiplier: Decimal,
    turnover_type: str = "BONUS",
    allowed_games: list[str],
) -> asyncpg.Record:
    return await pool.fetchrow(
        """
        INSERT INTO promotions
            (name, description, promotion_type, bonus_type, bonus_value,
             min_deposit, max_bonus, turnover_multiplier, turnover_type, allowed_games)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
        """,
        name,
        description,
        promotion_type,
        bonus_type,
        bonus_value,
        min_deposit,
        max_bonus,
        turnover_multiplier,
        turnover_type,
        allowed_games,
    )


async def set_promotion_active(
    pool: asyncpg.Pool, promo_id: int, is_active: bool
) -> Optional[asyncpg.Record]:
    return await pool.fetchrow(
        """
        UPDATE promotions
        SET is_active = $2, updated_at = NOW()
        WHERE id = $1
        RETURNING *
        """,
        promo_id,
        is_active,
    )
