#!/usr/bin/env python3
from __future__ import annotations
"""CLI bulk import for free_list.csv — use for large datasets (100k+)."""
import asyncio
import os
import sys

# Allow running from project root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from bot.config import load_config
from db.connection import create_pool
from db.repositories.free_list_repo import bulk_import_phones, parse_csv_phones


async def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python scripts/import_free_list.py <csv_file>")
        sys.exit(1)

    csv_path = sys.argv[1]
    if not os.path.isfile(csv_path):
        print(f"File not found: {csv_path}")
        sys.exit(1)

    with open(csv_path, "rb") as f:
        content = f.read()

    phones = parse_csv_phones(content)
    print(f"Parsed {len(phones):,} records from CSV.")

    config = load_config()
    pool = await create_pool(config)

    try:
        result = await bulk_import_phones(pool, phones)
        print(
            f"\n导入完成 ✅\n"
            f"总记录：{result.total:,}\n"
            f"新增：{result.inserted:,}\n"
            f"重复：{result.duplicates:,}\n"
            f"失败（格式错误）：{result.failed:,}"
        )
    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
