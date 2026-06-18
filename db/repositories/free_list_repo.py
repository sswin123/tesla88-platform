from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from typing import Sequence

import asyncpg

from bot.utils.phone import normalize_phone


@dataclass
class ImportResult:
    total: int
    inserted: int
    duplicates: int
    failed: int


def parse_csv_phones(content: bytes) -> list[str]:
    """Parse phone column from CSV bytes. Handles UTF-8-BOM."""
    text = content.decode("utf-8-sig").strip()
    reader = csv.DictReader(io.StringIO(text))
    return [
        row["phone"].strip()
        for row in reader
        if row.get("phone", "").strip()
    ]


async def check_phone_in_free_list(pool: asyncpg.Pool, phone: str) -> bool:
    row = await pool.fetchrow(
        "SELECT 1 FROM free_list WHERE phone = $1", phone
    )
    return row is not None


async def bulk_import_phones(
    pool: asyncpg.Pool, raw_phones: Sequence[str]
) -> ImportResult:
    total = len(raw_phones)
    failed = 0
    valid: list[str] = []

    for raw in raw_phones:
        normalized = normalize_phone(raw.strip())
        if normalized is None:
            failed += 1
        else:
            valid.append(normalized)

    if not valid:
        return ImportResult(total=total, inserted=0, duplicates=0, failed=failed)

    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "CREATE TEMP TABLE _fl_import (phone VARCHAR(20)) ON COMMIT DROP"
            )
            await conn.copy_records_to_table(
                "_fl_import",
                records=[(p,) for p in valid],
                columns=["phone"],
            )
            result = await conn.execute("""
                INSERT INTO free_list (phone)
                SELECT DISTINCT phone FROM _fl_import
                ON CONFLICT (phone) DO NOTHING
            """)

    inserted = int(result.split()[-1])
    duplicates = len(valid) - inserted
    return ImportResult(
        total=total,
        inserted=inserted,
        duplicates=duplicates,
        failed=failed,
    )
