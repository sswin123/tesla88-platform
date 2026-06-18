# Game Account Pool System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-service game account pool where users claim/change accounts from a pre-loaded pool, and admins only manage the pool (import, stats, disable/enable).

**Architecture:** New `account_pool` and `user_game_accounts` tables hold the pool and assignments. User handlers added to `bot/handlers/user/game_accounts.py` for the self-service flow; admin handlers added to three new admin files. `/start` updated to show a persistent `ReplyKeyboardMarkup` main menu for registered users. All provider names come from `bot/constants.py`.

**Tech Stack:** Aiogram 3.13.1 (ReplyKeyboardMarkup, CopyTextButton), asyncpg 0.29.0 (FOR UPDATE SKIP LOCKED), PostgreSQL 14

## Global Constraints

- `from __future__ import annotations` is the FIRST line of every Python file
- All provider names come exclusively from `bot.constants.PROVIDERS` — never hardcoded elsewhere
- Account assignment and release-and-reassign must be inside asyncpg transactions with `FOR UPDATE SKIP LOCKED`
- `CopyTextButton` is from `aiogram.types` — used for copy-to-clipboard buttons (Bot API 7.3+, aiogram 3.13.1 supports it)
- `pool: asyncpg.Pool` and `config: Config` are injected into all handlers via `dp["pool"]` and `dp["config"]`
- Run tests with `python3 -m pytest tests/ -v` (not `pytest`)
- All git commands run from `/Users/hang/Downloads/Test/telegram-member-bot/`
- Working directory is `/Users/hang/Downloads/Test/telegram-member-bot/`

---

### Task 1: Constants + Schema + Config

**Files:**
- Create: `bot/constants.py`
- Modify: `database.sql` (append new tables + migration)
- Modify: `bot/config.py` (add `cs_username`, `account_change_cooldown_hours`)
- Modify: `.env.example` (add new vars)
- Test: `tests/test_constants.py`

**Interfaces:**
- Produces: `bot.constants.PROVIDERS: list[str]` — imported by all subsequent tasks
- Produces: `Config.cs_username: str`, `Config.account_change_cooldown_hours: int`

- [ ] **Step 1: Write failing test**

```python
# tests/test_constants.py
from __future__ import annotations
from bot.constants import PROVIDERS

def test_providers_has_six_entries():
    assert len(PROVIDERS) == 6

def test_providers_exact_names():
    assert PROVIDERS == [
        "918Kiss", "Mega888", "Pussy888", "Newtown", "Ace333", "Live22"
    ]

def test_providers_no_duplicates():
    assert len(PROVIDERS) == len(set(PROVIDERS))
```

- [ ] **Step 2: Run to confirm fail**

```bash
python3 -m pytest tests/test_constants.py -v
```
Expected: `ModuleNotFoundError: No module named 'bot.constants'`

- [ ] **Step 3: Create `bot/constants.py`**

```python
from __future__ import annotations

PROVIDERS: list[str] = [
    "918Kiss",
    "Mega888",
    "Pussy888",
    "Newtown",
    "Ace333",
    "Live22",
]
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
python3 -m pytest tests/test_constants.py -v
```
Expected: `3 passed`

- [ ] **Step 5: Append to `database.sql`**

Add the following at the end of the file:

```sql
-- ============================================================
-- Game Account Pool — Phase 1 Extension
-- ============================================================

-- Migration: add total_bonus to users (Phase 4 Promotion placeholder)
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS total_bonus NUMERIC(15,2) DEFAULT 0.00;

-- Account pool: pre-loaded game accounts
CREATE TABLE IF NOT EXISTS account_pool (
    id               SERIAL PRIMARY KEY,
    provider         VARCHAR(20)  NOT NULL
                     CHECK (provider IN ('918Kiss','Mega888','Pussy888','Newtown','Ace333','Live22')),
    username         VARCHAR(100) NOT NULL,
    password         VARCHAR(100) NOT NULL,
    status           VARCHAR(10)  NOT NULL DEFAULT 'AVAILABLE'
                     CHECK (status IN ('AVAILABLE','ASSIGNED','DISABLED')),
    assigned_user_id INTEGER      REFERENCES users(id),
    assigned_at      TIMESTAMPTZ,
    note             VARCHAR(255),
    created_at       TIMESTAMPTZ  DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE(provider, username)
);

CREATE INDEX IF NOT EXISTS idx_account_pool_provider_status
    ON account_pool(provider, status);

DROP TRIGGER IF EXISTS trg_account_pool_updated_at ON account_pool;
CREATE TRIGGER trg_account_pool_updated_at
    BEFORE UPDATE ON account_pool
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- User game account assignments
CREATE TABLE IF NOT EXISTS user_game_accounts (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id),
    provider        VARCHAR(20) NOT NULL
                    CHECK (provider IN ('918Kiss','Mega888','Pussy888','Newtown','Ace333','Live22')),
    account_pool_id INTEGER NOT NULL REFERENCES account_pool(id),
    assigned_at     TIMESTAMPTZ DEFAULT NOW(),
    assigned_by     BIGINT,
    last_changed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_uga_user_id ON user_game_accounts(user_id);
```

- [ ] **Step 6: Update `bot/config.py`**

Replace the full file with:

```python
from __future__ import annotations

import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


@dataclass
class Config:
    bot_token: str
    super_admin_id: int
    postgres_host: str
    postgres_port: int
    postgres_db: str
    postgres_user: str
    postgres_password: str
    cs_username: str
    account_change_cooldown_hours: int


def load_config() -> Config:
    return Config(
        bot_token=os.environ["BOT_TOKEN"],
        super_admin_id=int(os.environ["SUPER_ADMIN_ID"]),
        postgres_host=os.environ.get("POSTGRES_HOST", "localhost"),
        postgres_port=int(os.environ.get("POSTGRES_PORT", "5432")),
        postgres_db=os.environ["POSTGRES_DB"],
        postgres_user=os.environ["POSTGRES_USER"],
        postgres_password=os.environ["POSTGRES_PASSWORD"],
        cs_username=os.environ.get("CS_USERNAME", "support"),
        account_change_cooldown_hours=int(
            os.environ.get("ACCOUNT_CHANGE_COOLDOWN_HOURS", "24")
        ),
    )
```

- [ ] **Step 7: Update `.env.example`**

Append to `.env.example`:

```
# Contact support Telegram username (without @)
CS_USERNAME=yourcs

# Account change cooldown in hours (24 = daily, 168 = weekly)
ACCOUNT_CHANGE_COOLDOWN_HOURS=24
```

- [ ] **Step 8: Run all tests**

```bash
python3 -m pytest tests/ -v
```
Expected: `19 passed`

- [ ] **Step 9: Commit**

```bash
git add bot/constants.py database.sql bot/config.py .env.example tests/test_constants.py
git commit -m "feat: constants, schema extension, config for game account pool"
```

---

### Task 2: account_repo.py

**Files:**
- Create: `db/repositories/account_repo.py`
- Test: `tests/test_account_repo.py`

**Interfaces:**
- Consumes: `bot.constants.PROVIDERS`
- Produces (all async unless noted):
  - `parse_account_csv(content: bytes) -> list[tuple[str, str]]` — pure, sync
  - `bulk_import_accounts(pool, provider, records) -> AccountImportResult`
  - `get_account_stats(pool) -> list[dict]` — keys: provider, total, available, assigned, disabled
  - `get_user_game_accounts(pool, user_id) -> list[Record]` — joins account_pool; fields: provider, username, password, account_pool_id, last_changed_at
  - `get_provider_available_counts(pool) -> dict[str, int]`
  - `assign_account(pool, user_id, provider, assigned_by=None) -> Record | None`
  - `release_and_reassign(pool, user_id, provider) -> tuple[str, Record] | None`
  - `is_cooldown_active(pool, user_id, provider, cooldown_hours) -> tuple[bool, datetime | None]`
  - `get_account_by_provider_username(pool, provider, username) -> Record | None`
  - `disable_account(pool, provider, username) -> Record | None`
  - `enable_account(pool, provider, username) -> Record | None`
  - `force_disable_account(pool, account_pool_id) -> None`

- [ ] **Step 1: Write failing tests (pure functions only)**

```python
# tests/test_account_repo.py
from __future__ import annotations
from db.repositories.account_repo import parse_account_csv, AccountImportResult
import pytest

def _csv(text: str) -> bytes:
    return text.encode("utf-8")

def test_parse_account_csv_basic():
    content = _csv("username,password\n918001,Aaaa1111\n918002,Aaaa1111\n")
    result = parse_account_csv(content)
    assert result == [("918001", "Aaaa1111"), ("918002", "Aaaa1111")]

def test_parse_account_csv_strips_whitespace():
    content = _csv("username,password\n  918001 , Aaaa1111 \n")
    result = parse_account_csv(content)
    assert result == [("918001", "Aaaa1111")]

def test_parse_account_csv_skips_empty_rows():
    content = _csv("username,password\n918001,Aaaa1111\n,\n918002,Aaaa1111\n")
    result = parse_account_csv(content)
    assert result == [("918001", "Aaaa1111"), ("918002", "Aaaa1111")]

def test_parse_account_csv_utf8_bom():
    content = "﻿username,password\n918001,Aaaa1111\n".encode("utf-8-sig")
    result = parse_account_csv(content)
    assert result == [("918001", "Aaaa1111")]

def test_parse_account_csv_empty():
    content = _csv("username,password\n")
    result = parse_account_csv(content)
    assert result == []

def test_import_result_dataclass():
    r = AccountImportResult(total=10, inserted=8, duplicates=2, failed=0)
    assert r.total == 10
    assert r.inserted == 8
```

- [ ] **Step 2: Run to confirm fail**

```bash
python3 -m pytest tests/test_account_repo.py -v
```
Expected: `ModuleNotFoundError`

- [ ] **Step 3: Create `db/repositories/account_repo.py`**

```python
from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Sequence

import asyncpg

from bot.constants import PROVIDERS


@dataclass
class AccountImportResult:
    total: int
    inserted: int
    duplicates: int
    failed: int


def parse_account_csv(content: bytes) -> list[tuple[str, str]]:
    """Parse username,password columns from CSV bytes. Handles UTF-8 BOM."""
    text = content.decode("utf-8-sig").strip()
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
    """Returns stats for every provider ordered by PROVIDERS list."""
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
        """
    )
    by_provider = {r["provider"]: dict(r) for r in rows}
    return [
        by_provider.get(
            p,
            {"provider": p, "total": 0, "available": 0, "assigned": 0, "disabled": 0},
        )
        for p in PROVIDERS
    ]


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
```

- [ ] **Step 4: Run tests**

```bash
python3 -m pytest tests/test_account_repo.py -v
```
Expected: `6 passed`

- [ ] **Step 5: Run all tests**

