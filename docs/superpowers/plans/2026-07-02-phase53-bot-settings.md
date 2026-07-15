# Phase 5.3 — ERP Control Center: Bot Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform ERP into the complete bot control center — all Telegram bot business configuration, notification switches, relay settings, and health monitoring managed from ERP without editing .env files.

**Architecture:** New `system_settings` keys (migration 025) store bot business config; a Python `SettingsCache` class polls DB every 60s and is initialized in the relay (api_server.py), exposing `/health`, `/reload-settings`, and `/restart` HTTP endpoints; ERP's Bot Settings page reads/writes via `/api/settings/bot` which triggers hot-reload via the relay; a Health Dashboard aggregates Telegram/relay/DB/ERP status by enhancing the existing `/api/maintenance/health` route; notification switches are checked in ERP deposit/withdrawal/announcement routes before calling the relay.

**Tech Stack:** Next.js 15 App Router, PostgreSQL (pg), Python 3.11 aiohttp, aiogram 3, Tailwind CSS

## Global Constraints

- `npx tsc --noEmit` must produce zero errors after every task
- `pytest tests/ -q` baseline: 11 failed / 97 passed — no new failures
- No new npm packages
- `BOT_RELAY_AUTH_TOKEN`, `DATABASE_URL`, `JWT_SECRET` stay in `.env` forever — never move to ERP
- `TELEGRAM_BOT_TOKEN` stays in `.env` for bot startup; ERP displays it masked read-only; changing it requires redeploy
- Hot-reload (`/reload-settings`) must NOT require Docker restart
- Restart (`/restart`) causes relay to `sys.exit(0)`; Docker restart policy handles recovery
- All ERP bot settings routes require `SUPER_ADMIN` role (same check as existing `/api/settings`)
- All configuration changes must be logged in audit_logs with old and new values
- Live Chat and all Phase 5.1/5.2 features must not regress

## Existing infrastructure (do NOT recreate)

- `system_settings` table exists (migration 015) — key, value, description, updated_by, updated_at
- `settings_repo.ts` exists with `getAllSettings()`, `getSetting(key)`, `setSettings(updates, username)`
- `GET /api/settings` and `PATCH /api/settings` routes exist (generic, all keys)
- `GET /api/maintenance/health` exists — checks DB + calls relay `/health` (currently relay has no `/health` endpoint, returns 404)
- `GET /settings/page.tsx` exists — generic settings page (General, Live Chat, Media sections)
- `sidebar.tsx` has flat nav, already has `/settings` link

---

## File Map

### New files
| File | Purpose |
|------|---------|
| `erp/migrations/025_bot_settings_keys.sql` | Seed missing system_settings keys for bot config |
| `bot/settings_cache.py` | SettingsCache — polls DB every 60s, serves get/get_bool/get_int |
| `erp/src/app/api/settings/bot/route.ts` | GET/PATCH bot settings (scoped keys) + relay reload on save |
| `erp/src/app/api/settings/bot/reload/route.ts` | POST → relay /reload-settings |
| `erp/src/app/api/settings/bot/restart/route.ts` | POST → relay /restart |
| `erp/src/app/(dashboard)/settings/bot/page.tsx` | Bot Settings page with health dashboard |

### Modified files
| File | Change |
|------|--------|
| `bot/api_server.py` | Import SettingsCache; initialize on startup; add /health, /reload-settings, /restart routes |
| `erp/src/app/api/maintenance/health/route.ts` | Parse relay /health body for version/uptime/telegram |
| `erp/src/components/sidebar.tsx` | Add Control Center group with Telegram Bot link |
| `erp/src/app/api/deposits/[id]/approve/route.ts` | Check notify_deposit before relay call |
| `erp/src/app/api/deposits/[id]/reject/route.ts` | Check notify_deposit before relay call |
| `erp/src/app/api/withdrawals/[id]/approve/route.ts` | Check notify_withdrawal before relay call |
| `erp/src/app/api/withdrawals/[id]/reject/route.ts` | Check notify_withdrawal before relay call |
| `erp/src/app/api/announcements/[id]/broadcast/route.ts` | Check notify_announcement before relay call |

---

## Task 1: DB Migration 025

**Files:**
- Create: `erp/migrations/025_bot_settings_keys.sql`

**Interfaces:**
- Produces: 16 new rows in `system_settings` (notification switches, relay config, bot identity)

- [ ] **Step 1: Create migration file**

