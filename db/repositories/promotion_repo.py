from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

import asyncpg


def is_promo_available(promo: asyncpg.Record) -> bool:
    """Return True if the promotion is active, not deleted, and not expired.

    Use this everywhere in customer-facing code instead of checking
    promo["is_active"] directly — the raw column does not capture expiry
    or soft-deletion.
    """
    if not promo["is_active"]:
        return False
    if promo.get("deleted_at") is not None:
        return False
    expiry = promo.get("expiry_date")
    if expiry is not None:
        return expiry.astimezone(timezone.utc) > datetime.now(timezone.utc)
    return True


async def get_active_promotions(pool: asyncpg.Pool) -> list[asyncpg.Record]:
    """Return promotions that are active, not deleted, and not yet expired."""
    return await pool.fetch(
        """
        SELECT * FROM promotions
        WHERE is_active = TRUE
          AND deleted_at IS NULL
          AND (expiry_date IS NULL OR expiry_date > NOW())
        ORDER BY id
        """
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
    """True if the user already has an APPROVED FIRST_DEPOSIT claim.

    Only ACTIVE and COMPLETED claims count — PENDING and CANCELLED do not block
    so that a rejected deposit does not permanently lock the promotion.
    """
    row = await pool.fetchrow(
        """
        SELECT bc.id FROM bonus_claims bc
        JOIN promotions p ON p.id = bc.promotion_id
        WHERE bc.user_id = $1
          AND p.promotion_type = 'FIRST_DEPOSIT'
          AND bc.status IN ('ACTIVE', 'COMPLETED')
        LIMIT 1
        """,
        user_id,
    )
    return row is not None


async def has_daily_claim_today(
    pool: asyncpg.Pool, user_id: int, promo_id: int
) -> bool:
    """True if the user already has an APPROVED claim for this promo today."""
    row = await pool.fetchrow(
        """
        SELECT id FROM bonus_claims
        WHERE user_id = $1
          AND promotion_id = $2
          AND status IN ('ACTIVE', 'COMPLETED')
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
    """True if the user already has an APPROVED claim for this promo this ISO week."""
    row = await pool.fetchrow(
        """
        SELECT id FROM bonus_claims
        WHERE user_id = $1
          AND promotion_id = $2
          AND status IN ('ACTIVE', 'COMPLETED')
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


async def can_member_claim_promotion(
    pool: asyncpg.Pool, user_id: int, promo_id: int
) -> bool:
    """Return True if the member is eligible to claim this promotion.

    FIRST_DEPOSIT: blocked if any deposit_request using a FIRST_DEPOSIT promo
                   is PENDING or APPROVED (i.e. claim is in-flight or done).
                   REJECTED deposits allow a retry.
    DAILY:         blocked if an ACTIVE/COMPLETED claim already exists today.
    WEEKLY:        blocked if an ACTIVE/COMPLETED claim exists this ISO week.
    UNLIMITED/MANUAL: always eligible.
    """
    promo = await get_promotion_by_id(pool, promo_id)
    if not promo:
        return False

    promo_type = promo["promotion_type"]

    if promo_type == "FIRST_DEPOSIT":
        row = await pool.fetchrow(
            """
            SELECT dr.id FROM deposit_requests dr
            JOIN promotions p ON p.id = dr.promotion_id
            WHERE dr.user_id = $1
              AND p.promotion_type = 'FIRST_DEPOSIT'
              AND dr.status IN ('PENDING', 'APPROVED')
            LIMIT 1
            """,
            user_id,
        )
        return row is None
    elif promo_type == "DAILY":
        return not await has_daily_claim_today(pool, user_id, promo_id)
    elif promo_type == "WEEKLY":
        return not await has_weekly_claim_this_week(pool, user_id, promo_id)
    else:  # UNLIMITED, MANUAL
        return True


async def get_eligible_promotions_for_member(
    pool: asyncpg.Pool, user_id: int
) -> list[asyncpg.Record]:
    """Return active promotions the member is still eligible to claim."""
    promotions = await get_active_promotions(pool)
    eligible = []
    for promo in promotions:
        if await can_member_claim_promotion(pool, user_id, promo["id"]):
            eligible.append(promo)
    return eligible


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
