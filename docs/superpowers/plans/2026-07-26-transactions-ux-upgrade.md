# Transactions Center UX Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the ERP Transactions Center with real-time pending queue, notification sound, search, sidebar badge, browser title, and row highlight — all from a single source of truth.

**Architecture:** A new PostgreSQL `transaction_pending_count` channel fires on every PENDING status change; a new SSE endpoint `/api/transactions/stream` broadcasts these events; the sidebar and transactions page both subscribe and call `GET /api/transactions/pending-count` (which returns `{count, deposit_count, withdrawal_count}`) to stay authoritative. The transactions API gains `type=pending` and `search` params. The page is rewritten; the sidebar is refactored.

**Tech Stack:** Next.js App Router, PostgreSQL (pg_notify / LISTEN), Server-Sent Events, React hooks (useRef throttle), Vitest, TypeScript strict, Tailwind CSS.

## Global Constraints

- Do NOT modify: 918KISS, game APIs, wallet, deposit/withdrawal approval logic, auth, receipt upload/viewer, Docker, nginx, `/api/deposits/stream`, `/api/deposits/unread`
- No breaking changes to existing API response contracts
- TypeScript strict mode — no `any`, use `unknown` + type assertions only where necessary
- Lint clean — no unused imports or variables
- All four UI locations (sidebar badge, browser title, pending tab badge, summary card) must read from the same `GET /api/transactions/pending-count` call — never from independent counters
- Sound plays at most once per 250ms throttle window, only when `newCount > prevCount`
- Row highlight fires only on SSE-triggered refreshes (`realtimeRefresh = true`), never on user-driven navigation
- Search applies identically to deposits and withdrawals via outer WHERE on UNION ALL sub-query

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `db/migrations/034_transaction_pending_count.sql` | CREATE | pg_notify trigger on deposit_requests + withdrawal_requests |
| `erp/src/app/api/transactions/pending-count/route.ts` | CREATE | Returns `{count, deposit_count, withdrawal_count}` |
| `erp/src/app/api/transactions/stream/route.ts` | CREATE | SSE: LISTEN transaction_pending_count channel |
| `erp/tests/transactions-pending-count.test.ts` | CREATE | Vitest tests for pending-count route |
| `erp/src/app/api/transactions/route.ts` | MODIFY | Add `search` param + `type=pending` support |
| `erp/tests/transactions-route-params.test.ts` | CREATE | Vitest tests for new query params |
| `erp/src/components/sidebar.tsx` | MODIFY | Replace depositsUnread with pendingCount, add throttled SSE, browser title |
| `erp/src/app/globals.css` | MODIFY | Add `@keyframes highlight-fade` + `.animate-highlight` |
| `erp/src/app/(dashboard)/transactions/page.tsx` | REWRITE | Pending tab, search, summary card, highlight, auto-refresh |

---

## Task 1: DB Migration — pg_notify Triggers

**Files:**
- Create: `db/migrations/034_transaction_pending_count.sql`

**Interfaces:**
- Produces: PostgreSQL channel `transaction_pending_count`, notified with payload `{"event":"pending_changed"}` whenever PENDING count changes on either table

- [ ] **Step 1: Create the migration file**

```sql
-- db/migrations/034_transaction_pending_count.sql
-- Migration 034: Real-time pending count notifications
--
-- Fires pg_notify('transaction_pending_count', '{"event":"pending_changed"}')
-- whenever the PENDING queue size changes on deposit_requests or withdrawal_requests.
--
-- Trigger cases:
--   INSERT   WHERE NEW.status = 'PENDING'                        → notify
--   UPDATE   WHERE OLD.status <> 'PENDING' AND NEW.status = 'PENDING' → notify
--   UPDATE   WHERE OLD.status = 'PENDING'  AND NEW.status <> 'PENDING'→ notify
--
-- No schema changes. No new columns. Triggers only.

CREATE OR REPLACE FUNCTION notify_transaction_pending_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'PENDING' THEN
      PERFORM pg_notify('transaction_pending_count', '{"event":"pending_changed"}');
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (OLD.status <> 'PENDING' AND NEW.status = 'PENDING')
    OR (OLD.status = 'PENDING'  AND NEW.status <> 'PENDING') THEN
      PERFORM pg_notify('transaction_pending_count', '{"event":"pending_changed"}');
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Attach to deposit_requests
DROP TRIGGER IF EXISTS on_deposit_pending_count ON deposit_requests;
CREATE TRIGGER on_deposit_pending_count
  AFTER INSERT OR UPDATE OF status ON deposit_requests
  FOR EACH ROW EXECUTE FUNCTION notify_transaction_pending_count();

-- Attach to withdrawal_requests
DROP TRIGGER IF EXISTS on_withdrawal_pending_count ON withdrawal_requests;
CREATE TRIGGER on_withdrawal_pending_count
  AFTER INSERT OR UPDATE OF status ON withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION notify_transaction_pending_count();
```

- [ ] **Step 2: Apply migration to the database**

If on local dev (Docker):
```bash
docker compose exec db psql -U postgres -d tesla88 \
  -f /migrations/034_transaction_pending_count.sql
```

If running `scripts/migrate.sh`:
```bash
bash scripts/migrate.sh
```

Expected output: `CREATE FUNCTION`, `DROP TRIGGER`, `CREATE TRIGGER`, `DROP TRIGGER`, `CREATE TRIGGER` (no errors).

- [ ] **Step 3: Verify triggers exist in the database**

```bash
docker compose exec db psql -U postgres -d tesla88 -c "
SELECT trigger_name, event_object_table, event_manipulation
FROM information_schema.triggers
WHERE trigger_name IN ('on_deposit_pending_count', 'on_withdrawal_pending_count')
ORDER BY event_object_table;
"
```