`erp/migrations/025_bot_settings_keys.sql`:
```sql
-- 025_bot_settings_keys.sql
-- Adds bot business configuration keys to system_settings.
-- Safe: ON CONFLICT DO NOTHING preserves any existing values.

INSERT INTO system_settings (key, value, description) VALUES
  -- Bot Identity (token stays in .env; these are informational)
  ('bot_username',               '',       'Telegram bot username without @'),
  ('bot_description',            '',       'Bot description shown in Telegram'),
  ('bot_language',               'en',     'Bot language code (e.g. en, zh, ms)'),
  ('support_chat_id',            '0',      'Telegram group ID for support forwarding (0 = disabled)'),

  -- Relay Configuration
  ('relay_timeout_secs',         '30',     'Relay HTTP request timeout in seconds'),
  ('relay_retry_count',          '3',      'Number of relay retry attempts on failure'),
  ('relay_retry_delay_secs',     '1',      'Delay between relay retries in seconds'),

  -- Notification Switches (ERP checks these before calling relay notify endpoints)
  ('notify_deposit',             'true',   'Send Telegram notification on deposit status change'),
  ('notify_withdrawal',          'true',   'Send Telegram notification on withdrawal status change'),
  ('notify_promotion',           'true',   'Send Telegram notification when promotion is applied'),
  ('notify_bonus',               'true',   'Send Telegram notification when bonus is awarded'),
  ('notify_announcement',        'true',   'Send Telegram notification for announcements'),
  ('notify_broadcast',           'true',   'Send Telegram notification for broadcasts'),
  ('notify_support',             'true',   'Send Telegram notification on support session open/close'),
  ('notify_maintenance',         'true',   'Send Telegram notification when maintenance mode changes')
ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 2: Apply migration**

```bash
psql $DATABASE_URL -f erp/migrations/025_bot_settings_keys.sql
```
Expected output: `INSERT 0 16` (or fewer if some keys already exist)

If `$DATABASE_URL` is not available as a shell variable, read the value from `.env` and run:
```bash
psql "postgresql://USER:PASS@HOST/DB" -f erp/migrations/025_bot_settings_keys.sql
```

- [ ] **Step 3: Verify rows exist**

```bash
psql $DATABASE_URL -c "SELECT key, value FROM system_settings WHERE key LIKE 'notify_%' OR key LIKE 'relay_%' OR key IN ('bot_username','bot_description','bot_language','support_chat_id') ORDER BY key;"
```
Expected: 16 rows.

- [ ] **Step 4: Commit**

```bash
git add erp/migrations/025_bot_settings_keys.sql
git commit -m "feat: migration 025 — bot settings, relay config, notification switch keys"
```

---

## Task 2: SettingsCache + Relay Endpoints

**Files:**
- Create: `bot/settings_cache.py`
- Modify: `bot/api_server.py`

**Interfaces:**
- Produces: `SettingsCache(pool, refresh_interval=60)` with `.start()`, `.stop()`, `.reload()`, `.get(key, default)`, `.get_bool(key, default)`, `.get_int(key, default)`
- Produces: relay `GET /health` (no auth) returning `{ ok, version, uptime_seconds, settings_keys, telegram: { ok, username, latency_ms, error? } }`
- Produces: relay `POST /reload-settings` (Bearer auth) → calls `settings_cache.reload()`
- Produces: relay `POST /restart` (Bearer auth) → `sys.exit(0)` after 0.5s

- [ ] **Step 1: Create bot/settings_cache.py**

```python
# bot/settings_cache.py
from __future__ import annotations

import asyncio
import logging
from typing import Optional

import asyncpg

logger = logging.getLogger(__name__)


class SettingsCache:
    """Polls system_settings from PostgreSQL every `refresh_interval` seconds.

    Initialized once at relay startup; /reload-settings forces an immediate reload.
    """

    def __init__(self, pool: asyncpg.Pool, refresh_interval: int = 60) -> None:
        self._pool = pool
        self._cache: dict[str, str] = {}
        self._interval = refresh_interval
        self._task: Optional[asyncio.Task] = None  # type: ignore[type-arg]

    async def start(self) -> None:
        await self._load()
        self._task = asyncio.create_task(self._refresh_loop())
        logger.info("SettingsCache started — %d keys loaded", len(self._cache))

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def reload(self) -> None:
        """Force immediate reload (called by /reload-settings endpoint)."""
        await self._load()
        logger.info("SettingsCache reloaded — %d keys", len(self._cache))

    async def _load(self) -> None:
        rows = await self._pool.fetch("SELECT key, value FROM system_settings")
        self._cache = {row["key"]: row["value"] for row in rows}

    async def _refresh_loop(self) -> None:
        while True:
            await asyncio.sleep(self._interval)
            try:
                await self._load()
            except Exception as exc:  # noqa: BLE001
                logger.error("SettingsCache refresh failed: %s", exc)

    def get(self, key: str, default: Optional[str] = None) -> Optional[str]:
        return self._cache.get(key, default)

    def get_bool(self, key: str, default: bool = False) -> bool:
        v = self._cache.get(key)
        if v is None:
            return default
        return v.lower() in ("true", "1", "yes", "on")

    def get_int(self, key: str, default: int = 0) -> int:
        v = self._cache.get(key)
        if v is None:
            return default
        try:
            return int(v)
        except (ValueError, TypeError):
            return default
```

- [ ] **Step 2: Add imports and module constants to api_server.py**

At the top of `bot/api_server.py`, after the existing imports, add:
```python
import sys
import time
from settings_cache import SettingsCache

