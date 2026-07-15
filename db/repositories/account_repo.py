from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Sequence

import asyncpg


@dataclass
class AccountImportResult:
    total: int
    inserted: int
    duplicates: int
    failed: int


def parse_account_csv(content: bytes) -> list[tuple[str, str]]:
    """Parse username,password columns from CSV bytes. Handles UTF-8 BOM."""
    text = content.decode("utf-8-sig").lstrip("﻿").strip()
    reader = csv.DictReader(io.StringIO(text))
    records = []
    for row in reader:
        username = row.get("username", "").strip()
        password = row.get("password", "").strip()
        if username and password:
            records.append((username, password))
    return records


async def bulk_import_accounts(
    pool: asyncpg.Pool,
    provider: str,
    records: Sequence[tuple[str, str]],
) -> AccountImportResult:
    """Bulk import (username, password) pairs for a provider. Uses COPY for performance."""
    total = len(records)
    if not records:
        return AccountImportResult(total=0, inserted=0, duplicates=0, failed=0)

    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "CREATE TEMP TABLE _acc_import (username VARCHAR(100), password VARCHAR(100))"
                " ON COMMIT DROP"
            )
            await conn.copy_records_to_table(
                "_acc_import",
                records=list(records),
                columns=["username", "password"],
            )
            result = await conn.execute(
                """
                INSERT INTO account_pool (provider, username, password)
                SELECT $1, username, password FROM _acc_import
                ON CONFLICT (provider, username) DO NOTHING
                """,
                provider,
            )

    inserted = int(result.split()[-1])
    duplicates = total - inserted
    return AccountImportResult(
        total=total, inserted=inserted, duplicates=duplicates, failed=0
    )


async def get_account_stats(pool: asyncpg.Pool) -> list[dict[str, Any]]:
    """Returns stats for every provider in account_pool, ordered by provider name."""
    rows = await pool.fetch(
        """
        SELECT
            provider,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'AVAILABLE') AS available,
            COUNT(*) FILTER (WHERE status = 'ASSIGNED')  AS assigned,
            COUNT(*) FILTER (WHERE status = 'DISABLED')  AS disabled
        FROM account_pool
        GROUP BY provider
        ORDER BY provider
        """
    )
    return [dict(r) for r in rows]


async def get_user_game_accounts(
    pool: asyncpg.Pool, user_id: int
) -> list[asyncpg.Record]:
    """Returns all assigned accounts for a user with account details."""
    return await pool.fetch(
        """
        SELECT
            uga.id, uga.user_id, uga.provider,
            uga.assigned_at, uga.last_changed_at,
            ap.id AS account_pool_id, ap.username, ap.password
        FROM user_game_accounts uga
        JOIN account_pool ap ON ap.id = uga.account_pool_id
        WHERE uga.user_id = $1
        ORDER BY uga.assigned_at
        """,
        user_id,
    )


async def get_provider_available_counts(pool: asyncpg.Pool) -> dict[str, int]:
    """Returns count of AVAILABLE accounts per provider."""
    rows = await pool.fetch(
        "SELECT provider, COUNT(*) AS cnt FROM account_pool"
        " WHERE status = 'AVAILABLE' GROUP BY provider"
    )
    return {r["provider"]: r["cnt"] for r in rows}


async def assign_account(
    pool: asyncpg.Pool,
    user_id: int,
    provider: str,
    assigned_by: Optional[int] = None,
) -> Optional[asyncpg.Record]:
    """Atomically assign one AVAILABLE account to user. Returns account record or None if no stock."""
    async with pool.acquire() as conn:
        async with conn.transaction():
            slot = await conn.fetchrow(
                """
                SELECT id FROM account_pool
                WHERE provider = $1 AND status = 'AVAILABLE'
                LIMIT 1 FOR UPDATE SKIP LOCKED
                """,
                provider,
            )
            if not slot:
                return None

            account = await conn.fetchrow(
                """
                UPDATE account_pool
                SET status = 'ASSIGNED', assigned_user_id = $1, assigned_at = NOW()
                WHERE id = $2
                RETURNING *
                """,
                user_id,
                slot["id"],
            )
            await conn.execute(
                """
                INSERT INTO user_game_accounts
                    (user_id, provider, account_pool_id, assigned_by, last_changed_at)
                VALUES ($1, $2, $3, $4, NOW())
                """,
                user_id,
                provider,
                slot["id"],
                assigned_by,
            )
            return account


