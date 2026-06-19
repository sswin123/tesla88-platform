from __future__ import annotations

from typing import Optional

import asyncpg


async def has_pending_withdrawal(pool: asyncpg.Pool, user_id: int) -> bool:
    row = await pool.fetchrow(
        "SELECT id FROM withdrawal_requests WHERE user_id = $1 AND status = 'PENDING'",
        user_id,
    )
    return row is not None


async def create_withdrawal_request(
    pool: asyncpg.Pool,
    *,
    user_id: int,
    provider: str,
    game_username: str,
    withdraw_amount: float,
    bank_name: str,
    bank_account: str,
    bank_holder_name: str,
) -> asyncpg.Record:
    return await pool.fetchrow(
        """
        INSERT INTO withdrawal_requests (
            user_id, provider, game_username, withdraw_amount,
            bank_name, bank_account, bank_holder_name
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING *
        """,
        user_id, provider, game_username, withdraw_amount,
        bank_name, bank_account, bank_holder_name,
    )


async def update_withdrawal_notification_msg_id(
    pool: asyncpg.Pool, request_id: int, msg_id: int
) -> None:
    await pool.execute(
        "UPDATE withdrawal_requests SET notification_msg_id = $1 WHERE id = $2",
        msg_id, request_id,
    )


async def get_withdrawal_request(
    pool: asyncpg.Pool, request_id: int
) -> Optional[asyncpg.Record]:
    return await pool.fetchrow(
        """
        SELECT wr.*, u.telegram_id, u.phone, u.bank_holder_name
        FROM withdrawal_requests wr
        JOIN users u ON u.id = wr.user_id
        WHERE wr.id = $1
        """,
        request_id,
    )


async def mark_withdrawal_paid(
    pool: asyncpg.Pool,
    request_id: int,
    reviewed_by: int,
    admin_note: Optional[str],
) -> Optional[asyncpg.Record]:
    """Mark as PAID and update user totals atomically. Returns None if already processed."""
    async with pool.acquire() as conn:
        async with conn.transaction():
            req = await conn.fetchrow(
                "SELECT * FROM withdrawal_requests WHERE id = $1 AND status = 'PENDING'",
                request_id,
            )
            if not req:
                return None
            updated = await conn.fetchrow(
                """
                UPDATE withdrawal_requests
                SET status = 'PAID', reviewed_by = $2,
                    admin_note = $3, reviewed_at = NOW()
                WHERE id = $1
                RETURNING *
                """,
                request_id, reviewed_by, admin_note,
            )
            await conn.execute(
                "UPDATE users SET total_withdraw = total_withdraw + $2 WHERE id = $1",
                req["user_id"], req["withdraw_amount"],
            )
            return updated


async def reject_withdrawal(
    pool: asyncpg.Pool,
    request_id: int,
    reviewed_by: int,
    admin_note: str,
) -> Optional[asyncpg.Record]:
    """Reject a PENDING withdrawal. Returns None if already processed."""
    return await pool.fetchrow(
        """
        UPDATE withdrawal_requests
        SET status = 'REJECTED', reviewed_by = $2,
            admin_note = $3, reviewed_at = NOW()
        WHERE id = $1 AND status = 'PENDING'
        RETURNING *
        """,
        request_id, reviewed_by, admin_note,
    )


async def get_user_withdrawal_history(
    pool: asyncpg.Pool, user_id: int, limit: int = 10
) -> list[asyncpg.Record]:
    return await pool.fetch(
        """
        SELECT * FROM withdrawal_requests
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
        """,
        user_id, limit,
    )


async def get_pending_withdrawals(pool: asyncpg.Pool) -> list[asyncpg.Record]:
    return await pool.fetch(
        """
        SELECT wr.*, u.phone, u.bank_holder_name
        FROM withdrawal_requests wr
        JOIN users u ON u.id = wr.user_id
        WHERE wr.status = 'PENDING'
        ORDER BY wr.created_at
        """,
    )