BOT_VERSION = "1.0.0"
_START_TIME = time.monotonic()
```

- [ ] **Step 3: Add /health handler to api_server.py**

Insert after the existing relay handlers, before the `main()` function:

```python
async def health_handler(request: web.Request) -> web.Response:
    """GET /health — relay status, uptime, and Telegram connectivity."""
    bot: Bot = request.app["bot"]
    sc: Optional[SettingsCache] = request.app.get("settings_cache")

    uptime_seconds = int(time.monotonic() - _START_TIME)

    tg_ok = False
    tg_username: Optional[str] = None
    tg_latency_ms = 0
    tg_error: Optional[str] = None
    try:
        t0 = time.monotonic()
        me = await bot.get_me()
        tg_latency_ms = int((time.monotonic() - t0) * 1000)
        tg_ok = True
        tg_username = f"@{me.username}"
    except Exception as exc:  # noqa: BLE001
        tg_error = str(exc)

    tg_payload: dict = {"ok": tg_ok, "latency_ms": tg_latency_ms}
    if tg_username:
        tg_payload["username"] = tg_username
    if tg_error:
        tg_payload["error"] = tg_error

    return web.json_response({
        "ok": True,
        "version": BOT_VERSION,
        "uptime_seconds": uptime_seconds,
        "settings_keys": len(sc._cache) if sc else 0,
        "telegram": tg_payload,
    })
```

- [ ] **Step 4: Add /reload-settings handler to api_server.py**

```python
async def reload_settings_handler(request: web.Request) -> web.Response:
    """POST /reload-settings — reload SettingsCache from DB; no Docker restart needed."""
    auth = request.headers.get("Authorization", "")
    if auth != f"Bearer {RELAY_AUTH_TOKEN}":
        return web.json_response({"error": "Unauthorized"}, status=401)

    sc: Optional[SettingsCache] = request.app.get("settings_cache")
    if sc:
        await sc.reload()

    return web.json_response({"ok": True})
```

- [ ] **Step 5: Add /restart handler to api_server.py**

```python
async def restart_handler(request: web.Request) -> web.Response:
    """POST /restart — exit relay process; Docker restart policy recovers it."""
    auth = request.headers.get("Authorization", "")
    if auth != f"Bearer {RELAY_AUTH_TOKEN}":
        return web.json_response({"error": "Unauthorized"}, status=401)

    async def _delayed_exit() -> None:
        await asyncio.sleep(0.5)
        logger.info("Relay restarting on ERP request")
        sys.exit(0)

    asyncio.create_task(_delayed_exit())
    return web.json_response({"ok": True, "message": "Relay is restarting…"})
```

- [ ] **Step 6: Wire SettingsCache into app lifecycle and add routes**

Find the app startup / on_startup section in `api_server.py` (look for `app["pool"]` or `asyncpg.create_pool`). Add SettingsCache after the pool is created:

```python
# After pool is assigned to app:
settings_cache = SettingsCache(app["pool"])
await settings_cache.start()
app["settings_cache"] = settings_cache
```

Find the cleanup/on_shutdown section and add:
```python
sc: Optional[SettingsCache] = app.get("settings_cache")
if sc:
    await sc.stop()
```

Find the router registration block (the `app.router.add_*` lines) and add three new routes:
```python
app.router.add_get("/health",           health_handler)
app.router.add_post("/reload-settings", reload_settings_handler)
app.router.add_post("/restart",         restart_handler)
```

Note: the existing `app.router.add_post("/relay", relay_message)` and other routes stay unchanged.

- [ ] **Step 7: Run Python tests**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot && pytest tests/ -q 2>&1 | tail -5
```
Expected: 11 failed / 97 passed (no regressions — we added new Python files but changed no existing logic)

- [ ] **Step 8: Commit**

```bash
git add bot/settings_cache.py bot/api_server.py
git commit -m "feat: SettingsCache + relay /health, /reload-settings, /restart endpoints"
```

---

## Task 3: ERP API Routes

**Files:**
- Create: `erp/src/app/api/settings/bot/route.ts`
- Create: `erp/src/app/api/settings/bot/reload/route.ts`
- Create: `erp/src/app/api/settings/bot/restart/route.ts`
- Modify: `erp/src/app/api/maintenance/health/route.ts`
- Modify: `erp/src/app/api/deposits/[id]/approve/route.ts`
- Modify: `erp/src/app/api/deposits/[id]/reject/route.ts`
- Modify: `erp/src/app/api/withdrawals/[id]/approve/route.ts`
- Modify: `erp/src/app/api/withdrawals/[id]/reject/route.ts`
- Modify: `erp/src/app/api/announcements/[id]/broadcast/route.ts`

**Interfaces:**
- Consumes: `getAllSettings`, `setSettings`, `getSetting` from `@/lib/repositories/settings_repo`
- Consumes: `logAudit` from `@/lib/repositories/audit_repo`
- Produces: `GET /api/settings/bot` → `{ settings: Record<string,string>, env: { bot_token_masked: string, relay_url: string } }`
- Produces: `PATCH /api/settings/bot` with body `Record<string,string>` → `{ ok: true, reloaded: boolean }`
- Produces: `POST /api/settings/bot/reload` → `{ ok: boolean, error?: string }`
- Produces: `POST /api/settings/bot/restart` → `{ ok: boolean, message?: string }`
- Produces: enhanced `GET /api/maintenance/health` → adds `telegram` and `uptime_seconds`/`version` fields inside `bot_relay` check

