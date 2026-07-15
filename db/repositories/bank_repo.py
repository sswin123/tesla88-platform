from __future__ import annotations

import logging
from typing import Optional

import asyncpg

logger = logging.getLogger(__name__)


async def get_active_banks(
    pool: asyncpg.Pool,
    provider: Optional[str] = None,
) -> list[asyncpg.Record]:
    """Return active, non-maintenance banks.

    Three-tier fallback for payment_banks schema evolution:
      Tier 1 (post-028): maintenance_mode + provider_binding + priority present
      Tier 2 (post-027): maintenance_mode present, no provider_binding/priority
      Tier 3 (base):     only is_active; no maintenance_mode

    qr_media_id and instructions are not real columns — aliased or nulled.
    """
    queries: list[tuple[str, tuple]] = []

    if provider:
        queries = [
            # Tier 1 (post-028): filter by maintenance_mode + provider_binding, order by priority
            (
                "SELECT id, bank_name, account_name, account_number, "
                "       qr_image AS qr_media_id, NULL AS instructions "
                "FROM payment_banks "
                "WHERE is_active = TRUE AND maintenance_mode = FALSE "
                "  AND (provider_binding IS NULL OR provider_binding = $1) "
                "ORDER BY priority DESC, display_order, id",
                (provider,),
            ),
            # Tier 2 (post-027): maintenance_mode exists but no provider_binding
            (
                "SELECT id, bank_name, account_name, account_number, "
                "       qr_image AS qr_media_id, NULL AS instructions "
                "FROM payment_banks "
                "WHERE is_active = TRUE AND maintenance_mode = FALSE "
                "ORDER BY display_order, id",
                (),
            ),
            # Tier 3 (base): no maintenance_mode
            (
                "SELECT id, bank_name, account_name, account_number, "
                "       qr_image AS qr_media_id, NULL AS instructions "
                "FROM payment_banks "
                "WHERE is_active = TRUE "
                "ORDER BY display_order, id",
                (),
            ),
        ]
    else:
        queries = [
            # Tier 1 (post-028)
            (
                "SELECT id, bank_name, account_name, account_number, "
                "       qr_image AS qr_media_id, NULL AS instructions "
                "FROM payment_banks "
                "WHERE is_active = TRUE AND maintenance_mode = FALSE "
                "ORDER BY priority DESC, display_order, id",
                (),
            ),
            # Tier 2 (post-027)
            (
                "SELECT id, bank_name, account_name, account_number, "
                "       qr_image AS qr_media_id, NULL AS instructions "
                "FROM payment_banks "
                "WHERE is_active = TRUE AND maintenance_mode = FALSE "
                "ORDER BY display_order, id",
                (),
            ),
            # Tier 3 (base)
            (
                "SELECT id, bank_name, account_name, account_number, "
                "       qr_image AS qr_media_id, NULL AS instructions "
                "FROM payment_banks "
                "WHERE is_active = TRUE "
                "ORDER BY display_order, id",
                (),
            ),
        ]

    for sql, params in queries:
        try:
            return await pool.fetch(sql, *params)
        except asyncpg.exceptions.UndefinedColumnError:
            logger.warning("bank_repo.get_active_banks: migration pending, trying next fallback")
            continue

    return []