async def release_and_reassign(
    pool: asyncpg.Pool,
    user_id: int,
    provider: str,
) -> Optional[tuple[str, asyncpg.Record]]:
    """Atomically release old account and assign a new one.
    Returns (old_username, new_account_record) or None if no new stock.
    Old account is NOT released when no new stock is available."""
    async with pool.acquire() as conn:
        async with conn.transaction():
            current = await conn.fetchrow(
                """
                SELECT uga.account_pool_id, ap.username
                FROM user_game_accounts uga
                JOIN account_pool ap ON ap.id = uga.account_pool_id
                WHERE uga.user_id = $1 AND uga.provider = $2
                """,
                user_id,
                provider,
            )
            if not current:
                return None

            new_slot = await conn.fetchrow(
                """
                SELECT id FROM account_pool
                WHERE provider = $1 AND status = 'AVAILABLE'
                LIMIT 1 FOR UPDATE SKIP LOCKED
                """,
                provider,
            )
            if not new_slot:
                return None  # No stock — rollback, old account untouched

            old_username = current["username"]

            # Release old account
            await conn.execute(
                """
                UPDATE account_pool
                SET status = 'AVAILABLE', assigned_user_id = NULL, assigned_at = NULL
                WHERE id = $1
                """,
                current["account_pool_id"],
            )

            # Assign new account
            new_account = await conn.fetchrow(
                """
                UPDATE account_pool
                SET status = 'ASSIGNED', assigned_user_id = $1, assigned_at = NOW()
                WHERE id = $2
                RETURNING *
                """,
                user_id,
                new_slot["id"],
            )

            # Update assignment record
            await conn.execute(
                """
                UPDATE user_game_accounts
                SET account_pool_id = $1, last_changed_at = NOW()
                WHERE user_id = $2 AND provider = $3
                """,
                new_slot["id"],
                user_id,
                provider,
            )
            return old_username, new_account


async def is_cooldown_active(
    pool: asyncpg.Pool,
    user_id: int,
    provider: str,
    cooldown_hours: int,
) -> tuple[bool, Optional[datetime]]:
    """Returns (is_active, next_allowed_time). is_active=True means still in cooldown."""
    row = await pool.fetchrow(
        "SELECT last_changed_at FROM user_game_accounts"
        " WHERE user_id = $1 AND provider = $2",
        user_id,
        provider,
    )
    if not row:
        return False, None

    last_changed = row["last_changed_at"]
    if last_changed.tzinfo is None:
        last_changed = last_changed.replace(tzinfo=timezone.utc)

    next_allowed = last_changed + timedelta(hours=cooldown_hours)
    now = datetime.now(timezone.utc)

    if now < next_allowed:
        return True, next_allowed
    return False, None


async def get_account_by_provider_username(
    pool: asyncpg.Pool, provider: str, username: str
) -> Optional[asyncpg.Record]:
    return await pool.fetchrow(
        "SELECT * FROM account_pool WHERE provider = $1 AND username = $2",
        provider,
        username,
    )


async def disable_account(
    pool: asyncpg.Pool, provider: str, username: str
) -> Optional[asyncpg.Record]:
    """Set account to DISABLED. Does NOT modify user_game_accounts (caller handles that)."""
    return await pool.fetchrow(
        """
        UPDATE account_pool SET status = 'DISABLED'
        WHERE provider = $1 AND username = $2
        RETURNING *
        """,
        provider,
        username,
    )


async def enable_account(
    pool: asyncpg.Pool, provider: str, username: str
) -> Optional[asyncpg.Record]:
    """Set a DISABLED account back to AVAILABLE. Only works if currently DISABLED."""
    return await pool.fetchrow(
        """
        UPDATE account_pool SET status = 'AVAILABLE'
        WHERE provider = $1 AND username = $2 AND status = 'DISABLED'
        RETURNING *
        """,
        provider,
        username,
    )


async def force_disable_account(
    pool: asyncpg.Pool, account_pool_id: int
) -> None:
    """Force disable an ASSIGNED account and remove its user_game_accounts record."""
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """
                UPDATE account_pool
                SET status = 'DISABLED', assigned_user_id = NULL, assigned_at = NULL
                WHERE id = $1
                """,
                account_pool_id,
            )
            await conn.execute(
                "DELETE FROM user_game_accounts WHERE account_pool_id = $1",
                account_pool_id,
            )