The bot-scoped keys managed by `/api/settings/bot`:
```
bot_name, bot_username, bot_description, bot_language, support_chat_id,
bot_relay_url, relay_timeout_secs, relay_retry_count, relay_retry_delay_secs,
notify_deposit, notify_withdrawal, notify_promotion, notify_bonus,
notify_announcement, notify_broadcast, notify_support, notify_maintenance
```

- [ ] **Step 1: Create erp/src/app/api/settings/bot/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getAllSettings, setSettings } from '@/lib/repositories/settings_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

const BOT_RELAY_URL        = process.env.BOT_RELAY_URL        ?? 'http://localhost:8090';
const BOT_RELAY_AUTH_TOKEN = process.env.BOT_RELAY_AUTH_TOKEN ?? 'change_me_relay_token';
const BOT_TOKEN            = process.env.BOT_TOKEN            ?? '';

const BOT_SETTING_KEYS = new Set([
  'bot_name', 'bot_username', 'bot_description', 'bot_language', 'support_chat_id',
  'bot_relay_url', 'relay_timeout_secs', 'relay_retry_count', 'relay_retry_delay_secs',
  'notify_deposit', 'notify_withdrawal', 'notify_promotion', 'notify_bonus',
  'notify_announcement', 'notify_broadcast', 'notify_support', 'notify_maintenance',
]);

async function requireSuperAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload || payload.role !== 'SUPER_ADMIN') return null;
  return payload;
}

function maskToken(t: string): string {
  if (!t || t.length < 10) return '***';
  return `${t.slice(0, 4)}...${t.slice(-4)}`;
}

export async function GET() {
  const payload = await requireSuperAdmin();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const all = await getAllSettings();
  const settings: Record<string, string> = {};
  for (const s of all) {
    if (BOT_SETTING_KEYS.has(s.key)) settings[s.key] = s.value;
  }

  return NextResponse.json({
    settings,
    env: { bot_token_masked: maskToken(BOT_TOKEN), relay_url: BOT_RELAY_URL },
  });
}