Expected output:
```
         trigger_name          | event_object_table | event_manipulation
-------------------------------+--------------------+--------------------
 on_deposit_pending_count      | deposit_requests   | INSERT
 on_deposit_pending_count      | deposit_requests   | UPDATE
 on_withdrawal_pending_count   | withdrawal_requests| INSERT
 on_withdrawal_pending_count   | withdrawal_requests| UPDATE
(4 rows)
```

- [ ] **Step 4: Manually verify notify fires**

In one terminal — open psql listener:
```bash
docker compose exec db psql -U postgres -d tesla88 -c "LISTEN transaction_pending_count;"
```

In another terminal — insert a fake PENDING deposit:
```bash
docker compose exec db psql -U postgres -d tesla88 -c "
INSERT INTO deposit_requests (user_id, deposit_amount, status, payment_bank)
VALUES (1, 100, 'PENDING', 'TEST_BANK');
"
```

Expected: the LISTEN terminal shows:
```
Asynchronous notification "transaction_pending_count" received from server process ...
```

Clean up:
```bash
docker compose exec db psql -U postgres -d tesla88 -c "
DELETE FROM deposit_requests WHERE payment_bank = 'TEST_BANK';
"
```

- [ ] **Step 5: Commit**

```bash
git add db/migrations/034_transaction_pending_count.sql
git commit -m "feat(db): add transaction_pending_count pg_notify trigger

Fires on INSERT (status=PENDING) and UPDATE (PENDING↔other) on both
deposit_requests and withdrawal_requests. Single source of truth for
real-time pending queue notifications."
```

---

## Task 2: Pending Count API + SSE Stream

**Files:**
- Create: `erp/src/app/api/transactions/pending-count/route.ts`
- Create: `erp/src/app/api/transactions/stream/route.ts`
- Create: `erp/tests/transactions-pending-count.test.ts`

**Interfaces:**
- Consumes: Task 1's `transaction_pending_count` pg_notify channel
- Produces:
  - `GET /api/transactions/pending-count` → `{ count: number, deposit_count: number, withdrawal_count: number }`
  - `GET /api/transactions/stream` → SSE text/event-stream, emits `data: {"event":"pending_changed"}\n\n`

- [ ] **Step 1: Write the failing tests**

Create `erp/tests/transactions-pending-count.test.ts`:

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  default: { query: vi.fn() },
}));

vi.mock('@/lib/require_permission', () => ({
  requirePermission: vi.fn(),
}));

import { GET } from '@/app/api/transactions/pending-count/route';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';
import type { AuthPayload } from '@/lib/require_permission';

const ADMIN: AuthPayload = { sub: 1, username: 'admin', role: 'SUPER_ADMIN' };