```bash
python3 -m pytest tests/ -v
```
Expected: `25 passed`

- [ ] **Step 6: Commit**

```bash
git add db/repositories/account_repo.py tests/test_account_repo.py
git commit -m "feat: account_repo — pool CRUD, atomic assign/reassign, CSV parse"
```

---

### Task 3: Game Account Keyboards + Formatters Update

**Files:**
- Create: `bot/keyboards/game_accounts.py`
- Modify: `bot/utils/formatters.py`

**Interfaces:**
- Consumes: `bot.constants.PROVIDERS`, `aiogram.types.CopyTextButton`
- Produces:
  - `build_main_menu_keyboard() -> ReplyKeyboardMarkup`
  - `build_provider_select_keyboard(prefix, providers) -> InlineKeyboardMarkup`
  - `build_game_accounts_keyboard(accounts, claimable_providers) -> InlineKeyboardMarkup`
  - `format_game_accounts(accounts, all_providers) -> str` (for admin search)
  - Updated `format_user_info(user)` — adds `total_bonus`, changes free credit text

- [ ] **Step 1: Create `bot/keyboards/game_accounts.py`**

No test (keyboard functions are pure UI construction; tested by inspecting bot output).

```python
from __future__ import annotations

from typing import Any, Sequence

from aiogram.types import (
    CopyTextButton,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
)

from bot.constants import PROVIDERS


def build_main_menu_keyboard() -> ReplyKeyboardMarkup:
    """Persistent 2x2 main menu shown to registered users."""
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="📋 我的资料"), KeyboardButton(text="🎮 我的游戏账号")],
            [KeyboardButton(text="🔄 更换游戏账号"), KeyboardButton(text="📞 联系客服")],
        ],
        resize_keyboard=True,
        is_persistent=True,
    )


def build_provider_select_keyboard(
    prefix: str,
    providers: Sequence[str] | None = None,
) -> InlineKeyboardMarkup:
    """2-column provider selection keyboard."""
    items = list(providers) if providers is not None else PROVIDERS
    rows: list[list[InlineKeyboardButton]] = []
    row: list[InlineKeyboardButton] = []
    for p in items:
        row.append(InlineKeyboardButton(text=p, callback_data=f"{prefix}:{p}"))
        if len(row) == 2:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_game_accounts_keyboard(
    accounts: Sequence[Any],
    claimable_providers: Sequence[str],
) -> InlineKeyboardMarkup:
    """Keyboard for 🎮 我的游戏账号 message.
    Assigned accounts: [📋 Copy username] [📋 Copy password] then [🔄 Change] row.
    Claimable providers: [🟢 Claim] rows at bottom.
    """
    rows: list[list[InlineKeyboardButton]] = []

    for acc in accounts:
        rows.append([
            InlineKeyboardButton(
                text="📋 复制账号",
                copy_text=CopyTextButton(text=acc["username"]),
            ),
            InlineKeyboardButton(
                text="📋 复制密码",
                copy_text=CopyTextButton(text=acc["password"]),
            ),
        ])
        rows.append([
            InlineKeyboardButton(
                text=f"🔄 更换 {acc['provider']}",
                callback_data=f"game_change:{acc['provider']}",
            )
        ])

    for provider in claimable_providers:
        rows.append([
            InlineKeyboardButton(
                text=f"🟢 领取 {provider}",
                callback_data=f"game_claim:{provider}",
            )
        ])

    return InlineKeyboardMarkup(inline_keyboard=rows)
```

- [ ] **Step 2: Update `bot/utils/formatters.py`**

Replace full file with:

```python
from __future__ import annotations

from datetime import datetime
from typing import Any, Sequence

from bot.constants import PROVIDERS


def format_user_info(user: Any) -> str:
    status_emoji = "🟢" if user["status"] == "ACTIVE" else "🔴"
    free_text = "✅ 有资格领取" if user["eligible_free_credit"] else "❌ 无资格领取"
    username = f"@{user['telegram_username']}" if user["telegram_username"] else "无"

    created_at = user["created_at"]
    created_str = (
        created_at.strftime("%Y-%m-%d %H:%M:%S")
        if isinstance(created_at, datetime)
        else str(created_at)
    )

    total_bonus = user["total_bonus"] if "total_bonus" in user.keys() else 0.00

    return (
        f"👤 会员资料\n\n"
        f"用户ID：#{user['id']}\n"
        f"Telegram ID：{user['telegram_id']}\n"
        f"Username：{username}\n"
        f"First Name：{user['first_name']}\n"
        f"电话号码：{user['phone']}\n"
        f"银行名称：{user['bank_name']}\n"
        f"银行账号：{user['bank_account']}\n"
        f"银行户口姓名：{user['bank_holder_name']}\n"
        f"免费资格：{free_text}\n"
        f"状态：{status_emoji} {user['status']}\n\n"
        f"💰 充值统计\n"
        f"总充值：RM {user['total_deposit']:,.2f}\n"
        f"总提款：RM {user['total_withdraw']:,.2f}\n"
        f"总优惠：RM {total_bonus:,.2f}\n"
        f"净充值：RM {user['net_deposit']:,.2f}\n\n"
        f"📅 注册时间：{created_str}"
    )


def format_game_accounts(
    accounts: Sequence[Any],
    all_providers: Sequence[str] | None = None,
) -> str:
    """Format game accounts section for admin search_user output."""
    if all_providers is None:
        all_providers = PROVIDERS

    if not accounts:
        return "🎮 游戏平台账号\n\n尚未领取任何账号"

    assigned = {acc["provider"]: acc["username"] for acc in accounts}
    lines = ["🎮 游戏平台账号\n"]

    for provider in all_providers:
        if provider in assigned:
            lines.append(f"{provider}：{assigned[provider]}")

    not_assigned = [p for p in all_providers if p not in assigned]
    if not_assigned:
        lines.append(f"\n尚未领取：{' / '.join(not_assigned)}")

    return "\n".join(lines)
```