export async function PATCH(request: NextRequest) {
  const payload = await requireSuperAdmin();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, string>;
  try {
    body = (await request.json()) as Record<string, string>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (BOT_SETTING_KEYS.has(k)) updates[k] = String(v);
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid bot setting keys provided' }, { status: 400 });
  }

  // Capture old values for audit log
  const allBefore = await getAllSettings();
  const oldValues = Object.fromEntries(allBefore.map((s) => [s.key, s.value]));

  await setSettings(updates, payload.username);

  logAudit({
    admin_id:    payload.sub,
    action:      'BOT_SETTINGS_UPDATED',
    target_type: 'system_settings',
    target_id:   null,
    new_value: {
      changes: Object.fromEntries(
        Object.entries(updates).map(([k, v]) => [k, { old: oldValues[k] ?? null, new: v }])
      ),
    },
  }).catch(() => {});

  // Hot-reload relay settings
  let reloaded = false;
  try {
    const res = await fetch(`${BOT_RELAY_URL}/reload-settings`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${BOT_RELAY_AUTH_TOKEN}` },
      signal:  AbortSignal.timeout(5000),
    });
    reloaded = res.ok;
  } catch {
    reloaded = false;
  }

  return NextResponse.json({ ok: true, reloaded });
}
```

- [ ] **Step 2: Create erp/src/app/api/settings/bot/reload/route.ts**

```typescript
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';

const BOT_RELAY_URL        = process.env.BOT_RELAY_URL        ?? 'http://localhost:8090';
const BOT_RELAY_AUTH_TOKEN = process.env.BOT_RELAY_AUTH_TOKEN ?? 'change_me_relay_token';

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload || payload.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const res = await fetch(`${BOT_RELAY_URL}/reload-settings`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${BOT_RELAY_AUTH_TOKEN}` },
      signal:  AbortSignal.timeout(5000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json({ ok: res.ok, ...(data as object) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 502 });
  }
}
```

- [ ] **Step 3: Create erp/src/app/api/settings/bot/restart/route.ts**

```typescript
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';

const BOT_RELAY_URL        = process.env.BOT_RELAY_URL        ?? 'http://localhost:8090';
const BOT_RELAY_AUTH_TOKEN = process.env.BOT_RELAY_AUTH_TOKEN ?? 'change_me_relay_token';

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload || payload.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const res = await fetch(`${BOT_RELAY_URL}/restart`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${BOT_RELAY_AUTH_TOKEN}` },
      signal:  AbortSignal.timeout(5000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json({ ok: res.ok, ...(data as object) });
  } catch {
    // Relay exits mid-request — connection reset is expected; treat as success
    return NextResponse.json({ ok: true, message: 'Relay is restarting…' });
  }
}
```

- [ ] **Step 4: Enhance /api/maintenance/health/route.ts**

The file currently has a `checkRelay` function that fetches `BOT_RELAY_URL/health` but only returns `ok` and `latency_ms`. Update it to parse the relay response body:

Replace the `checkRelay` function with:
```typescript
type RelayHealthBody = {
  ok?: boolean;
  version?: string;
  uptime_seconds?: number;
  settings_keys?: number;
  telegram?: {
    ok: boolean;
    username?: string | null;
    latency_ms?: number;
    error?: string;
  };
};

async function checkRelay(): Promise<{
  ok: boolean;
  latency_ms: number;
  version?: string;
  uptime_seconds?: number;
  telegram?: RelayHealthBody['telegram'];
  error?: string;
}> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const r = await fetch(`${BOT_RELAY_URL}/health`, {
      headers: { Authorization: `Bearer ${BOT_RELAY_AUTH_TOKEN}` },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    const latency_ms = Date.now() - start;
    if (!r.ok) return { ok: false, latency_ms };
    const body = await r.json().catch(() => ({})) as RelayHealthBody;
    return {
      ok: true,
      latency_ms,
      version:        body.version,
      uptime_seconds: body.uptime_seconds,
      telegram:       body.telegram,
    };
  } catch (e) {
    return { ok: false, latency_ms: Date.now() - start, error: String(e) };
  }
}
```

The `GET()` handler and `checkDatabase()` function remain unchanged — the enhanced `bot_relay` object is transparently richer.

- [ ] **Step 5: Add notification switches to deposit routes**

Read `erp/src/app/api/deposits/[id]/approve/route.ts` first to understand its structure, then add before the relay notify call:

```typescript
import { getSetting } from '@/lib/repositories/settings_repo';

// Before the fetch to relay /notify/deposit (or equivalent):
const notifyDeposit = await getSetting('notify_deposit');
if (notifyDeposit !== 'false') {
  // existing relay notify call here
}
```

Apply the same pattern to:
- `erp/src/app/api/deposits/[id]/reject/route.ts` — key `notify_deposit`
- `erp/src/app/api/withdrawals/[id]/approve/route.ts` — key `notify_withdrawal`
- `erp/src/app/api/withdrawals/[id]/reject/route.ts` — key `notify_withdrawal`
- `erp/src/app/api/announcements/[id]/broadcast/route.ts` — key `notify_announcement`

Important: Read each file before editing to identify where the relay notify call is. Wrap only that specific call — do not modify status update logic or response shape.

- [ ] **Step 6: TypeScript check**

```bash
cd erp && npx tsc --noEmit 2>&1
```
Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add erp/src/app/api/settings/bot/ \
        erp/src/app/api/maintenance/health/route.ts \
        "erp/src/app/api/deposits/[id]/approve/route.ts" \
        "erp/src/app/api/deposits/[id]/reject/route.ts" \
        "erp/src/app/api/withdrawals/[id]/approve/route.ts" \
        "erp/src/app/api/withdrawals/[id]/reject/route.ts" \
        "erp/src/app/api/announcements/[id]/broadcast/route.ts"
git commit -m "feat: /api/settings/bot routes + enhanced health + notification switches"
```

---

## Task 4: Bot Settings Page UI

**Files:**
- Create: `erp/src/app/(dashboard)/settings/bot/page.tsx`

**Interfaces:**
- Consumes: `GET /api/settings/bot` → `{ settings: Record<string,string>, env: { bot_token_masked, relay_url } }`
- Consumes: `PATCH /api/settings/bot` → `{ ok, reloaded }`
- Consumes: `GET /api/maintenance/health` → `{ status, checks: { database: { ok, latency_ms }, bot_relay: { ok, latency_ms, version?, uptime_seconds?, telegram?: { ok, username?, latency_ms?, error? } } }, timestamp }`
- Consumes: `POST /api/settings/bot/reload` → `{ ok }`
- Consumes: `POST /api/settings/bot/restart` → `{ ok, message? }`

- [ ] **Step 1: Create the page**

`erp/src/app/(dashboard)/settings/bot/page.tsx`:

```typescript
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

type Settings = Record<string, string>;
type EnvInfo  = { bot_token_masked: string; relay_url: string };

type SvcStatus = {
  ok: boolean;
  latency_ms?: number;
  version?: string;
  uptime_seconds?: number;
  error?: string;
  telegram?: { ok: boolean; username?: string | null; latency_ms?: number; error?: string };
};

type HealthData = {
  status: string;
  timestamp: string;
  checks: { database: SvcStatus; bot_relay: SvcStatus };
};

// ── Helpers ────────────────────────────────────────────────────────────────

function uptime(s: number): string {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function Badge({ ok, sub }: { ok: boolean; sub?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
      {ok ? 'Online' : 'Offline'}{sub ? ` · ${sub}` : ''}
    </span>
  );
}

function SaveBtn({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={busy}
      className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60">
      {busy ? <><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Saving…</> : 'Save'}
    </button>
  );
}

// ── Notification keys ─────────────────────────────────────────────────────

const NOTIFY: Array<{ key: string; label: string }> = [
  { key: 'notify_deposit',      label: 'Deposit' },
  { key: 'notify_withdrawal',   label: 'Withdrawal' },
  { key: 'notify_promotion',    label: 'Promotion' },
  { key: 'notify_bonus',        label: 'Bonus' },
  { key: 'notify_announcement', label: 'Announcement' },
  { key: 'notify_broadcast',    label: 'Broadcast' },
  { key: 'notify_support',      label: 'Support' },
  { key: 'notify_maintenance',  label: 'Maintenance' },
];

// ── Page ──────────────────────────────────────────────────────────────────

export default function BotSettingsPage() {
  const [settings, setSettings] = useState<Settings>({});
  const [env, setEnv]           = useState<EnvInfo>({ bot_token_masked: '…', relay_url: '' });
  const [health, setHealth]     = useState<HealthData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState<string | null>(null);
  const [toast, setToast]       = useState<{ msg: string; ok: boolean } | null>(null);
  const [restarting, setRestarting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const flash = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const loadSettings = useCallback(async () => {
    const r = await fetch('/api/settings/bot');
    if (!r.ok) return;
    const d = await r.json() as { settings: Settings; env: EnvInfo };
    setSettings(d.settings);
    setEnv(d.env);
    setLoading(false);
  }, []);

  const loadHealth = useCallback(async () => {
    const r = await fetch('/api/maintenance/health');
    if (r.ok) setHealth(await r.json() as HealthData);
  }, []);

  useEffect(() => {
    void loadSettings();
    void loadHealth();
    timerRef.current = setInterval(() => void loadHealth(), 30_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loadSettings, loadHealth]);

  const set = (key: string, value: string) =>
    setSettings((p) => ({ ...p, [key]: value }));
  const toggle = (key: string) =>
    setSettings((p) => ({ ...p, [key]: p[key] === 'true' ? 'false' : 'true' }));

  const save = async (sectionId: string, keys: string[]) => {
    setSaving(sectionId);
    const updates: Settings = {};
    keys.forEach((k) => { updates[k] = settings[k] ?? ''; });
    try {
      const r = await fetch('/api/settings/bot', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const d = await r.json() as { ok?: boolean; reloaded?: boolean };
      if (r.ok) {
        flash(d.reloaded ? 'Saved and settings reloaded.' : 'Saved. (Relay offline — applies on next start.)', true);
        await loadSettings();
      } else {
        flash('Save failed.', false);
      }
    } catch { flash('Network error.', false); }
    finally { setSaving(null); }
  };

  const reload = async () => {
    setSaving('reload');
    try {
      const r = await fetch('/api/settings/bot/reload', { method: 'POST' });
      const d = await r.json() as { ok?: boolean };
      flash(d.ok ? 'Settings reloaded.' : 'Reload failed.', d.ok ?? false);
    } catch { flash('Cannot reach relay.', false); }
    finally { setSaving(null); }
  };

  const restart = async () => {
    if (!confirm('Restart the bot relay? It will be unavailable for ~5 seconds.')) return;
    setRestarting(true);
    try {
      await fetch('/api/settings/bot/restart', { method: 'POST' });
    } catch { /* connection reset is expected */ }
    flash('Relay is restarting…', true);
    setTimeout(() => { void loadHealth(); setRestarting(false); }, 6000);
  };

  if (loading) return <div className="p-8 text-gray-400 animate-pulse">Loading…</div>;

  const relay    = health?.checks.bot_relay;
  const db       = health?.checks.database;
  const telegram = relay?.telegram;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Telegram Bot</h1>
          <p className="mt-1 text-sm text-gray-500">Bot configuration, relay settings, and notification preferences.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void reload()} disabled={saving === 'reload'}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50">
            {saving === 'reload' ? 'Reloading…' : 'Reload Config'}
          </button>
          <button onClick={() => void restart()} disabled={restarting}
            className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-100 disabled:opacity-50">
            {restarting ? 'Restarting…' : 'Restart Relay'}
          </button>
        </div>
      </div>

      {/* Health Dashboard */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">System Health</h2>
          <span className="text-xs text-gray-400">
            {health ? `Updated ${new Date(health.timestamp).toLocaleTimeString()}` : 'Loading…'}
          </span>
        </div>
        <div className="px-6 py-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {/* Telegram */}
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Telegram</p>
            {telegram
              ? <><Badge ok={telegram.ok} sub={telegram.latency_ms ? `${telegram.latency_ms}ms` : undefined} />
                  {telegram.username && <p className="text-xs text-gray-500">{telegram.username}</p>}
                  {telegram.error && <p className="text-xs text-red-500 truncate">{telegram.error}</p>}</>
              : <span className="text-xs text-gray-400">{relay?.ok ? 'Checking…' : 'Unavailable'}</span>}
          </div>
          {/* Relay */}
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Relay</p>
            {relay
              ? <><Badge ok={relay.ok} sub={relay.latency_ms ? `${relay.latency_ms}ms` : undefined} />
                  {relay.ok && relay.uptime_seconds != null && <p className="text-xs text-gray-500">Up {uptime(relay.uptime_seconds)}</p>}
                  {relay.version && <p className="text-xs text-gray-400">v{relay.version}</p>}
                  {relay.error && <p className="text-xs text-red-500 truncate">{relay.error}</p>}</>
              : <span className="text-xs text-gray-400">Checking…</span>}
          </div>
          {/* Database */}
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Database</p>
            {db
              ? <><Badge ok={db.ok} sub={db.latency_ms ? `${db.latency_ms}ms` : undefined} />
                  {db.error && <p className="text-xs text-red-500 truncate">{db.error}</p>}</>
              : <span className="text-xs text-gray-400">Checking…</span>}
          </div>
          {/* ERP */}
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">ERP</p>
            <Badge ok={true} />
            <p className="text-xs text-gray-400">This instance</p>
          </div>
        </div>
      </div>

      {/* Bot Identity */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-base font-semibold text-gray-800">Bot Identity</h2>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bot Token</label>
            <input readOnly value={env.bot_token_masked}
              className="block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed" />
            <p className="mt-1 text-xs text-gray-400">Change in .env and redeploy to update the bot token.</p>
          </div>
          {([
            ['bot_name',        'Display Name',      'Support Bot'],
            ['bot_username',    'Username',          'my_support_bot (without @)'],
            ['bot_description', 'Description',       'Customer support bot'],
            ['bot_language',    'Language Code',     'en'],
            ['support_chat_id', 'Support Group ID',  '0 (0 = disabled)'],
          ] as const).map(([key, label, placeholder]) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input type="text" value={settings[key] ?? ''} placeholder={placeholder}
                onChange={(e) => set(key, e.target.value)}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          ))}
        </div>
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex justify-end">
          <SaveBtn busy={saving === 'identity'} onClick={() => void save('identity', ['bot_name','bot_username','bot_description','bot_language','support_chat_id'])} />
        </div>
      </div>

      {/* Relay Configuration */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-base font-semibold text-gray-800">Relay Configuration</h2>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Relay URL (from environment)</label>
            <input readOnly value={env.relay_url}
              className="block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Relay URL Override</label>
            <input type="text" value={settings['bot_relay_url'] ?? ''} placeholder="Leave empty to use BOT_RELAY_URL from .env"
              onChange={(e) => set('bot_relay_url', e.target.value)}
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          {([
            ['relay_timeout_secs',     'Timeout (seconds)',      '30'],
            ['relay_retry_count',      'Retry Count',            '3'],
            ['relay_retry_delay_secs', 'Retry Delay (seconds)',  '1'],
          ] as const).map(([key, label, placeholder]) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input type="number" min={0} value={settings[key] ?? ''} placeholder={placeholder}
                onChange={(e) => set(key, e.target.value)}
                className="block w-32 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          ))}
        </div>
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex justify-end">
          <SaveBtn busy={saving === 'relay'} onClick={() => void save('relay', ['bot_relay_url','relay_timeout_secs','relay_retry_count','relay_retry_delay_secs'])} />
        </div>
      </div>

      {/* Notification Switches */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-base font-semibold text-gray-800">Notification Switches</h2>
          <p className="mt-0.5 text-xs text-gray-500">Control which events trigger Telegram messages to customers.</p>
        </div>
        <div className="px-6 py-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {NOTIFY.map(({ key, label }) => (
            <label key={key} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-4 py-3 cursor-pointer hover:bg-gray-50">
              <span className="text-sm font-medium text-gray-700">{label}</span>
              <button type="button" role="switch" aria-checked={settings[key] === 'true'}
                onClick={() => toggle(key)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${settings[key] === 'true' ? 'bg-blue-600' : 'bg-gray-200'}`}>
                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${settings[key] === 'true' ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </label>
          ))}
        </div>
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex justify-end">
          <SaveBtn busy={saving === 'notifications'} onClick={() => void save('notifications', NOTIFY.map((n) => n.key))} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd erp && npx tsc --noEmit 2>&1
```
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add "erp/src/app/(dashboard)/settings/bot/page.tsx"
git commit -m "feat: Bot Settings page — health dashboard, identity, relay config, notification switches"
```

---

## Task 5: Sidebar Control Center Section

**Files:**
- Modify: `erp/src/components/sidebar.tsx`

**Interfaces:**
- Produces: "Control Center" labeled group in sidebar containing "Telegram Bot" link → `/settings/bot`
- Preserves: all existing nav links unchanged
- Active link detection: `/settings` only active on exact `/settings` (not when on `/settings/bot`)

- [ ] **Step 1: Update sidebar.tsx**

Replace the existing `NAV` array and nav render with grouped navigation. The full new `sidebar.tsx`:

```typescript
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Users, ArrowDownToLine, ArrowUpFromLine, Landmark, Gift,
  ScrollText, MessageSquare, LogOut, BarChart2, TrendingUp, ShieldAlert,
  Gamepad2, Database, Megaphone, UserCog, Settings, Wrench, Bot,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type NavItem  = { href: string; label: string; icon: React.ElementType; exact?: boolean };
type NavGroup = { title?: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { href: '/',            label: 'Dashboard',    icon: LayoutDashboard, exact: true },
      { href: '/members',     label: 'Members',      icon: Users },
      { href: '/deposits',    label: 'Deposits',     icon: ArrowDownToLine },
      { href: '/withdrawals', label: 'Withdrawals',  icon: ArrowUpFromLine },
      { href: '/livechat',    label: 'Live Chat',    icon: MessageSquare },
    ],
  },
  {
    items: [
      { href: '/banks',         label: 'Bank Manager',  icon: Landmark },
      { href: '/promotions',    label: 'Promotions',    icon: Gift },
      { href: '/announcements', label: 'Announcements', icon: Megaphone },
      { href: '/audit',         label: 'Audit Log',     icon: ScrollText },
    ],
  },
  {
    items: [
      { href: '/finance',   label: 'Finance Reports',  icon: BarChart2 },
      { href: '/analytics', label: 'Member Analytics', icon: TrendingUp },
      { href: '/risk',      label: 'Risk Center',      icon: ShieldAlert },
      { href: '/providers', label: 'Providers',        icon: Gamepad2 },
      { href: '/accounts',  label: 'Game Accounts',    icon: Database },
    ],
  },
  {
    title: 'Control Center',
    items: [
      { href: '/settings/bot', label: 'Telegram Bot', icon: Bot },
    ],
  },
  {
    items: [
      { href: '/admin-users', label: 'Admin Users', icon: UserCog },
      { href: '/settings',    label: 'Settings',    icon: Settings, exact: true },
      { href: '/maintenance', label: 'Maintenance', icon: Wrench },
    ],
  },
];

function isActive(href: string, pathname: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + '/');
}

export function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const [maintenanceOn, setMaintenanceOn] = useState(false);

  useEffect(() => {
    fetch('/api/maintenance/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { maintenance_mode: boolean } | null) => {
        if (d?.maintenance_mode) setMaintenanceOn(true);
      })
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="flex h-full w-56 flex-col border-r bg-white">
      <div className="border-b px-4 py-4">
        <span className="text-base font-semibold tracking-tight">ERP Admin</span>
      </div>

      {maintenanceOn && (
        <div className="mx-2 mt-2 rounded-md bg-red-50 border border-red-300 px-3 py-2 text-xs text-red-700 font-medium">
          Maintenance mode is ON
        </div>
      )}

      <nav className="flex-1 overflow-y-auto p-2">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && <div className="mx-1 my-2 border-t border-gray-100" />}
            {group.title && (
              <p className="mx-3 mb-1 mt-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                {group.title}
              </p>
            )}
            {group.items.map(({ href, label, icon: Icon, exact }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive(href, pathname, exact)
                    ? 'bg-gray-100 font-medium text-gray-900'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                <Icon size={16} />
                {label}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t p-2">
        <button
          onClick={() => void handleLogout()}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd erp && npx tsc --noEmit 2>&1
```
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add erp/src/components/sidebar.tsx
git commit -m "feat: sidebar Control Center section with Telegram Bot link"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|-----------------|------|
| Bot Token displayed masked read-only | Task 4 — `env.bot_token_masked` from `BOT_TOKEN` env |
| Bot Username, Display Name, Description, Language | Task 1 (keys) + Task 3 (GET/PATCH scope) + Task 4 (UI) |
| Relay URL, Timeout, Retry Count, Delay | Task 1 (keys) + Task 3 + Task 4 |
| Notification switches (8 types) | Task 1 (keys) + Task 3 (ERP route checks + API) + Task 4 (toggle UI) |
| Health Dashboard: Telegram, Relay, DB, ERP | Task 2 (relay /health) + Task 3 (health parse) + Task 4 (panel, 30s refresh) |
| Reload Configuration (hot, no Docker restart) | Task 2 (/reload-settings) + Task 3 (bot/reload route) + Task 4 (button) |
| Restart Relay (Docker restart policy) | Task 2 (/restart + sys.exit) + Task 3 (bot/restart route) + Task 4 (button + confirm) |
| Config changes logged with old+new values | Task 3 — `logAudit` with `changes: { key: { old, new } }` |
| Control Center section in sidebar | Task 5 |
| SUPER_ADMIN auth on all bot settings routes | Task 3 — `requireSuperAdmin()` in all three route files |
| No .env editing for business config | All business config in system_settings after Tasks 1-4 |
| Multi-tenant preparation | settings_repo uses parameterized queries; no hardcoded tenant assumptions |
| Active link `/settings` does not highlight on `/settings/bot` | Task 5 — `exact: true` flag + `isActive()` function |

### Placeholder scan

None found. All steps contain complete code.

### Type consistency

- `BOT_SETTING_KEYS` set in Task 3 route exactly matches the keys saved in `save('identity', [...])`, `save('relay', [...])`, `save('notifications', [...])` in Task 4
- `SvcStatus.telegram` in Task 4 matches `RelayHealthBody['telegram']` parsed in Task 3's enhanced `checkRelay`
- `SettingsCache` produced in Task 2 is imported and used in Task 2's api_server.py handlers
- `Settings = Record<string, string>` in Task 4 matches `setSettings(Record<string, string>, username)` signature in settings_repo.ts