describe('GET /api/transactions/pending-count', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when caller has neither deposit.view nor withdraw.view', async () => {
    vi.mocked(requirePermission).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/unauthorized/i);
  });

  it('returns 200 with breakdown when caller has deposit.view', async () => {
    vi.mocked(requirePermission).mockImplementation((perm) =>
      Promise.resolve(perm === 'deposit.view' ? ADMIN : null)
    );
    vi.mocked(pool.query).mockResolvedValue({
      rows: [{ count: 8, deposit_count: 5, withdrawal_count: 3 }],
    } as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { count: number; deposit_count: number; withdrawal_count: number };
    expect(body.count).toBe(8);
    expect(body.deposit_count).toBe(5);
    expect(body.withdrawal_count).toBe(3);
  });

  it('returns 200 with breakdown when caller has withdraw.view only', async () => {
    vi.mocked(requirePermission).mockImplementation((perm) =>
      Promise.resolve(perm === 'withdraw.view' ? ADMIN : null)
    );
    vi.mocked(pool.query).mockResolvedValue({
      rows: [{ count: 2, deposit_count: 0, withdrawal_count: 2 }],
    } as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { count: number };
    expect(body.count).toBe(2);
  });

  it('returns zeros when no pending transactions exist', async () => {
    vi.mocked(requirePermission).mockResolvedValue(ADMIN);
    vi.mocked(pool.query).mockResolvedValue({
      rows: [{ count: 0, deposit_count: 0, withdrawal_count: 0 }],
    } as never);

    const res = await GET();
    const body = await res.json() as { count: number; deposit_count: number; withdrawal_count: number };
    expect(body.count).toBe(0);
    expect(body.deposit_count).toBe(0);
    expect(body.withdrawal_count).toBe(0);
  });

  it('coerces NULL aggregation fields to 0 (empty UNION ALL produces NULLs)', async () => {
    vi.mocked(requirePermission).mockResolvedValue(ADMIN);
    vi.mocked(pool.query).mockResolvedValue({
      rows: [{ count: null, deposit_count: null, withdrawal_count: null }],
    } as never);

    const res = await GET();
    const body = await res.json() as { count: number; deposit_count: number; withdrawal_count: number };
    expect(body.count).toBe(0);
    expect(body.deposit_count).toBe(0);
    expect(body.withdrawal_count).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd erp && npx vitest run tests/transactions-pending-count.test.ts 2>&1 | tail -15
```

Expected: FAIL — `Cannot find module '@/app/api/transactions/pending-count/route'`

- [ ] **Step 3: Create the pending-count route**

Create `erp/src/app/api/transactions/pending-count/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';

export const dynamic = 'force-dynamic';

export async function GET() {
  const depPerm = await requirePermission('deposit.view');
  const wdPerm  = await requirePermission('withdraw.view');
  if (!depPerm && !wdPerm) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { rows } = await pool.query<{
    count: number | null;
    deposit_count: number | null;
    withdrawal_count: number | null;
  }>(`
    SELECT
      SUM(CASE WHEN source = 'deposit'    THEN 1 ELSE 0 END)::int AS deposit_count,
      SUM(CASE WHEN source = 'withdrawal' THEN 1 ELSE 0 END)::int AS withdrawal_count,
      COUNT(*)::int AS count
    FROM (
      SELECT 'deposit'    AS source FROM deposit_requests    WHERE status = 'PENDING'
      UNION ALL
      SELECT 'withdrawal' AS source FROM withdrawal_requests WHERE status = 'PENDING'
    ) sub
  `);

  const row = rows[0] ?? { count: null, deposit_count: null, withdrawal_count: null };
  return NextResponse.json({
    count:            row.count            ?? 0,
    deposit_count:    row.deposit_count    ?? 0,
    withdrawal_count: row.withdrawal_count ?? 0,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd erp && npx vitest run tests/transactions-pending-count.test.ts 2>&1 | tail -15
```

Expected: PASS — 5 tests passed.

- [ ] **Step 5: Create the SSE stream route**

Create `erp/src/app/api/transactions/stream/route.ts`:

```typescript
import { NextRequest } from 'next/server';
import { Client } from 'pg';
import { requirePermission } from '@/lib/require_permission';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const depPerm = await requirePermission('deposit.view');
  const wdPerm  = await requirePermission('withdraw.view');
  if (!depPerm && !wdPerm) return new Response('Unauthorized', { status: 401 });

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    await client.query('LISTEN transaction_pending_count');
  } catch {
    return new Response('DB connection failed', { status: 503 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const cleanup = async () => {
    if (closed) return;
    closed = true;
    try {
      await client.query('UNLISTEN transaction_pending_count');
      await client.end();
    } catch { /* ignore */ }
  };

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(': connected\n\n'));

      client.on('notification', (msg) => {
        if (!msg.payload || closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${msg.payload}\n\n`));
        } catch {
          cleanup();
        }
      });

      client.on('error', () => {
        cleanup();
        try { controller.close(); } catch { /* ignore */ }
      });

      const hb = setInterval(() => {
        if (closed) { clearInterval(hb); return; }
        try { controller.enqueue(encoder.encode(': ping\n\n')); }
        catch { clearInterval(hb); cleanup(); }
      }, 25000);

      request.signal.addEventListener('abort', () => {
        clearInterval(hb);
        cleanup();
        try { controller.close(); } catch { /* ignore */ }
      });
    },
    cancel() { cleanup(); },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
```

- [ ] **Step 6: Manually verify SSE endpoint**

```bash
# In one terminal — hit the SSE endpoint (requires a valid session cookie):
curl -N http://localhost:3001/api/transactions/stream \
  -H "Cookie: erp_token=<your-dev-jwt>"
```

Expected output:
```
: connected

: ping
```

Then trigger a DB notify (see Task 1 Step 4) and verify:
```
data: {"event":"pending_changed"}
```

- [ ] **Step 7: Commit**

```bash
git add \
  erp/src/app/api/transactions/pending-count/route.ts \
  erp/src/app/api/transactions/stream/route.ts \
  erp/tests/transactions-pending-count.test.ts
git commit -m "feat(api): add /transactions/pending-count and /transactions/stream

pending-count: returns {count, deposit_count, withdrawal_count} from live DB.
stream: SSE endpoint LISTENing on transaction_pending_count pg_notify channel.
Tests: 5 unit tests for pending-count route (auth + breakdown + null coercion)."
```

---

## Task 3: Transactions API — search + pending type

**Files:**
- Modify: `erp/src/app/api/transactions/route.ts`
- Create: `erp/tests/transactions-route-params.test.ts`

**Interfaces:**
- Consumes: existing `pool`, `requirePermission`, existing SQL constants in same file
- Produces: `GET /api/transactions?type=pending` → only PENDING rows, newest first; `GET /api/transactions?search=X` → ILIKE filter applied identically to deposits and withdrawals

- [ ] **Step 1: Write failing tests**

Create `erp/tests/transactions-route-params.test.ts`:

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  default: { query: vi.fn() },
}));

vi.mock('@/lib/require_permission', () => ({
  requirePermission: vi.fn(),
}));

import { GET } from '@/app/api/transactions/route';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';
import type { AuthPayload } from '@/lib/require_permission';
import { NextRequest } from 'next/server';

const ADMIN: AuthPayload = { sub: 1, username: 'admin', role: 'SUPER_ADMIN' };

const EMPTY_RESULT = {
  rows: [],
  rowCount: 0,
} as never;

const COUNT_RESULT = {
  rows: [{ count: 0 }],
  rowCount: 1,
} as never;

function makeReq(qs: string): NextRequest {
  return new NextRequest(`http://localhost/api/transactions?${qs}`);
}

describe('GET /api/transactions — new params', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requirePermission).mockResolvedValue(ADMIN);
    // pool.query called twice per request: data + count
    vi.mocked(pool.query)
      .mockResolvedValueOnce(EMPTY_RESULT)
      .mockResolvedValueOnce(COUNT_RESULT);
  });

  it('type=pending forces status=PENDING in outer WHERE', async () => {
    await GET(makeReq('type=pending'));
    const [[dataSql]] = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
    expect(dataSql).toContain(`status = 'PENDING'`);
  });

  it('type=pending uses UNION ALL base (not deposit-only or withdrawal-only)', async () => {
    await GET(makeReq('type=pending'));
    const [[dataSql]] = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
    // UNION ALL base has both 'deposit' and 'withdrawal' literal strings
    expect(dataSql).toContain("'deposit'");
    expect(dataSql).toContain("'withdrawal'");
  });

  it('type=pending ignores an explicit status param', async () => {
    await GET(makeReq('type=pending&status=APPROVED'));
    const [[dataSql]] = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
    // Should still only have PENDING, not APPROVED
    expect(dataSql).toContain(`status = 'PENDING'`);
    expect(dataSql).not.toContain('APPROVED');
  });

  it('search adds ILIKE condition and parameterized value', async () => {
    await GET(makeReq('search=john'));
    const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
    const [dataSql, dataParams] = calls[0];
    expect(dataSql).toContain('ILIKE');
    expect(dataParams).toContain('%john%');
  });

  it('search applies to both first_name, phone, public_id, user_id', async () => {
    await GET(makeReq('search=0123'));
    const [[dataSql]] = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
    expect(dataSql).toContain('first_name');
    expect(dataSql).toContain('phone');
    expect(dataSql).toContain('public_id');
    expect(dataSql).toContain('user_id');
  });

  it('type=pending + search combines both filters', async () => {
    await GET(makeReq('type=pending&search=SS10'));
    const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
    const [dataSql, dataParams] = calls[0];
    expect(dataSql).toContain(`status = 'PENDING'`);
    expect(dataSql).toContain('ILIKE');
    expect(dataParams).toContain('%SS10%');
  });

  it('no new params = backward compat: no ILIKE, no PENDING filter', async () => {
    await GET(makeReq(''));
    const [[dataSql, dataParams]] = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
    expect(dataSql).not.toContain('ILIKE');
    expect(dataSql).not.toContain(`status = 'PENDING'`);
    expect(dataParams).toEqual([20, 0]);  // only limit + offset
  });

  it('existing status=PROCESSING filter still works', async () => {
    await GET(makeReq('status=PROCESSING'));
    const [[dataSql]] = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
    expect(dataSql).toContain(`status = 'PROCESSING'`);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd erp && npx vitest run tests/transactions-route-params.test.ts 2>&1 | tail -20
```

Expected: multiple FAIL — `type=pending` not yet handled, ILIKE not yet added.

- [ ] **Step 3: Modify `erp/src/app/api/transactions/route.ts`**

Open the existing file. Find the `export async function GET(request: NextRequest)` block. Replace the body with:

```typescript
export async function GET(request: NextRequest) {
  const depPerm = await requirePermission('deposit.view');
  const wdPerm  = await requirePermission('withdraw.view');
  if (!depPerm && !wdPerm) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const canViewPhone = !!(await requirePermission('member.view_phone'));
  const { searchParams } = request.nextUrl;

  const txType = searchParams.get('type') ?? 'all';   // all | deposit | withdrawal | pending
  const status = searchParams.get('status')?.trim() ?? '';
  const search = searchParams.get('search')?.trim() ?? '';
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit  = 20;
  const offset = (page - 1) * limit;

  // ── WHERE clause construction ────────────────────────────────────────────
  const conditions: string[] = [];

  // Status / pending filter
  if (txType === 'pending') {
    // Pending tab: lock to PENDING, ignore any explicit status param
    conditions.push(`status = 'PENDING'`);
  } else if (status === 'approved_paid') {
    conditions.push(`status IN ('APPROVED','PAID')`);
  } else if (status) {
    conditions.push(`status = '${status.replace(/'/g, "''")}'`);
  }

  // Search filter — parameterized; applies uniformly to deposit and withdrawal rows
  const sqlValues: unknown[] = [];
  if (search) {
    sqlValues.push(`%${search}%`);
    const idx = sqlValues.length;  // 1-indexed param position
    conditions.push(
      `(first_name ILIKE $${idx} OR phone ILIKE $${idx} OR public_id ILIKE $${idx} OR user_id::text ILIKE $${idx})`
    );
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limitIdx    = sqlValues.length + 1;
  const offsetIdx   = sqlValues.length + 2;
  const dataParams  = [...sqlValues, limit, offset];

  // ── Query loop: try with processing columns, fall back without ──────────
  for (const useProcessing of [true, false]) {
    let baseSql: string;
    // 'pending' uses the full UNION ALL (both deposits + withdrawals), same as 'all'
    if (txType === 'deposit') {
      baseSql = useProcessing ? DEPOSIT_ONLY_WITH_PROCESSING : DEPOSIT_ONLY_NO_PROCESSING;
    } else if (txType === 'withdrawal') {
      baseSql = useProcessing ? WITHDRAWAL_ONLY_WITH_PROCESSING : WITHDRAWAL_ONLY_NO_PROCESSING;
    } else {
      baseSql = useProcessing ? SELECT_WITH_PROCESSING : SELECT_NO_PROCESSING;
    }

    const dataSql  = `SELECT * FROM (${baseSql}) sub ${whereClause} ORDER BY created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`;
    const countSql = `SELECT COUNT(*)::int AS count FROM (${baseSql}) sub ${whereClause}`;

    try {
      const [dataRes, countRes] = await Promise.all([
        pool.query(dataSql, dataParams),
        pool.query<{ count: number }>(countSql, sqlValues),
      ]);

      const applyMask = (r: Record<string, unknown>) =>
        canViewPhone ? r : { ...r, phone: maskPhone((r.phone as string) ?? '') };

      return NextResponse.json({
        data:  dataRes.rows.map(applyMask),
        total: countRes.rows[0].count,
        page,
        limit,
      });
    } catch (err) {
      if (isMissingColumnError(err) && useProcessing) continue;
      console.error('[transactions] query error:', err);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
  }

  return NextResponse.json({ data: [], total: 0, page, limit });
}
```

Keep all existing constants (`SELECT_WITH_PROCESSING`, `SELECT_NO_PROCESSING`, `DEPOSIT_ONLY_*`, `WITHDRAWAL_ONLY_*`, `isMissingColumnError`, `maskPhone`) unchanged.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd erp && npx vitest run tests/transactions-route-params.test.ts 2>&1 | tail -20
```

Expected: PASS — 8 tests passed.

- [ ] **Step 5: Run full test suite to verify no regression**

```bash
cd erp && npx vitest run 2>&1 | tail -20
```

Expected: all previously-passing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add \
  erp/src/app/api/transactions/route.ts \
  erp/tests/transactions-route-params.test.ts
git commit -m "feat(api): add type=pending and search to /api/transactions

type=pending: forces status='PENDING', uses UNION ALL, ignores status param.
search: ILIKE on first_name/phone/public_id/user_id::text, parameterized,
        applied uniformly to both deposit and withdrawal rows via outer WHERE.
Backward compat: existing params unchanged; bare call returns same results."
```

---

## Task 4: Sidebar Refactor

**Files:**
- Modify: `erp/src/components/sidebar.tsx`

**Interfaces:**
- Consumes: `GET /api/transactions/pending-count` (Task 2), `GET /api/transactions/stream` SSE (Task 2)
- Produces: `pendingCount` state driving badge + browser title; `playNotifBeep()` called at most once per 250ms window on count increase

- [ ] **Step 1: Add `useRef` to the React import**

Open `erp/src/components/sidebar.tsx`. Find:
```typescript
import { useEffect, useState, useCallback } from 'react';
```
Replace with:
```typescript
import { useEffect, useState, useCallback, useRef } from 'react';
```

- [ ] **Step 2: Replace `depositsUnread` state with `pendingCount` + timer ref**

Find:
```typescript
  const [livechatUnread, setLivechatUnread] = useState(0);
  const [depositsUnread, setDepositsUnread] = useState(0);
```
Replace with:
```typescript
  const [livechatUnread, setLivechatUnread] = useState(0);
  const [pendingCount,   setPendingCount]   = useState(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
```

- [ ] **Step 3: Remove the deposit-badge clear-on-navigate useEffect**

Find and delete this entire useEffect block:
```typescript
  // Auto-reset deposit badge when user navigates to /transactions
  useEffect(() => {
    if (pathname.startsWith('/transactions')) {
      setDepositsUnread(0);
      fetch('/api/deposits/unread', { method: 'POST' }).catch(() => {});
    }
  }, [pathname]);
```

(The livechat clear-on-navigate useEffect for `/livechat` stays unchanged.)

- [ ] **Step 4: Add browser title useEffect**

Add this new useEffect immediately after the livechat clear-on-navigate block (and before the main `useEffect` that runs on mount):

```typescript
  // Browser title: (N) Tesla88 ERP when pending queue is non-empty
  useEffect(() => {
    document.title = pendingCount > 0
      ? `(${pendingCount}) Tesla88 ERP`
      : 'Tesla88 ERP';
  }, [pendingCount]);
```

- [ ] **Step 5: Replace deposit SSE logic with transactions SSE in the main useEffect**

The main `useEffect` currently contains:
```typescript
    // Fetch initial deposit unread count
    fetch('/api/deposits/unread')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { count: number } | null) => { if (d?.count) setDepositsUnread(d.count); })
      .catch(() => {});

    // SSE: deposits — increment badge + play sound when new pending deposit arrives
    const depositEs = new EventSource('/api/deposits/stream');
    depositEs.onmessage = (e: MessageEvent) => {
      try {
        const evt = JSON.parse(e.data as string) as { type?: string };
        if (evt.type === 'new_deposit') {
          setDepositsUnread((n) => {
            playNotifBeep();
            return n + 1;
          });
        }
      } catch { /* ignore */ }
    };

    return () => { chatEs.close(); depositEs.close(); };
```

Replace those lines with:

```typescript
    // Initial pending count load — single source of truth for badge + title
    fetch('/api/transactions/pending-count')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { count: number } | null) => { if (d?.count !== undefined) setPendingCount(d.count ?? 0); })
      .catch(() => {});

    // SSE: transactions — throttled refresh of pending count; sound on increase
    const txEs = new EventSource('/api/transactions/stream');
    txEs.onmessage = () => {
      if (refreshTimer.current) return;  // collapse burst events into one fetch
      refreshTimer.current = setTimeout(() => {
        refreshTimer.current = null;
        fetch('/api/transactions/pending-count')
          .then((r) => r.json())
          .then((d: { count: number }) => {
            setPendingCount((prev) => {
              if (d.count > prev) playNotifBeep();  // sound only when queue grows
              return d.count;
            });
          })
          .catch(() => {});
      }, 250);
    };

    return () => {
      chatEs.close();
      txEs.close();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
```

- [ ] **Step 6: Update the sidebar badge from `depositsUnread` to `pendingCount`**

Find:
```tsx
                {href === '/transactions' && depositsUnread > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {depositsUnread > 99 ? '99+' : depositsUnread}
                  </span>
                )}
```
Replace with:
```tsx
                {href === '/transactions' && pendingCount > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </span>
                )}
```

- [ ] **Step 7: Verify TypeScript compiles cleanly**

```bash
cd erp && npx tsc --noEmit 2>&1 | grep -E "sidebar|error" | head -20
```

Expected: no errors from sidebar.tsx.

- [ ] **Step 8: Manual browser verification**

Start dev server: `cd erp && npm run dev`

Checklist:
- [ ] Open ERP in browser; sidebar Transactions item shows a red badge with the current PENDING count (or nothing if 0)
- [ ] Browser tab title shows `(N) Tesla88 ERP` (or just `Tesla88 ERP` if N=0)
- [ ] Insert a PENDING deposit in DB → badge increments, title updates, sound plays once
- [ ] Approve that deposit → badge decrements, title updates, no sound
- [ ] Navigate to `/transactions` → badge does NOT clear (count persists)
- [ ] Livechat badge and sound still work (open a livechat session and send a message)
- [ ] No console errors

- [ ] **Step 9: Commit**

```bash
git add erp/src/components/sidebar.tsx
git commit -m "feat(sidebar): replace depositsUnread with live pendingCount

Source of truth: GET /api/transactions/pending-count (total PENDING deposits+withdrawals).
- Throttled SSE handler (250ms) collapses burst events into one fetch+sound decision
- Sound plays only when pendingCount increases (new work arrived)
- Browser title updates: '(N) Tesla88 ERP' when N>0
- Badge never clears on navigation — only clears when DB count reaches 0
- Removes: depositsUnread, /api/deposits/unread calls, clear-on-navigate logic"
```

---

## Task 5: Transactions Page Rewrite + CSS Highlight

**Files:**
- Modify: `erp/src/app/globals.css`
- Rewrite: `erp/src/app/(dashboard)/transactions/page.tsx`

**Interfaces:**
- Consumes:
  - `GET /api/transactions/pending-count` → `{ count: number, deposit_count: number, withdrawal_count: number }` (Task 2)
  - `GET /api/transactions/stream` SSE (Task 2)
  - `GET /api/transactions?type=pending|all|deposit|withdrawal&search=X&status=Y&page=N` (Task 3)
- Produces: fully functional Transactions page with Pending tab (default), search, summary card, row highlight, auto-refresh

- [ ] **Step 1: Add highlight animation to globals.css**

Open `erp/src/app/globals.css`. Append at the very end of the file (after the closing `}` of the last block):

```css

/* Transaction row highlight — fades from yellow to transparent over 2.5s.
   Applied only to rows arriving via SSE-triggered refresh (realtimeRefresh=true). */
@keyframes highlight-fade {
  0%   { background-color: rgb(254 240 138); }
  100% { background-color: transparent; }
}
.animate-highlight {
  animation: highlight-fade 2.5s ease-out forwards;
}
```

- [ ] **Step 2: Verify CSS compiles (no build errors)**

```bash
cd erp && npx next build --no-lint 2>&1 | grep -i "error\|warn" | grep -v "^warn.*fast refresh" | head -10
```

Expected: no CSS errors. (Or simply run `npm run dev` and confirm the dev server starts.)

- [ ] **Step 3: Rewrite `erp/src/app/(dashboard)/transactions/page.tsx`**

Replace the entire file content with:

```tsx
'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import MemberLink from '@/components/MemberLink';
import type { PaginatedResponse } from '@/lib/types';

interface TransactionRow {
  id: number;
  type: 'deposit' | 'withdrawal';
  user_id: number;
  first_name: string;
  phone: string;
  public_id: string | null;
  amount: string;
  status: string;
  reject_reason: string | null;
  processing_by: number | null;
  processing_by_name: string | null;
  processing_at: string | null;
  created_at: string;
}

interface PendingCounts {
  count: number;
  deposit_count: number;
  withdrawal_count: number;
}

type TabType = 'pending' | 'all' | 'deposit' | 'withdrawal';

const STATUS_CLASS: Record<string, string> = {
  APPROVED:   'bg-green-100 text-green-800 border-green-200',
  PAID:       'bg-green-100 text-green-800 border-green-200',
  PENDING:    'bg-yellow-100 text-yellow-800 border-yellow-200',
  PROCESSING: 'bg-blue-100 text-blue-800 border-blue-200',
  REJECTED:   'bg-red-100 text-red-800 border-red-200',
};

const TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  deposit:    { label: '🟢 Deposit',  className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  withdrawal: { label: '🟠 Withdraw', className: 'bg-orange-50  text-orange-700  border border-orange-200' },
};

export default function TransactionsPage() {
  const [data,            setData]            = useState<PaginatedResponse<TransactionRow> | null>(null);
  const [tab,             setTab]             = useState<TabType>('pending');
  const [status,          setStatus]          = useState('');
  const [search,          setSearch]          = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page,            setPage]            = useState(1);
  const [loading,         setLoading]         = useState(true);
  const [pendingCounts,   setPendingCounts]   = useState<PendingCounts>({
    count: 0, deposit_count: 0, withdrawal_count: 0,
  });
  const [highlightedIds,  setHighlightedIds]  = useState<Set<string>>(new Set());

  const prevIdsRef     = useRef<Set<string>>(new Set());
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadRef        = useRef<(rt?: boolean) => void>(() => {});

  const fetchCounts = useCallback(() => {
    fetch('/api/transactions/pending-count')
      .then(r => r.json())
      .then((d: PendingCounts) => setPendingCounts(d))
      .catch(() => {});
  }, []);

  const load = useCallback((realtimeRefresh = false) => {
    setLoading(true);
    const p = new URLSearchParams({ page: page.toString() });
    if (tab !== 'all') p.set('type', tab);
    if (status && tab !== 'pending') p.set('status', status);
    if (debouncedSearch) p.set('search', debouncedSearch);

    fetch(`/api/transactions?${p}`)
      .then(r => r.json())
      .then((d: PaginatedResponse<TransactionRow>) => {
        const incoming = d.data ?? [];
        const incomingKeys = new Set(incoming.map(r => `${r.type}-${r.id}`));

        if (realtimeRefresh) {
          // Highlight only rows whose composite key was absent from previous render
          const newKeys = new Set([...incomingKeys].filter(k => !prevIdsRef.current.has(k)));
          if (newKeys.size > 0) {
            if (highlightTimer.current) clearTimeout(highlightTimer.current);
            setHighlightedIds(newKeys);
            highlightTimer.current = setTimeout(() => setHighlightedIds(new Set()), 2500);
          }
          prevIdsRef.current = incomingKeys;
        } else {
          // User-driven navigation: silently update prevIds, never highlight
          prevIdsRef.current = incomingKeys;
          setHighlightedIds(new Set());
        }

        setData(d);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [tab, status, debouncedSearch, page]);

  // Keep loadRef pointing at the latest load closure (for SSE handler)
  useEffect(() => { loadRef.current = load; }, [load]);

  // Trigger load on any filter change (user-driven, never highlights)
  useEffect(() => { load(false); }, [load]);

  // Initial pending count load
  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  // Search debounce: 500ms; changing search resets to page 1
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 500);
    return () => clearTimeout(t);
  }, [search]);

  // SSE: realtime auto-refresh — throttled to 250ms
  useEffect(() => {
    const es = new EventSource('/api/transactions/stream');
    es.onmessage = () => {
      if (refreshTimer.current) return;  // already scheduled in this window
      refreshTimer.current = setTimeout(() => {
        refreshTimer.current = null;
        fetchCounts();          // refresh summary card + badge source of truth
        loadRef.current(true);  // refresh list with highlight detection
      }, 250);
    };
    return () => {
      es.close();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    };
  }, [fetchCounts]);

  function switchTab(t: TabType) {
    setTab(t);
    setStatus('');
    setPage(1);
    // load() fires via useEffect([load]) after state update
  }

  const rows  = data?.data ?? [];
  const total = data?.total ?? 0;

  const pendingLabel = pendingCounts.count > 0
    ? `Pending (${pendingCounts.count})`
    : 'Pending';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Transactions</h1>
      </div>

      {/* Tabs: Pending (default) | All | Deposits | Withdrawals */}
      <div className="flex gap-1 border-b">
        {(['pending', 'all', 'deposit', 'withdrawal'] as const).map(t => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'pending'    ? pendingLabel
             : t === 'all'      ? 'All'
             : t === 'deposit'  ? 'Deposits'
             :                    'Withdrawals'}
          </button>
        ))}
      </div>

      {/* Pending Summary Card — visible only on Pending tab */}
      {tab === 'pending' && (
        <div className="rounded-lg border bg-white p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Pending Summary
          </p>
          <div className="flex gap-8">
            <div>
              <p className="text-xs text-gray-400">Deposit</p>
              <p className="text-2xl font-bold text-emerald-600">{pendingCounts.deposit_count}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Withdraw</p>
              <p className="text-2xl font-bold text-orange-500">{pendingCounts.withdrawal_count}</p>
            </div>
            <div className="border-l pl-8">
              <p className="text-xs text-gray-400">Total</p>
              <p className="text-2xl font-bold text-gray-800">{pendingCounts.count}</p>
            </div>
          </div>
        </div>
      )}

      {/* Search + Status filter row */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Search by Member ID, username, phone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-72"
        />
        {tab !== 'pending' && (
          <Select
            value={status || 'ALL'}
            onValueChange={v => { setStatus(v === 'ALL' ? '' : v); setPage(1); }}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Status</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="PROCESSING">Processing</SelectItem>
              <SelectItem value="approved_paid">Approved / Paid</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
            </SelectContent>
          </Select>
        )}
        <span className="text-sm text-gray-400">Total: {total}</span>
      </div>

      {/* Table */}
      <div className="rounded-md border bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              {['ID', 'Type', 'Member', 'Amount', 'Status', 'Time', 'Actions'].map(h => (
                <th key={h} className="px-3 py-3 text-left font-medium text-gray-500 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                  {tab === 'pending' ? 'No pending transactions.' : 'No transactions found.'}
                </td>
              </tr>
            ) : rows.map(row => {
              const key        = `${row.type}-${row.id}`;
              const typeConfig = TYPE_CONFIG[row.type] ?? { label: row.type, className: '' };
              return (
                <tr
                  key={key}
                  className={`border-b last:border-0 hover:bg-gray-50 ${
                    highlightedIds.has(key) ? 'animate-highlight' : ''
                  }`}
                >
                  <td className="px-3 py-3 font-mono text-xs text-gray-500">{row.id}</td>

                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${typeConfig.className}`}>
                      {typeConfig.label}
                    </span>
                  </td>

                  <td className="px-3 py-3">
                    <MemberLink userId={row.user_id} name={row.first_name} />
                    {row.public_id && (
                      <div className="font-mono text-xs text-blue-500">{row.public_id}</div>
                    )}
                    <div className="text-xs text-gray-400">{row.phone}</div>
                  </td>

                  <td className="px-3 py-3 whitespace-nowrap font-medium">
                    RM {parseFloat(row.amount).toFixed(2)}
                  </td>

                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_CLASS[row.status] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                      {row.status}
                    </span>
                    {row.status === 'PROCESSING' && row.processing_by_name && (
                      <div className="text-xs text-blue-600 mt-0.5">by {row.processing_by_name}</div>
                    )}
                  </td>

                  <td className="px-3 py-3 text-xs text-gray-400 whitespace-nowrap">
                    {new Date(row.created_at).toLocaleString()}
                  </td>

                  <td className="px-3 py-3">
                    {(row.status === 'PENDING' || row.status === 'PROCESSING') ? (
                      <Link href={`/transactions/${row.type}/${row.id}`}>
                        <Button size="sm" variant="outline" className="text-xs h-7">Handle</Button>
                      </Link>
                    ) : (
                      <Link href={`/transactions/${row.type}/${row.id}`}>
                        <Button size="sm" variant="ghost" className="text-xs h-7 text-gray-400">View</Button>
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-end gap-2 text-sm">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page === 1}
        >
          Previous
        </Button>
        <span className="px-2 py-1 text-gray-500">Page {page}</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPage(p => p + 1)}
          disabled={page * 20 >= total}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd erp && npx tsc --noEmit 2>&1 | grep -E "transactions/page|error TS" | head -20
```

Expected: no errors from transactions/page.tsx.

- [ ] **Step 5: Run full test suite**

```bash
cd erp && npx vitest run 2>&1 | tail -10
```

Expected: all tests pass (including Task 2 and 3 tests).

- [ ] **Step 6: Manual browser verification checklist**

Start dev server: `cd erp && npm run dev`

**Single source of truth:**
- [ ] Open Transactions page. Note sidebar badge N, browser title `(N) Tesla88 ERP`, Pending tab label `Pending (N)`, Summary Card Total N — all four show the same number
- [ ] Insert a PENDING deposit via DB → all four locations increment simultaneously

**Notification sound:**
- [ ] Insert two PENDING deposits within 200ms (e.g., via a script) → sound plays exactly once (not twice)
- [ ] Approve a deposit → count decreases, no sound

**Pending tab:**
- [ ] Default tab on page load is Pending
- [ ] Pending tab shows only PENDING status rows (no APPROVED/REJECTED)
- [ ] Rows sorted newest first
- [ ] Status filter dropdown is hidden on Pending tab
- [ ] Empty state "No pending transactions." shown when queue is empty

**Search:**
- [ ] Type a member's first name → results filter after 500ms (not immediately per keystroke)
- [ ] Type a phone number (partial) → matches deposits and withdrawals with that phone
- [ ] Type a public_id (e.g., SS1000001) → matches correctly
- [ ] Type a user_id number → matches correctly
- [ ] Search + Pending tab works: shows only PENDING matching rows
- [ ] Search + status filter works on All/Deposits/Withdrawals tabs
- [ ] Changing search resets to page 1
- [ ] Clearing search restores full list

**Auto-refresh + highlight:**
- [ ] While on Pending tab, insert a new PENDING deposit → row appears at top within 250ms, highlighted yellow, fades after 2.5s
- [ ] Existing rows do NOT re-highlight
- [ ] Switch tabs while highlighted row exists → highlighting clears, does not reappear on switch back
- [ ] Paginate to page 2, then new row arrives on page 1 → does NOT jump to page 1, does NOT reset page

**Regression:**
- [ ] Navigate to `/transactions/deposit/15` (or any deposit detail) → still works
- [ ] Approve a deposit from its detail page → count decreases, sidebar updates
- [ ] LiveChat badge still works separately
- [ ] LiveChat sound still works separately
- [ ] Receipt upload still works on website

- [ ] **Step 7: Commit**

```bash
git add \
  erp/src/app/globals.css \
  "erp/src/app/(dashboard)/transactions/page.tsx"
git commit -m "feat(transactions): Pending queue, search, summary card, row highlight

- Default tab: Pending (PENDING deposits + withdrawals, newest first)
- Pending Summary Card: realtime deposit/withdraw/total breakdown
- Search: 500ms debounce, ILIKE on name/phone/public_id/user_id
- Auto-refresh: SSE-driven (250ms throttle), preserves tab/search/page
- Row highlight: 2.5s yellow fade, SSE-only (never on user navigation)
- Empty state: 'No pending transactions.' on Pending tab
- Type indicators: 🟢 Deposit (emerald), 🟠 Withdraw (orange)
- Status filter hidden on Pending tab (locked to PENDING)
- globals.css: @keyframes highlight-fade + .animate-highlight"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| pg_notify trigger on both tables | Task 1 |
| `transaction_pending_count` channel | Task 1 |
| `GET /api/transactions/pending-count` → breakdown | Task 2 |
| `GET /api/transactions/stream` SSE | Task 2 |
| `type=pending` in transactions API | Task 3 |
| `search` ILIKE in transactions API | Task 3 |
| Sidebar: pendingCount replaces depositsUnread | Task 4 |
| Sidebar: throttled SSE handler (250ms) | Task 4 |
| Sidebar: browser title `(N) Tesla88 ERP` | Task 4 |
| Sidebar: sound at most once per window | Task 4 |
| Pending tab as default | Task 5 |
| Pending Summary Card | Task 5 |
| Search bar 500ms debounce | Task 5 |
| Auto-refresh (SSE-triggered) | Task 5 |
| Row highlight 2.5s, SSE-only | Task 5 |
| `realtimeRefresh` flag (no highlight on user nav) | Task 5 |
| Empty state "No pending transactions." | Task 5 |
| Type indicators 🟢/🟠 | Task 5 |
| All four locations same source of truth | Tasks 2+4+5 |
| No regression to existing routes/components | All tasks |

**Placeholder scan:** None found — every step has complete code.

**Type consistency:**
- `PendingCounts` interface defined in Task 5, matches `{ count, deposit_count, withdrawal_count }` returned by Task 2 route
- `TabType = 'pending' | 'all' | 'deposit' | 'withdrawal'` consistent throughout Task 5
- `loadRef.current(true)` in SSE handler, `load(false)` for user navigation — consistent with `realtimeRefresh = false` default
- `refreshTimer` in sidebar (Task 4) and page (Task 5) are independent refs — no collision