- [ ] **Step 3: Run all tests**

```bash
python3 -m pytest tests/ -v
```
Expected: `25 passed`

- [ ] **Step 4: Commit**

```bash
git add bot/keyboards/game_accounts.py bot/utils/formatters.py
git commit -m "feat: game account keyboards, updated formatters with total_bonus"
```

---

### Task 4: Update /start + Profile + CS Handlers

**Files:**
- Modify: `bot/handlers/user/registration.py` (`cmd_start` — show main menu for registered users)
- Create: handlers for 📋 我的资料 and 📞 联系客服 in `bot/handlers/user/game_accounts.py` (stub file for Tasks 5+6 to build on)

**Interfaces:**
- Consumes: `build_main_menu_keyboard()`, `format_user_info()`, `get_user_by_telegram_id()`
- Produces: `bot/handlers/user/game_accounts.py` with `router`, profile handler, CS handler

- [ ] **Step 1: Modify `bot/handlers/user/registration.py` — update `cmd_start`**

Replace only the `cmd_start` function (keep all other functions unchanged):

```python
@router.message(Command("start"))
async def cmd_start(message: Message, state: FSMContext, pool: asyncpg.Pool) -> None:
    await state.clear()

    user = await get_user_by_telegram_id(pool, message.from_user.id)
    if user:
        from bot.keyboards.game_accounts import build_main_menu_keyboard
        status_emoji = "🟢" if user["status"] == "ACTIVE" else "🔴"
        await message.answer(
            f"欢迎回来，{user['first_name']}！\n"
            f"状态：{status_emoji} {user['status']}\n\n"
            f"请选择操作：",
            reply_markup=build_main_menu_keyboard(),
        )
        return

    await message.answer(
        "欢迎使用会员系统\n\n请选择：",
        reply_markup=registration_start_keyboard(),
    )
```

Also add `pool: asyncpg.Pool` to the `cmd_start` signature imports. The full updated signature line:

```python
async def cmd_start(message: Message, state: FSMContext, pool: asyncpg.Pool) -> None:
```

- [ ] **Step 2: Create stub `bot/handlers/user/game_accounts.py`** with profile and CS handlers

```python
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message

import asyncpg

from bot.config import Config
from bot.utils.formatters import format_user_info
from db.repositories.user_repo import get_user_by_telegram_id

router = Router()


@router.message(F.text == "📋 我的资料")
async def handle_my_profile(message: Message, pool: asyncpg.Pool) -> None:
    user = await get_user_by_telegram_id(pool, message.from_user.id)
    if not user:
        await message.answer("您尚未注册。请发送 /start 开始注册。")
        return
    await message.answer(format_user_info(user))


@router.message(F.text == "📞 联系客服")
async def handle_contact_cs(message: Message, config: Config) -> None:
    cs_url = f"https://t.me/{config.cs_username}"
    keyboard = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="💬 联系客服", url=cs_url)
    ]])
    await message.answer(
        f"请联系在线客服：\n\n{cs_url}",
        reply_markup=keyboard,
    )
```

- [ ] **Step 3: Run all tests**

```bash
python3 -m pytest tests/ -v
```
Expected: `25 passed`

- [ ] **Step 4: Commit**

```bash
git add bot/handlers/user/registration.py bot/handlers/user/game_accounts.py
git commit -m "feat: /start shows main menu for registered users; profile and CS handlers"
```

---

### Task 5: User Game Accounts — View and Claim

**Files:**
- Modify: `bot/handlers/user/game_accounts.py` (add view + claim handlers)

**Interfaces:**
- Consumes: `get_user_game_accounts`, `get_provider_available_counts`, `assign_account`, `build_game_accounts_keyboard`, `PROVIDERS`
- Produces: handlers for `F.text == "🎮 我的游戏账号"` and `F.data.startswith("game_claim:")`

- [ ] **Step 1: Add view and claim handlers to `bot/handlers/user/game_accounts.py`**

Add these imports at the top (after existing imports):

```python
from aiogram.types import CallbackQuery
from bot.constants import PROVIDERS
from bot.keyboards.game_accounts import build_game_accounts_keyboard
from db.repositories.account_repo import (
    assign_account,
    get_provider_available_counts,
    get_user_game_accounts,
)
```

Add these handlers after the CS handler:

```python
@router.message(F.text == "🎮 我的游戏账号")
async def handle_my_game_accounts(message: Message, pool: asyncpg.Pool) -> None:
    user = await get_user_by_telegram_id(pool, message.from_user.id)
    if not user:
        await message.answer("您尚未注册。请发送 /start 开始注册。")
        return

    accounts = await get_user_game_accounts(pool, user["id"])
    available_counts = await get_provider_available_counts(pool)

    assigned_providers = {acc["provider"] for acc in accounts}
    claimable = [
        p for p in PROVIDERS
        if p not in assigned_providers and available_counts.get(p, 0) > 0
    ]

    # Build message text
    lines = ["🎮 我的游戏账号"]
    for acc in accounts:
        lines.append(
            f"\n{acc['provider']}\n"
            f"账号：`{acc['username']}`\n"
            f"密码：`{acc['password']}`"
        )

    if claimable:
        lines.append(f"\n\n可领取（有库存）：{'、'.join(claimable)}")

    if not accounts and not claimable:
        lines.append("\n\n所有平台账号库存暂时不足，请稍后再试或联系客服。")

    keyboard = build_game_accounts_keyboard(accounts, claimable)
    await message.answer(
        "\n".join(lines),
        reply_markup=keyboard,
        parse_mode="Markdown",
    )


@router.callback_query(F.data.startswith("game_claim:"))
async def handle_claim_account(
    callback: CallbackQuery, pool: asyncpg.Pool
) -> None:
    provider = callback.data.split(":", 1)[1]
    if provider not in PROVIDERS:
        await callback.answer("无效的平台。", show_alert=True)
        return

    user = await get_user_by_telegram_id(pool, callback.from_user.id)
    if not user:
        await callback.answer("您尚未注册。", show_alert=True)
        return

    account = await assign_account(pool, user["id"], provider)

    if not account:
        await callback.answer(
            "⚠️ 当前暂无可用账号，请稍后再试或联系客服。",
            show_alert=True,
        )
        return

    await callback.message.answer(
        f"✅ 领取成功\n\n"
        f"游戏平台：{provider}\n"
        f"账号：`{account['username']}`\n"
        f"密码：`{account['password']}`",
        parse_mode="Markdown",
    )
    await callback.answer()
```

- [ ] **Step 2: Run all tests**

```bash
python3 -m pytest tests/ -v
```
Expected: `25 passed`

- [ ] **Step 3: Commit**

```bash
git add bot/handlers/user/game_accounts.py
git commit -m "feat: game account view and claim — self-service from pool"
```

---

### Task 6: User Game Accounts — Change Account

**Files:**
- Modify: `bot/handlers/user/game_accounts.py` (add change handlers)

**Interfaces:**
- Consumes: `is_cooldown_active`, `release_and_reassign`, `build_provider_select_keyboard`, `Config.account_change_cooldown_hours`
- Produces: handlers for `F.text == "🔄 更换游戏账号"` and `F.data.startswith("game_change:")`

- [ ] **Step 1: Add additional imports to `bot/handlers/user/game_accounts.py`**

Add to existing imports:

```python
from bot.keyboards.game_accounts import build_provider_select_keyboard
from db.repositories.account_repo import (
    is_cooldown_active,
    release_and_reassign,
    # assign_account and get_user_game_accounts already imported
)
from aiogram.types import CopyTextButton
```

- [ ] **Step 2: Add change handlers to `bot/handlers/user/game_accounts.py`**

```python
@router.message(F.text == "🔄 更换游戏账号")
async def handle_change_account_menu(
    message: Message, pool: asyncpg.Pool
) -> None:
    user = await get_user_by_telegram_id(pool, message.from_user.id)
    if not user:
        await message.answer("您尚未注册。请发送 /start 开始注册。")
        return

    accounts = await get_user_game_accounts(pool, user["id"])
    if not accounts:
        await message.answer("您尚未领取任何游戏账号。\n请先在「🎮 我的游戏账号」领取账号。")
        return

    providers_with_accounts = [acc["provider"] for acc in accounts]
    keyboard = build_provider_select_keyboard("game_change", providers_with_accounts)
    await message.answer("请选择要更换的游戏平台：", reply_markup=keyboard)


@router.callback_query(F.data.startswith("game_change:"))
async def handle_change_account(
    callback: CallbackQuery,
    pool: asyncpg.Pool,
    config: Config,
) -> None:
    provider = callback.data.split(":", 1)[1]
    if provider not in PROVIDERS:
        await callback.answer("无效的平台。", show_alert=True)
        return

    user = await get_user_by_telegram_id(pool, callback.from_user.id)
    if not user:
        await callback.answer("您尚未注册。", show_alert=True)
        return

    # Check cooldown
    in_cooldown, next_time = await is_cooldown_active(
        pool, user["id"], provider, config.account_change_cooldown_hours
    )
    if in_cooldown:
        next_str = next_time.strftime("%Y-%m-%d %H:%M UTC") if next_time else "稍后"
        await callback.answer(
            f"❌ {provider} 距上次更换不足 {config.account_change_cooldown_hours} 小时。\n"
            f"请于 {next_str} 后再试。",
            show_alert=True,
        )
        return

    # Attempt atomic release + reassign
    result = await release_and_reassign(pool, user["id"], provider)

    if result is None:
        # No new stock — fetch current account to show in error
        accounts = await get_user_game_accounts(pool, user["id"])
        current = next((a for a in accounts if a["provider"] == provider), None)
        current_info = (
            f"\n账号：{current['username']}\n密码：{current['password']}"
            if current
            else ""
        )
        await callback.answer(
            f"⚠️ 当前没有可用的新账号。\n您的现有账号保持不变。{current_info}",
            show_alert=True,
        )
        return

    old_username, new_account = result
    keyboard = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="📋 复制账号",
            copy_text=CopyTextButton(text=new_account["username"]),
        ),
        InlineKeyboardButton(
            text="📋 复制密码",
            copy_text=CopyTextButton(text=new_account["password"]),
        ),
    ]])

    await callback.message.answer(
        f"✅ 更换成功\n\n"
        f"游戏平台：{provider}\n"
        f"旧账号：{old_username}\n"
        f"新账号：`{new_account['username']}`\n"
        f"密码：`{new_account['password']}`",
        reply_markup=keyboard,
        parse_mode="Markdown",
    )
    await callback.answer()
```

- [ ] **Step 3: Run all tests**

```bash
python3 -m pytest tests/ -v
```
Expected: `25 passed`

- [ ] **Step 4: Commit**

```bash
git add bot/handlers/user/game_accounts.py
git commit -m "feat: change account — cooldown check, atomic release+reassign"
```

---

### Task 7: Admin /import_accounts

**Files:**
- Create: `bot/handlers/admin/import_accounts.py`

**Interfaces:**
- Consumes: `parse_account_csv`, `bulk_import_accounts`, `build_provider_select_keyboard`, `IsAdmin(["SUPER_ADMIN"])`, `PROVIDERS`
- Produces: `router` with `/import_accounts` FSM

- [ ] **Step 1: Create `bot/handlers/admin/import_accounts.py`**

```python
from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

import asyncpg

from bot.constants import PROVIDERS
from bot.filters import IsAdmin
from bot.keyboards.game_accounts import build_provider_select_keyboard
from db.repositories.account_repo import bulk_import_accounts, parse_account_csv

router = Router()


class ImportAccountsStates(StatesGroup):
    waiting_provider = State()
    waiting_file = State()


@router.message(Command("import_accounts"), IsAdmin(["SUPER_ADMIN"]))
async def cmd_import_accounts(message: Message, state: FSMContext) -> None:
    await state.set_state(ImportAccountsStates.waiting_provider)
    keyboard = build_provider_select_keyboard("imp_prov")
    await message.answer(
        "请选择要导入账号的游戏平台：\n\n或发送 /cancel 取消。",
        reply_markup=keyboard,
    )


@router.message(Command("cancel"), ImportAccountsStates.waiting_provider)
@router.message(Command("cancel"), ImportAccountsStates.waiting_file)
async def cmd_cancel_import_accounts(message: Message, state: FSMContext) -> None:
    await state.clear()
    await message.answer("已取消导入。")


@router.callback_query(
    ImportAccountsStates.waiting_provider,
    F.data.startswith("imp_prov:"),
)
async def process_provider_selection(
    callback: CallbackQuery, state: FSMContext
) -> None:
    provider = callback.data.split(":", 1)[1]
    if provider not in PROVIDERS:
        await callback.answer("无效的平台。", show_alert=True)
        return

    await state.update_data(provider=provider)
    await state.set_state(ImportAccountsStates.waiting_file)
    await callback.message.edit_text(
        f"已选择：{provider}\n\n"
        f"请上传 CSV 文件（格式如下），或发送 /cancel 取消：\n\n"
        f"username,password\n"
        f"918001,Aaaa1111\n"
        f"918002,Aaaa1111"
    )
    await callback.answer()


@router.message(ImportAccountsStates.waiting_file, F.document)
async def process_accounts_file(
    message: Message,
    state: FSMContext,
    pool: asyncpg.Pool,
) -> None:
    doc = message.document
    if not (doc.file_name or "").endswith(".csv"):
        await message.answer("请上传 .csv 格式文件，或发送 /cancel 取消。")
        return

    data = await state.get_data()
    provider = data["provider"]
    await state.clear()

    processing_msg = await message.answer("⏳ 正在处理文件，请稍候...")

    file = await message.bot.get_file(doc.file_id)
    downloaded = await message.bot.download_file(file.file_path)
    content = downloaded.read()

    try:
        records = parse_account_csv(content)
    except Exception:
        await processing_msg.edit_text("❌ CSV 解析失败，请检查文件格式。")
        return

    if not records:
        await processing_msg.edit_text(
            "CSV 文件为空或格式不正确（需含 'username' 和 'password' 列）。"
        )
        return

    try:
        result = await bulk_import_accounts(pool, provider, records)
        await processing_msg.edit_text(
            f"导入完成 ✅\n"
            f"Provider：{provider}\n\n"
            f"总记录：{result.total:,}\n"
            f"新增：{result.inserted:,}\n"
            f"重复：{result.duplicates:,}\n"
            f"失败：{result.failed:,}"
        )
    except Exception:
        await processing_msg.edit_text("❌ 数据库写入失败，请重试。")


@router.message(ImportAccountsStates.waiting_file)
async def process_accounts_not_file(message: Message) -> None:
    await message.answer("请上传 .csv 文件，或发送 /cancel 取消。")
```

- [ ] **Step 2: Run all tests**

```bash
python3 -m pytest tests/ -v
```
Expected: `25 passed`

- [ ] **Step 3: Commit**

```bash
git add bot/handlers/admin/import_accounts.py
git commit -m "feat: /import_accounts — FSM with provider selection and bulk CSV import"
```

---

### Task 8: Admin /account_stats

**Files:**
- Create: `bot/handlers/admin/account_stats.py`

**Interfaces:**
- Consumes: `get_account_stats`, `IsAdmin(["SUPER_ADMIN", "ADMIN"])`, `PROVIDERS`
- Produces: `router` with `/account_stats`

- [ ] **Step 1: Create `bot/handlers/admin/account_stats.py`**

```python
from __future__ import annotations

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

import asyncpg

from bot.filters import IsAdmin
from db.repositories.account_repo import get_account_stats

router = Router()


@router.message(Command("account_stats"), IsAdmin(["SUPER_ADMIN", "ADMIN"]))
async def cmd_account_stats(message: Message, pool: asyncpg.Pool) -> None:
    stats = await get_account_stats(pool)

    lines = ["📊 账号库存统计\n"]
    for s in stats:
        available = s["available"]
        status = "🔴 库存不足" if available == 0 else "🟢 正常"
        lines.append(
            f"{s['provider']}\n"
            f"总账号：{s['total']:,} | 可用：{available:,} | "
            f"已分配：{s['assigned']:,} | 停用：{s['disabled']:,}\n"
            f"状态：{status}\n"
        )

    await message.answer("\n".join(lines))
```

- [ ] **Step 2: Run all tests**

```bash
python3 -m pytest tests/ -v
```
Expected: `25 passed`

- [ ] **Step 3: Commit**

```bash
git add bot/handlers/admin/account_stats.py
git commit -m "feat: /account_stats — per-provider inventory with status indicators"
```

---

### Task 9: Admin /disable_account and /enable_account

**Files:**
- Create: `bot/handlers/admin/account_manage.py`

**Interfaces:**
- Consumes: `get_account_by_provider_username`, `disable_account`, `enable_account`, `force_disable_account`, `get_user_by_id`, `IsAdmin(["SUPER_ADMIN"])`, `PROVIDERS`
- Produces: `router` with `/disable_account`, `/enable_account`; callback `game_force_disable:<account_pool_id>`

- [ ] **Step 1: Create `bot/handlers/admin/account_manage.py`**

```python
from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

import asyncpg

from bot.filters import IsAdmin
from db.repositories.account_repo import (
    disable_account,
    enable_account,
    force_disable_account,
    get_account_by_provider_username,
)
from db.repositories.user_repo import get_user_by_id

router = Router()


def _parse_provider_username(text: str) -> tuple[str, str] | None:
    """Parse '/cmd Provider Username' → (provider, username) or None."""
    parts = text.strip().split(maxsplit=2)
    if len(parts) < 3:
        return None
    return parts[1], parts[2]


@router.message(Command("disable_account"), IsAdmin(["SUPER_ADMIN"]))
async def cmd_disable_account(message: Message, pool: asyncpg.Pool) -> None:
    parsed = _parse_provider_username(message.text or "")
    if not parsed:
        await message.answer("用法：/disable_account <Provider> <Username>\n例如：/disable_account 918Kiss 918001")
        return

    provider, username = parsed
    account = await get_account_by_provider_username(pool, provider, username)

    if not account:
        await message.answer(f"未找到账号：{provider} / {username}")
        return

    if account["status"] == "DISABLED":
        await message.answer(f"该账号已是停用状态：{provider} {username}")
        return

    if account["status"] == "AVAILABLE":
        await disable_account(pool, provider, username)
        await message.answer(f"✅ 账号已停用：{provider} {username}")
        return

    # ASSIGNED — need confirmation with user info
    user = await get_user_by_id(pool, account["assigned_user_id"]) if account["assigned_user_id"] else None
    user_info = (
        f"User ID：#{user['id']} | 电话：{user['phone']}"
        if user
        else f"User ID：#{account['assigned_user_id']}"
    )

    keyboard = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="✅ 强制停用并解除绑定",
            callback_data=f"game_force_disable:{account['id']}",
        ),
        InlineKeyboardButton(text="❌ 取消", callback_data="game_force_cancel"),
    ]])
    await message.answer(
        f"⚠️ 该账号目前已分配给会员：\n{user_info}\n\n请选择：",
        reply_markup=keyboard,
    )


@router.callback_query(F.data.startswith("game_force_disable:"))
async def handle_force_disable(callback: CallbackQuery, pool: asyncpg.Pool) -> None:
    try:
        account_pool_id = int(callback.data.split(":", 1)[1])
    except ValueError:
        await callback.answer("参数错误。", show_alert=True)
        return

    await force_disable_account(pool, account_pool_id)
    await callback.message.edit_text("✅ 账号已强制停用，绑定已解除。")
    await callback.answer()


@router.callback_query(F.data == "game_force_cancel")
async def handle_force_cancel(callback: CallbackQuery) -> None:
    await callback.message.edit_text("操作已取消。")
    await callback.answer()


@router.message(Command("enable_account"), IsAdmin(["SUPER_ADMIN"]))
async def cmd_enable_account(message: Message, pool: asyncpg.Pool) -> None:
    parsed = _parse_provider_username(message.text or "")
    if not parsed:
        await message.answer("用法：/enable_account <Provider> <Username>\n例如：/enable_account 918Kiss 918001")
        return

    provider, username = parsed
    account = await get_account_by_provider_username(pool, provider, username)

    if not account:
        await message.answer(f"未找到账号：{provider} / {username}")
        return

    if account["status"] != "DISABLED":
        await message.answer(
            f"该账号当前状态为 {account['status']}，无需启用。"
        )
        return

    await enable_account(pool, provider, username)
    await message.answer(f"✅ 账号已恢复可用：{provider} {username}")
```

- [ ] **Step 2: Run all tests**

```bash
python3 -m pytest tests/ -v
```
Expected: `25 passed`

- [ ] **Step 3: Commit**

```bash
git add bot/handlers/admin/account_manage.py
git commit -m "feat: /disable_account and /enable_account — with confirmation for assigned accounts"
```

---

### Task 10: Update /search_user with Game Accounts

**Files:**
- Modify: `bot/handlers/admin/search.py` (update `cmd_search_user`, `cmd_search_phone`, `cmd_search_bank` to include game accounts)

**Interfaces:**
- Consumes: `get_user_game_accounts`, `format_game_accounts`
- Produces: Updated search_user output = `format_user_info(user) + "\n\n" + format_game_accounts(accounts)`

- [ ] **Step 1: Modify `bot/handlers/admin/search.py`**

Add imports at the top (after existing imports):

```python
from bot.utils.formatters import format_game_accounts
from db.repositories.account_repo import get_user_game_accounts
```

Update the three search handlers to append game account info. Replace all three handler bodies:

```python
@router.message(Command("search_phone"), IsAdmin())
async def cmd_search_phone(message: Message, pool: asyncpg.Pool):
    parts = (message.text or "").split(maxsplit=1)
    if len(parts) < 2:
        await message.answer("用法：/search_phone <电话号码>")
        return

    phone = normalize_phone(parts[1])
    if phone is None:
        await message.answer("电话号码格式不正确。")
        return

    user = await get_user_by_phone(pool, phone)
    if not user:
        await message.answer("未找到该电话号码的会员。")
        return

    accounts = await get_user_game_accounts(pool, user["id"])
    await message.answer(
        format_user_info(user) + "\n\n" + format_game_accounts(accounts)
    )


@router.message(Command("search_bank"), IsAdmin())
async def cmd_search_bank(message: Message, pool: asyncpg.Pool):
    parts = (message.text or "").split(maxsplit=1)
    if len(parts) < 2:
        await message.answer("用法：/search_bank <银行账号>")
        return

    bank_account = parts[1].strip()
    user = await get_user_by_bank_account(pool, bank_account)
    if not user:
        await message.answer("未找到该银行账号的会员。")
        return

    accounts = await get_user_game_accounts(pool, user["id"])
    await message.answer(
        format_user_info(user) + "\n\n" + format_game_accounts(accounts)
    )


@router.message(Command("search_user"), IsAdmin())
async def cmd_search_user(message: Message, pool: asyncpg.Pool):
    parts = (message.text or "").split(maxsplit=1)
    if len(parts) < 2:
        await message.answer("用法：/search_user <用户ID>")
        return

    try:
        user_id = int(parts[1])
    except ValueError:
        await message.answer("用户ID 必须是数字。")
        return

    user = await get_user_by_id(pool, user_id)
    if not user:
        await message.answer("未找到该用户ID的会员。")
        return

    accounts = await get_user_game_accounts(pool, user["id"])
    await message.answer(
        format_user_info(user) + "\n\n" + format_game_accounts(accounts)
    )
```

- [ ] **Step 2: Run all tests**

```bash
python3 -m pytest tests/ -v
```
Expected: `25 passed`

- [ ] **Step 3: Commit**

```bash
git add bot/handlers/admin/search.py
git commit -m "feat: search commands now include game account info"
```

---

### Task 11: Wire All New Routers in main.py

**Files:**
- Modify: `bot/main.py`

**Interfaces:**
- Consumes: all new routers from Tasks 4–9
- Produces: fully wired bot with all Phase 1 + game account features

- [ ] **Step 1: Update `bot/main.py`**

Replace full file:

```python
from __future__ import annotations
import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage

from bot.config import load_config
from bot.handlers.admin.account_manage import router as account_manage_router
from bot.handlers.admin.account_stats import router as account_stats_router
from bot.handlers.admin.freeze import router as freeze_router
from bot.handlers.admin.import_accounts import router as import_accounts_router
from bot.handlers.admin.import_free_list import router as import_router
from bot.handlers.admin.manage_admins import router as manage_router
from bot.handlers.admin.search import router as search_router
from bot.handlers.admin.stats import router as stats_router
from bot.handlers.admin.update_bank import router as update_bank_router
from bot.handlers.user.game_accounts import router as game_accounts_router
from bot.handlers.user.registration import router as registration_router
from bot.middlewares.admin_middleware import AdminMiddleware
from db.connection import create_pool
from db.repositories.admin_repo import create_or_ensure_super_admin

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


async def main() -> None:
    config = load_config()

    pool = await create_pool(config)
    logger.info("Database pool created.")

    await create_or_ensure_super_admin(pool, config.super_admin_id)
    logger.info(f"Super admin ensured: {config.super_admin_id}")

    bot = Bot(token=config.bot_token)
    dp = Dispatcher(storage=MemoryStorage())

    dp["pool"] = pool
    dp["config"] = config

    dp.message.middleware(AdminMiddleware())
    dp.callback_query.middleware(AdminMiddleware())

    # User routers first — registration catches /start and F.text menu buttons
    dp.include_router(registration_router)
    dp.include_router(game_accounts_router)

    # Admin routers
    dp.include_router(search_router)
    dp.include_router(manage_router)
    dp.include_router(freeze_router)
    dp.include_router(update_bank_router)
    dp.include_router(import_router)
    dp.include_router(stats_router)
    dp.include_router(import_accounts_router)
    dp.include_router(account_stats_router)
    dp.include_router(account_manage_router)

    logger.info("Bot starting — polling...")
    try:
        await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())
    finally:
        await pool.close()
        await bot.session.close()
        logger.info("Bot stopped.")


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 2: Run all tests**

```bash
python3 -m pytest tests/ -v
```
Expected: `25 passed`

- [ ] **Step 3: Commit**

```bash
git add bot/main.py
git commit -m "feat: wire game account pool routers — all Phase 1 features complete"
```
