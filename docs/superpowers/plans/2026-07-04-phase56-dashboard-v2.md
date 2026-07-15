# Phase 5.6 — Dashboard 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing ERP dashboard with a professional executive command center — the first screen after login — featuring 6 widget sections (Financial, Members, Operations, Marketing, Support, System), period-switchable charts, and a live system health panel.

**Architecture:** All data is READ-ONLY. Extend the existing `/api/dashboard` route with new aggregate queries (no new business logic), add a `/api/dashboard/health` endpoint for system health checks, and replace the existing 190-line page with a new 6-section layout. Reuse existing `BarChart`, `LineChart`, `StatsCard`, and `Card` UI components. No external charting library needed.

**Tech Stack:** Next.js 15 App Router, PostgreSQL (pool.connect pattern), React 18 ('use client'), TailwindCSS, Vitest, custom SVG BarChart/LineChart, shadcn/ui Card components.

## Global Constraints

- READ ONLY — do not add write operations, mutations, or side effects to this feature
- Do not duplicate existing business logic — use existing SQL patterns from `/api/dashboard/route.ts`
- Dashboard API uses `pool.connect()` → `client.query()` → `client.release()` pattern (NOT `pool.query()`)
- All new queries go inside the existing `Promise.all([...])` in `route.ts`
- Chart data: always return all three chart datasets (7-day, 30-day, 6-month) — page picks which to render
- Chart components already exist: `BarChart` (`@/components/charts/BarChart`), `LineChart` (`@/components/charts/LineChart`)
- StatsCard component: `@/components/stats-card` — accepts `{ title, value, description }`
- UI Card components: `@/components/ui/card` — CardHeader, CardTitle, CardContent
- BOT_RELAY_URL from `process.env.BOT_RELAY_URL ?? 'http://localhost:8090'`
- Health endpoint: relay 404 = relay is UP (endpoint just not implemented); relay network error = relay DOWN
- VIP definition: user has tag named 'VIP' in `user_tag_assignments JOIN customer_tags`
- Online members: `last_seen_at >= NOW() - INTERVAL '5 minutes'`
- Waiting customers: `support_sessions WHERE status = 'OPEN'` (OPEN = not yet accepted by any agent)
- Open live chats: `support_sessions WHERE status IN ('OPEN', 'ACTIVE')`
- Avg response time: `AVG(EXTRACT(EPOCH FROM (accepted_at - created_at)))` for sessions with `accepted_at IS NOT NULL AND created_at >= CURRENT_DATE`
- Timezone for date grouping: `AT TIME ZONE 'UTC+8'` (follow existing pattern)
- Auto-refresh: page re-fetches every 60 seconds
- No new charting library installation — custom SVG only
- Tests in `erp/tests/` directory; TypeScript `erp/tsconfig.json`
- Running all tests: `cd erp && npx vitest run --reporter=verbose 2>&1 | tail -30`
- TypeScript check: `cd erp && npx tsc --noEmit 2>&1 | head -20`
- DO NOT start: Website, SMS OTP, Email OTP, WhatsApp OTP, Billing, Public API, Multi-Tenant

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `erp/src/lib/types.ts` | Modify | Extend `DashboardStats` with 11 new fields |
| `erp/src/app/api/dashboard/route.ts` | Modify | Add 10 new aggregate queries + 30-day chart |
| `erp/src/app/api/dashboard/health/route.ts` | Create | System health endpoint (DB + relay + storage) |
| `erp/src/app/(dashboard)/page.tsx` | Modify | Replace with 6-section executive layout |
| `erp/tests/dashboard-api.test.ts` | Create | Tests for new API fields |
| `erp/tests/dashboard-health.test.ts` | Create | Tests for health endpoint |

---

### Task 1: Extend Dashboard Stats API + Types

**Files:**
- Modify: `erp/src/lib/types.ts` (DashboardStats interface)
- Modify: `erp/src/app/api/dashboard/route.ts`
- Create: `erp/tests/dashboard-api.test.ts`

**Interfaces:**
- Consumes: existing `pool` from `@/lib/db`; existing tables: `users`, `deposit_requests`, `withdrawal_requests`, `support_sessions`, `broadcasts`, `user_tag_assignments`, `customer_tags`
- Produces (new fields added to `DashboardStats`):
  ```typescript
  vipMembers: number;
  onlineMembers: number;
  openLiveChats: number;
  waitingCustomers: number;
  broadcastSentToday: number;
  weeklyDepositAmount: number;
  thisMonthDepositAmount: number;
  avgResponseTimeSeconds: number;
  chatSessionsToday: number;
  csPerformance: { agent: string; sessions: number }[];
  thirtyDayChart: { date: string; deposit: number; withdrawal: number }[];
  ```

- [ ] **Step 1: Extend DashboardStats in `erp/src/lib/types.ts`**

Find the `DashboardStats` interface (around line 76). Add these fields after `monthlyRevenue`:

```typescript
  // Dashboard 2.0 — new fields
  vipMembers: number;
  onlineMembers: number;
  openLiveChats: number;
  waitingCustomers: number;
  broadcastSentToday: number;
  weeklyDepositAmount: number;
  thisMonthDepositAmount: number;
  avgResponseTimeSeconds: number;
  chatSessionsToday: number;
  csPerformance: { agent: string; sessions: number }[];
  thirtyDayChart: { date: string; deposit: number; withdrawal: number }[];
```

- [ ] **Step 2: Write failing test**

Create `erp/tests/dashboard-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  verifyJWT: vi.fn().mockResolvedValue({ sub: 1, username: 'admin1', role: 'ADMIN' }),
  COOKIE_NAME: 'token',
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => ({ value: 'tok' }) }),
}));

const mockQuery = vi.fn();
vi.mock('@/lib/db', () => ({
  default: {
    connect: vi.fn(),
  },
}));

import pool from '@/lib/db';
import { GET } from '@/app/api/dashboard/route';

// Returns rows appropriate for each query call position.
// The dashboard route runs queries in a fixed order via Promise.all.
// Any query returning count/amount gets a row shape; chart queries get empty arrays.
function makeCountRow(count = 0) { return { rows: [{ count, amount: 0, seconds: 0, files: 0, bytes: 0 }] }; }
function makeChartRows() { return { rows: [] }; }

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(pool.connect).mockResolvedValue({
    query: mockQuery,
    release: vi.fn(),
  } as never);
});

describe('GET /api/dashboard', () => {
  it('returns 200 with all required DashboardStats fields', async () => {
    // Feed one default response per query (30 queries total after extension)
    mockQuery.mockResolvedValue(makeCountRow());

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, unknown>;

    // Existing fields
    expect(typeof data.totalMembers).toBe('number');
    expect(typeof data.activeMembers).toBe('number');
    expect(typeof data.pendingDeposits).toBe('number');
    expect(typeof data.pendingWithdrawals).toBe('number');
    expect(typeof data.todayDepositAmount).toBe('number');
    expect(typeof data.todayWithdrawalAmount).toBe('number');
    expect(typeof data.todayProfit).toBe('number');
    expect(typeof data.newMembersToday).toBe('number');
    expect(typeof data.activeMembersToday).toBe('number');
    expect(Array.isArray(data.depositChart)).toBe(true);
    expect(Array.isArray(data.withdrawalChart)).toBe(true);
    expect(Array.isArray(data.monthlyRevenue)).toBe(true);

    // New Dashboard 2.0 fields
    expect(typeof data.vipMembers).toBe('number');
    expect(typeof data.onlineMembers).toBe('number');
    expect(typeof data.openLiveChats).toBe('number');
    expect(typeof data.waitingCustomers).toBe('number');
    expect(typeof data.broadcastSentToday).toBe('number');
    expect(typeof data.weeklyDepositAmount).toBe('number');
    expect(typeof data.thisMonthDepositAmount).toBe('number');
    expect(typeof data.avgResponseTimeSeconds).toBe('number');
    expect(typeof data.chatSessionsToday).toBe('number');
    expect(Array.isArray(data.csPerformance)).toBe(true);
    expect(Array.isArray(data.thirtyDayChart)).toBe(true);
  });

  it('returns profit = today deposit - withdrawal - bonus', async () => {
    // todayDep=1000, todayWith=300, todayBonus=100 → profit=600
    let callIdx = 0;
    mockQuery.mockImplementation(() => {
      callIdx++;
      // Based on query order in Promise.all:
      // [0]=totalMembers [1]=activeMembers [2]=totalDeposits [3]=totalWithdrawals
      // [4]=pendingDeposits [5]=pendingWithdrawals
      // [6]=todayDep [7]=todayWith
      // [8]=depChart [9]=withChart [10]=topPromo [11]=topDep [12]=todayBonus
      // [13]=newMembers [14]=activeToday [15]=onlineStaff [16]=topProviders
      // [17]=monthlyDep [18]=monthlyWith
      // [19]=vipCount [20]=onlineCount [21]=openChats [22]=waitingChats
      // [23]=broadcastToday [24]=weeklyDep [25]=thisMonthDep [26]=avgResponseTime
      // [27]=chatSessionsToday [28]=csPerf [29]=thirtyDayDep [30]=thirtyDayWith
      if (callIdx === 7) return Promise.resolve({ rows: [{ amount: 1000, count: 3 }] }); // todayDep
      if (callIdx === 8) return Promise.resolve({ rows: [{ amount: 300, count: 1 }] });  // todayWith
      if (callIdx === 13) return Promise.resolve({ rows: [{ amount: 100 }] });             // todayBonus
      return Promise.resolve({ rows: [{ count: 0, amount: 0, seconds: 0 }] });
    });

    const res = await GET();
    const data = await res.json() as { todayProfit: number };
    expect(data.todayProfit).toBe(600); // 1000 - 300 - 100
  });

  it('includes csPerformance array from query', async () => {
    let callIdx = 0;
    mockQuery.mockImplementation(() => {
      callIdx++;
      if (callIdx === 29) { // csPerf query position
        return Promise.resolve({ rows: [{ agent: 'alice', sessions: 5 }, { agent: 'bob', sessions: 3 }] });
      }
      return Promise.resolve({ rows: [{ count: 0, amount: 0, seconds: 0 }] });
    });

    const res = await GET();
    const data = await res.json() as { csPerformance: { agent: string; sessions: number }[] };
    expect(data.csPerformance).toEqual([{ agent: 'alice', sessions: 5 }, { agent: 'bob', sessions: 3 }]);
  });

  it('handles database error gracefully with 500', async () => {
    vi.mocked(pool.connect).mockRejectedValueOnce(new Error('DB down'));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd erp && npx vitest run tests/dashboard-api.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — new fields not present in response (or import errors).

- [ ] **Step 4: Extend `erp/src/app/api/dashboard/route.ts`**

Add the error handling wrapper and new queries. The full replacement:

```typescript
import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import type { DashboardStats } from '@/lib/types';

export async function GET() {
  const client = await pool.connect();
  try {
    const [
      tm, am, td, tw, pd, pw,
      todayDep, todayWith,
      depChart, withChart,
      topPromo, topDep,
      todayBonus, newMembers, activeToday, onlineStaff,
      topProviders, monthlyDep, monthlyWith,
      // Dashboard 2.0 — new queries
      vipCount, onlineCount, openChats, waitingChats,
      broadcastToday, weeklyDep, thisMonthDep,
      avgResponseTime, chatSessionsToday, csPerf,
      thirtyDayDep, thirtyDayWith,
    ] = await Promise.all([
      client.query<{ count: number }>('SELECT COUNT(*)::int AS count FROM users'),
      client.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM users WHERE status = 'ACTIVE'"),
      client.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM deposit_requests WHERE status = 'APPROVED'"),
      client.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM withdrawal_requests WHERE status = 'PAID'"),
      client.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM deposit_requests WHERE status = 'PENDING'"),
      client.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM withdrawal_requests WHERE status = 'PENDING'"),

      // Today's deposits (APPROVED)
      client.query<{ amount: number; count: number }>(
        `SELECT COALESCE(SUM(deposit_amount),0)::float AS amount, COUNT(*)::int AS count
         FROM deposit_requests
         WHERE status = 'APPROVED' AND reviewed_at >= CURRENT_DATE`
      ),
      // Today's withdrawals (PAID)
      client.query<{ amount: number; count: number }>(
        `SELECT COALESCE(SUM(withdraw_amount),0)::float AS amount, COUNT(*)::int AS count
         FROM withdrawal_requests
         WHERE status = 'PAID' AND reviewed_at >= CURRENT_DATE`
      ),

      // 7-day deposit chart
      client.query<{ date: string; amount: number; count: number }>(
        `SELECT TO_CHAR(reviewed_at AT TIME ZONE 'UTC+8', 'MM-DD') AS date,
                COALESCE(SUM(deposit_amount),0)::float AS amount,
                COUNT(*)::int AS count
         FROM deposit_requests
         WHERE status = 'APPROVED'
           AND reviewed_at >= NOW() - INTERVAL '7 days'
         GROUP BY TO_CHAR(reviewed_at AT TIME ZONE 'UTC+8', 'MM-DD')
         ORDER BY MIN(reviewed_at)`
      ),
      // 7-day withdrawal chart
      client.query<{ date: string; amount: number; count: number }>(
        `SELECT TO_CHAR(reviewed_at AT TIME ZONE 'UTC+8', 'MM-DD') AS date,
                COALESCE(SUM(withdraw_amount),0)::float AS amount,
                COUNT(*)::int AS count
         FROM withdrawal_requests
         WHERE status = 'PAID'
           AND reviewed_at >= NOW() - INTERVAL '7 days'
         GROUP BY TO_CHAR(reviewed_at AT TIME ZONE 'UTC+8', 'MM-DD')
         ORDER BY MIN(reviewed_at)`
      ),

      // Top 10 promotions by claim count (30 days)
      client.query<{ name: string; claim_count: number }>(
        `SELECT p.name, COUNT(bc.id)::int AS claim_count
         FROM bonus_claims bc
         JOIN promotions p ON p.id = bc.promotion_id
         WHERE bc.claimed_at >= NOW() - INTERVAL '30 days'
         GROUP BY p.id, p.name
         ORDER BY claim_count DESC
         LIMIT 10`
      ),
      // Top 10 depositors by total amount
      client.query<{ first_name: string; total: number }>(
        `SELECT u.first_name, COALESCE(SUM(dr.deposit_amount),0)::float AS total
         FROM deposit_requests dr
         JOIN users u ON u.id = dr.user_id
         WHERE dr.status = 'APPROVED'
         GROUP BY u.id, u.first_name
         ORDER BY total DESC
         LIMIT 10`
      ),

      // Today's bonus
      client.query<{ amount: number }>(
        `SELECT COALESCE(SUM(bonus_amount),0)::float AS amount
         FROM bonus_claims
         WHERE claimed_at >= CURRENT_DATE AND status != 'CANCELLED'`
      ),

      // New members today
      client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM users WHERE created_at >= CURRENT_DATE`
      ),
      // Active members today
      client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM users WHERE last_seen_at >= CURRENT_DATE`
      ),
      // Online support staff
      client.query<{ count: number }>(
        `SELECT COUNT(DISTINCT admin_id)::int AS count FROM audit_logs WHERE created_at >= CURRENT_DATE`
      ),

      // Top 10 game providers (30 days)
      client.query<{ provider: string; deposit_count: number; deposit_amount: number }>(
        `SELECT provider,
                COUNT(*)::int AS deposit_count,
                COALESCE(SUM(deposit_amount),0)::float AS deposit_amount
         FROM deposit_requests
         WHERE status = 'APPROVED' AND reviewed_at >= NOW() - INTERVAL '30 days'
         GROUP BY provider ORDER BY deposit_count DESC LIMIT 10`
      ),
      // Monthly deposits: last 6 months
      client.query<{ month: string; deposit: number }>(
        `SELECT TO_CHAR(DATE_TRUNC('month', reviewed_at), 'YYYY-MM') AS month,
                COALESCE(SUM(deposit_amount),0)::float AS deposit
         FROM deposit_requests
         WHERE status = 'APPROVED' AND reviewed_at >= NOW() - INTERVAL '6 months'
         GROUP BY DATE_TRUNC('month', reviewed_at)
         ORDER BY DATE_TRUNC('month', reviewed_at)`
      ),
      // Monthly withdrawals: last 6 months
      client.query<{ month: string; withdrawal: number }>(
        `SELECT TO_CHAR(DATE_TRUNC('month', reviewed_at), 'YYYY-MM') AS month,
                COALESCE(SUM(withdraw_amount),0)::float AS withdrawal
         FROM withdrawal_requests
         WHERE status = 'PAID' AND reviewed_at >= NOW() - INTERVAL '6 months'
         GROUP BY DATE_TRUNC('month', reviewed_at)
         ORDER BY DATE_TRUNC('month', reviewed_at)`
      ),

      // ── Dashboard 2.0 new queries ──────────────────────────────────────

      // VIP members (have VIP tag)
      client.query<{ count: number }>(
        `SELECT COUNT(DISTINCT uta.user_id)::int AS count
         FROM user_tag_assignments uta
         JOIN customer_tags ct ON ct.id = uta.tag_id AND ct.name = 'VIP'`
      ),
      // Online members (seen in last 5 minutes)
      client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM users
         WHERE last_seen_at >= NOW() - INTERVAL '5 minutes'`
      ),
      // Open live chats (OPEN + ACTIVE sessions)
      client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM support_sessions
         WHERE status IN ('OPEN', 'ACTIVE')`
      ),
      // Waiting customers (OPEN, awaiting agent)
      client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM support_sessions
         WHERE status = 'OPEN'`
      ),
      // Broadcasts sent today
      client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM broadcasts
         WHERE status = 'SENT' AND sent_at >= CURRENT_DATE`
      ),
      // Weekly deposit total (last 7 days)
      client.query<{ amount: number }>(
        `SELECT COALESCE(SUM(deposit_amount),0)::float AS amount
         FROM deposit_requests
         WHERE status = 'APPROVED' AND reviewed_at >= NOW() - INTERVAL '7 days'`
      ),
      // This month's total deposit
      client.query<{ amount: number }>(
        `SELECT COALESCE(SUM(deposit_amount),0)::float AS amount
         FROM deposit_requests
         WHERE status = 'APPROVED'
           AND DATE_TRUNC('month', reviewed_at) = DATE_TRUNC('month', NOW())`
      ),
      // Average response time today (seconds)
      client.query<{ seconds: number }>(
        `SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (accepted_at - created_at))),0)::float AS seconds
         FROM support_sessions
         WHERE accepted_at IS NOT NULL AND created_at >= CURRENT_DATE`
      ),
      // Chat sessions opened today
      client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM support_sessions
         WHERE created_at >= CURRENT_DATE`
      ),
      // CS performance — sessions per agent today (top 10)
      client.query<{ agent: string; sessions: number }>(
        `SELECT COALESCE(assigned_to_username, agent_username, 'Unassigned') AS agent,
                COUNT(*)::int AS sessions
         FROM support_sessions
         WHERE created_at >= CURRENT_DATE
           AND (assigned_to_username IS NOT NULL OR agent_username IS NOT NULL)
         GROUP BY COALESCE(assigned_to_username, agent_username, 'Unassigned')
         ORDER BY sessions DESC
         LIMIT 10`
      ),
      // 30-day deposit chart (daily)
      client.query<{ date: string; deposit: number }>(
        `SELECT TO_CHAR(reviewed_at AT TIME ZONE 'UTC+8', 'MM-DD') AS date,
                COALESCE(SUM(deposit_amount),0)::float AS deposit
         FROM deposit_requests
         WHERE status = 'APPROVED'
           AND reviewed_at >= NOW() - INTERVAL '30 days'
         GROUP BY TO_CHAR(reviewed_at AT TIME ZONE 'UTC+8', 'MM-DD')
         ORDER BY MIN(reviewed_at)`
      ),
      // 30-day withdrawal chart (daily)
      client.query<{ date: string; withdrawal: number }>(
        `SELECT TO_CHAR(reviewed_at AT TIME ZONE 'UTC+8', 'MM-DD') AS date,
                COALESCE(SUM(withdraw_amount),0)::float AS withdrawal
         FROM withdrawal_requests
         WHERE status = 'PAID'
           AND reviewed_at >= NOW() - INTERVAL '30 days'
         GROUP BY TO_CHAR(reviewed_at AT TIME ZONE 'UTC+8', 'MM-DD')
         ORDER BY MIN(reviewed_at)`
      ),
    ]);

    // Merge monthly revenue
    const monthlyMap = new Map<string, { deposit: number; withdrawal: number }>();
    for (const row of monthlyDep.rows) {
      monthlyMap.set(row.month, { deposit: row.deposit, withdrawal: 0 });
    }
    for (const row of monthlyWith.rows) {
      const existing = monthlyMap.get(row.month);
      if (existing) existing.withdrawal = row.withdrawal;
      else monthlyMap.set(row.month, { deposit: 0, withdrawal: row.withdrawal });
    }
    const monthlyRevenue = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { deposit, withdrawal }]) => ({ month, deposit, withdrawal, net: deposit - withdrawal }));

    // Merge 30-day chart
    const thirtyDayMap = new Map<string, { deposit: number; withdrawal: number }>();
    for (const row of thirtyDayDep.rows) {
      thirtyDayMap.set(row.date, { deposit: row.deposit, withdrawal: 0 });
    }
    for (const row of thirtyDayWith.rows) {
      const existing = thirtyDayMap.get(row.date);
      if (existing) existing.withdrawal = row.withdrawal;
      else thirtyDayMap.set(row.date, { deposit: 0, withdrawal: row.withdrawal });
    }
    const thirtyDayChart = Array.from(thirtyDayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { deposit, withdrawal }]) => ({ date, deposit, withdrawal }));

    const todayDepositAmount    = todayDep.rows[0].amount;
    const todayWithdrawalAmount = todayWith.rows[0].amount;
    const todayBonusAmount      = todayBonus.rows[0].amount;

    const stats: DashboardStats = {
      totalMembers:           tm.rows[0].count,
      activeMembers:          am.rows[0].count,
      totalDeposits:          td.rows[0].count,
      totalWithdrawals:       tw.rows[0].count,
      pendingDeposits:        pd.rows[0].count,
      pendingWithdrawals:     pw.rows[0].count,
      todayDepositAmount,
      todayDepositCount:      todayDep.rows[0].count,
      todayWithdrawalAmount,
      todayWithdrawalCount:   todayWith.rows[0].count,
      depositChart:           depChart.rows,
      withdrawalChart:        withChart.rows,
      topPromotions:          topPromo.rows,
      topDepositors:          topDep.rows,
      todayBonusAmount,
      todayNetDeposit:        todayDepositAmount - todayWithdrawalAmount,
      todayProfit:            todayDepositAmount - todayWithdrawalAmount - todayBonusAmount,
      newMembersToday:        newMembers.rows[0].count,
      activeMembersToday:     activeToday.rows[0].count,
      onlineSupportStaff:     onlineStaff.rows[0].count,
      topGameProviders:       topProviders.rows,
      monthlyRevenue,
      // Dashboard 2.0
      vipMembers:             vipCount.rows[0].count,
      onlineMembers:          onlineCount.rows[0].count,
      openLiveChats:          openChats.rows[0].count,
      waitingCustomers:       waitingChats.rows[0].count,
      broadcastSentToday:     broadcastToday.rows[0].count,
      weeklyDepositAmount:    weeklyDep.rows[0].amount,
      thisMonthDepositAmount: thisMonthDep.rows[0].amount,
      avgResponseTimeSeconds: avgResponseTime.rows[0].seconds,
      chatSessionsToday:      chatSessionsToday.rows[0].count,
      csPerformance:          csPerf.rows,
      thirtyDayChart,
    };

    return NextResponse.json(stats);
  } catch {
    return NextResponse.json({ error: 'Failed to load dashboard stats' }, { status: 500 });
  } finally {
    client.release();
  }
}
```

- [ ] **Step 5: Run test — expect pass**

```bash
cd erp && npx vitest run tests/dashboard-api.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: All tests PASS.

- [ ] **Step 6: Run full suite — no regressions**

```bash
cd erp && npx vitest run --reporter=verbose 2>&1 | tail -10
```

- [ ] **Step 7: TypeScript check**

```bash
cd erp && npx tsc --noEmit 2>&1 | head -20
```

Expected: Zero errors. Fix any errors before committing.

- [ ] **Step 8: Commit**

```bash
git add erp/src/lib/types.ts erp/src/app/api/dashboard/route.ts erp/tests/dashboard-api.test.ts
git commit -m "feat(dashboard): extend dashboard API with 11 new fields — VIP, online, chats, broadcasts, charts"
```

---

### Task 2: System Health Endpoint

**Files:**
- Create: `erp/src/app/api/dashboard/health/route.ts`
- Create: `erp/tests/dashboard-health.test.ts`

**Interfaces:**
- Consumes: `pool` from `@/lib/db` (uses `pool.query` — not client pattern, since this is a quick ping); `fetch` for relay check
- Produces:
  ```typescript
  // Response shape:
  {
    database: { ok: boolean; latency_ms: number };
    relay: { ok: boolean; latency_ms: number };
    storage: { ok: boolean; total_files: number; total_bytes: number };
    timestamp: string;
  }
  ```
  HTTP 200 always (health endpoint itself doesn't fail — it reports component status)

- [ ] **Step 1: Write failing test**

Create `erp/tests/dashboard-health.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  default: { query: vi.fn() },
}));

vi.mock('@/lib/auth', () => ({
  verifyJWT: vi.fn().mockResolvedValue({ sub: 1, username: 'admin1', role: 'ADMIN' }),
  COOKIE_NAME: 'token',
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => ({ value: 'tok' }) }),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import pool from '@/lib/db';
import { GET } from '@/app/api/dashboard/health/route';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BOT_RELAY_URL = 'http://relay:8090';
});

describe('GET /api/dashboard/health', () => {
  it('returns 200 with all health components', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ ok: 1 }] } as never)        // DB ping
      .mockResolvedValueOnce({ rows: [{ files: 42, bytes: 1024 }] } as never); // storage
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });       // relay

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data).toHaveProperty('database');
    expect(data).toHaveProperty('relay');
    expect(data).toHaveProperty('storage');
    expect(data).toHaveProperty('timestamp');
  });

  it('marks database as ok when ping succeeds', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ ok: 1 }] } as never)
      .mockResolvedValueOnce({ rows: [{ files: 0, bytes: 0 }] } as never);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const res = await GET();
    const data = await res.json() as { database: { ok: boolean; latency_ms: number } };
    expect(data.database.ok).toBe(true);
    expect(typeof data.database.latency_ms).toBe('number');
  });

  it('marks database as not ok when ping fails', async () => {
    vi.mocked(pool.query)
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce({ rows: [{ files: 0, bytes: 0 }] } as never);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const res = await GET();
    const data = await res.json() as { database: { ok: boolean } };
    expect(data.database.ok).toBe(false);
  });

  it('marks relay as ok when it returns 200', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ ok: 1 }] } as never)
      .mockResolvedValueOnce({ rows: [{ files: 0, bytes: 0 }] } as never);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const res = await GET();
    const data = await res.json() as { relay: { ok: boolean } };
    expect(data.relay.ok).toBe(true);
  });

  it('marks relay as ok when it returns 404 (relay UP, endpoint not implemented)', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ ok: 1 }] } as never)
      .mockResolvedValueOnce({ rows: [{ files: 0, bytes: 0 }] } as never);
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const res = await GET();
    const data = await res.json() as { relay: { ok: boolean } };
    expect(data.relay.ok).toBe(true);
  });

  it('marks relay as not ok on network error', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ ok: 1 }] } as never)
      .mockResolvedValueOnce({ rows: [{ files: 0, bytes: 0 }] } as never);
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const res = await GET();
    const data = await res.json() as { relay: { ok: boolean } };
    expect(data.relay.ok).toBe(false);
  });

  it('returns storage file count and bytes', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ ok: 1 }] } as never)
      .mockResolvedValueOnce({ rows: [{ files: 15, bytes: 204800 }] } as never);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const res = await GET();
    const data = await res.json() as { storage: { ok: boolean; total_files: number; total_bytes: number } };
    expect(data.storage.ok).toBe(true);
    expect(data.storage.total_files).toBe(15);
    expect(data.storage.total_bytes).toBe(204800);
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd erp && npx vitest run tests/dashboard-health.test.ts --reporter=verbose 2>&1 | tail -15
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `erp/src/app/api/dashboard/health/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import pool from '@/lib/db';

interface HealthStatus {
  database: { ok: boolean; latency_ms: number };
  relay: { ok: boolean; latency_ms: number };
  storage: { ok: boolean; total_files: number; total_bytes: number };
  timestamp: string;
}

export async function GET() {
  const RELAY_URL = process.env.BOT_RELAY_URL ?? 'http://localhost:8090';

  // ── Database ping ───────────────────────────────────────────────────────
  let dbOk = false;
  let dbLatency = 0;
  try {
    const t0 = Date.now();
    await pool.query('SELECT 1 AS ok');
    dbOk = true;
    dbLatency = Date.now() - t0;
  } catch {
    dbOk = false;
  }

  // ── Relay ping (parallel with storage) ───────────────────────────────────
  let relayOk = false;
  let relayLatency = 0;
  let storageFiles = 0;
  let storageBytes = 0;

  const [relayResult, storageResult] = await Promise.allSettled([
    (async () => {
      const t0 = Date.now();
      const res = await fetch(`${RELAY_URL}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      return { ok: res.ok || res.status === 404, latency: Date.now() - t0 };
    })(),
    pool.query<{ files: number; bytes: string }>(
      `SELECT COUNT(*)::int AS files, COALESCE(SUM(file_size),0)::bigint AS bytes
       FROM media_library WHERE deleted_at IS NULL`
    ),
  ]);

  if (relayResult.status === 'fulfilled') {
    relayOk = relayResult.value.ok;
    relayLatency = relayResult.value.latency;
  }
  if (storageResult.status === 'fulfilled') {
    storageFiles = storageResult.value.rows[0].files;
    storageBytes = Number(storageResult.value.rows[0].bytes);
  }

  const health: HealthStatus = {
    database: { ok: dbOk, latency_ms: dbLatency },
    relay:    { ok: relayOk, latency_ms: relayLatency },
    storage:  { ok: storageResult.status === 'fulfilled', total_files: storageFiles, total_bytes: storageBytes },
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(health);
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
cd erp && npx vitest run tests/dashboard-health.test.ts --reporter=verbose 2>&1 | tail -15
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Run full suite — no regressions**

```bash
cd erp && npx vitest run --reporter=verbose 2>&1 | tail -10
```

- [ ] **Step 6: TypeScript check**

```bash
cd erp && npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 7: Commit**

```bash
git add erp/src/app/api/dashboard/health/route.ts erp/tests/dashboard-health.test.ts
git commit -m "feat(dashboard): system health endpoint — DB + relay + storage"
```

---

### Task 3: Dashboard 2.0 Page

**Files:**
- Modify: `erp/src/app/(dashboard)/page.tsx`

**Interfaces:**
- Consumes: `DashboardStats` from `@/lib/types`; `/api/dashboard` and `/api/dashboard/health` endpoints
- Consumes components: `BarChart` from `@/components/charts/BarChart`, `LineChart` from `@/components/charts/LineChart`, `StatsCard` from `@/components/stats-card`, `Card/CardContent/CardHeader/CardTitle` from `@/components/ui/card`
- Produces: 6-section executive dashboard page at `/` (the default app route)

**No unit tests for this page** — TypeScript must be clean and full suite must not regress.

**Section layout:**
1. Header row: title + period selector (7d / 30d / 6m) + last-updated time + refresh button
2. Financial (5 KPI cards + chart)
3. Members (4 KPI cards)
4. Operations (4 KPI cards)
5. Marketing (broadcast count + top promotions list)
6. Support (3 KPI cards + CS performance table)
7. System health (3 status indicators: DB, relay, storage)

- [ ] **Step 1: Read `erp/src/app/(dashboard)/page.tsx`** to understand current state before replacing.

- [ ] **Step 2: Replace `erp/src/app/(dashboard)/page.tsx`** with:

```typescript
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatsCard } from '@/components/stats-card';
import { BarChart } from '@/components/charts/BarChart';
import { LineChart } from '@/components/charts/LineChart';
import type { DashboardStats } from '@/lib/types';

// ── Types ─────────────────────────────────────────────────────────────────────

type Period = '7d' | '30d' | '6m';

interface HealthData {
  database: { ok: boolean; latency_ms: number };
  relay:    { ok: boolean; latency_ms: number };
  storage:  { ok: boolean; total_files: number; total_bytes: number };
  timestamp: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) { return `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`; }
function fmtSec(s: number) {
  if (s < 60) return `${s.toFixed(0)}s`;
  return `${(s / 60).toFixed(1)}m`;
}
function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

// ── Health indicator ──────────────────────────────────────────────────────────

function HealthBadge({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
      <span className={`h-2 w-2 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
      <div>
        <p className={`text-xs font-semibold ${ok ? 'text-green-700' : 'text-red-700'}`}>{label}</p>
        <p className="text-[10px] text-gray-500">{detail}</p>
      </div>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">{children}</h2>;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [stats, setStats]     = useState<DashboardStats | null>(null);
  const [health, setHealth]   = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod]   = useState<Period>('7d');
  const [lastUpdate, setLastUpdate] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, healthRes] = await Promise.all([
        fetch('/api/dashboard'),
        fetch('/api/dashboard/health'),
      ]);
      if (statsRes.ok) setStats(await statsRes.json() as DashboardStats);
      if (healthRes.ok) setHealth(await healthRes.json() as HealthData);
      setLastUpdate(new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
    const interval = setInterval(() => { void fetchData(); }, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Chart data based on selected period
  const chartData = stats
    ? period === '7d'
      ? stats.depositChart.map(d => ({ label: d.date, deposit: d.amount, withdrawal: 0 }))
      : period === '30d'
        ? stats.thirtyDayChart.map(d => ({ label: d.date, ...d }))
        : stats.monthlyRevenue.map(m => ({ label: m.month, deposit: m.deposit, withdrawal: m.withdrawal }))
    : [];

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-400 text-sm">
        Loading dashboard…
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex h-64 items-center justify-center text-red-400 text-sm">
        Failed to load dashboard. Refresh to try again.
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Executive Dashboard</h1>
        <div className="flex items-center gap-3">
          {/* Period selector */}
          <div className="flex rounded-lg border bg-white overflow-hidden">
            {(['7d', '30d', '6m'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  period === p ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '6 Months'}
              </button>
            ))}
          </div>
          <button
            onClick={() => void fetchData()}
            className="rounded-lg border bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
          >
            ↻ Refresh
          </button>
          {lastUpdate && (
            <span className="text-xs text-gray-400">Updated {lastUpdate}</span>
          )}
        </div>
      </div>

      {/* ── Section 1: Financial ─────────────────────────────────────────── */}
      <section>
        <SectionTitle>Financial</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 mb-4">
          <StatsCard title="Today Deposits"    value={fmt(stats.todayDepositAmount)}    description={`${stats.todayDepositCount} txns`} />
          <StatsCard title="Today Withdrawals" value={fmt(stats.todayWithdrawalAmount)} description={`${stats.todayWithdrawalCount} txns`} />
          <StatsCard title="Today Profit"      value={fmt(stats.todayProfit)}           description="Net – bonus" />
          <StatsCard title="Weekly Revenue"    value={fmt(stats.weeklyDepositAmount)}   description="Last 7 days deposits" />
          <StatsCard title="This Month"        value={fmt(stats.thisMonthDepositAmount)} description="Month-to-date deposits" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Revenue Chart — {period === '7d' ? 'Daily (7 Days)' : period === '30d' ? 'Daily (30 Days)' : 'Monthly (6 Months)'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">No data for this period</p>
            ) : (
              <BarChart
                data={chartData.map(d => ({ label: d.label, value: d.deposit }))}
                valueKey="value"
                color="#3B82F6"
                height={140}
                formatValue={v => `RM ${v.toFixed(0)}`}
              />
            )}
            {/* Monthly detail list (6m period only) */}
            {period === '6m' && stats.monthlyRevenue.length > 0 && (
              <div className="mt-3 space-y-1">
                {stats.monthlyRevenue.map(m => (
                  <div key={m.month} className="flex items-center justify-between text-xs text-gray-600">
                    <span className="font-medium">{m.month}</span>
                    <span>Dep: {fmt(m.deposit)} · With: {fmt(m.withdrawal)}</span>
                    <span className="font-semibold text-gray-800">Net: {fmt(m.net)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── Section 2: Members ────────────────────────────────────────────── */}
      <section>
        <SectionTitle>Members</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatsCard title="New Members Today"  value={stats.newMembersToday}    description="Registered today" />
          <StatsCard title="Active Members"     value={stats.activeMembers}      description="Status: Active" />
          <StatsCard title="Online Now"         value={stats.onlineMembers}      description="Seen in last 5 min" />
          <StatsCard title="VIP Members"        value={stats.vipMembers}         description="Tagged as VIP" />
        </div>
      </section>

      {/* ── Section 3: Operations ─────────────────────────────────────────── */}
      <section>
        <SectionTitle>Operations</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatsCard
            title="Pending Deposits"
            value={stats.pendingDeposits}
            description={stats.pendingDeposits > 0 ? '⚠ Awaiting review' : 'All clear'}
          />
          <StatsCard
            title="Pending Withdrawals"
            value={stats.pendingWithdrawals}
            description={stats.pendingWithdrawals > 0 ? '⚠ Awaiting review' : 'All clear'}
          />
          <StatsCard
            title="Open Live Chats"
            value={stats.openLiveChats}
            description="OPEN + ACTIVE sessions"
          />
          <StatsCard
            title="Waiting Customers"
            value={stats.waitingCustomers}
            description="Unassigned sessions"
          />
        </div>
      </section>

      {/* ── Section 4: Marketing ──────────────────────────────────────────── */}
      <section>
        <SectionTitle>Marketing</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-sm">Broadcasts</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-3xl font-bold">{stats.broadcastSentToday}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Broadcasts sent today</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Top Promotions — Last 30 Days</CardTitle></CardHeader>
            <CardContent>
              {stats.topPromotions.length === 0 ? (
                <p className="text-xs text-gray-400">No promotion data</p>
              ) : (
                <div className="space-y-1.5">
                  {stats.topPromotions.slice(0, 5).map((p, i) => (
                    <div key={p.name} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">#{i + 1} {p.name}</span>
                      <span className="font-semibold">{p.claim_count} claims</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── Section 5: Support ────────────────────────────────────────────── */}
      <section>
        <SectionTitle>Support</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 mb-4">
          <StatsCard title="Avg Response Time" value={fmtSec(stats.avgResponseTimeSeconds)} description="Time to first response today" />
          <StatsCard title="Chat Sessions Today" value={stats.chatSessionsToday}            description="Sessions opened today" />
          <StatsCard title="Online Staff"        value={stats.onlineSupportStaff}           description="Staff active today" />
        </div>
        {stats.csPerformance.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">CS Performance — Today</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {stats.csPerformance.map((cs, i) => (
                  <div key={cs.agent} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">#{i + 1} {cs.agent}</span>
                    <span className="font-semibold">{cs.sessions} session{cs.sessions !== 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {/* ── Section 6: System Health ──────────────────────────────────────── */}
      <section>
        <SectionTitle>System Health</SectionTitle>
        {!health ? (
          <p className="text-xs text-gray-400">Loading health status…</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            <HealthBadge
              ok={health.database.ok}
              label="Database"
              detail={health.database.ok ? `${health.database.latency_ms}ms` : 'Unreachable'}
            />
            <HealthBadge
              ok={health.relay.ok}
              label="Bot Relay"
              detail={health.relay.ok ? `${health.relay.latency_ms}ms` : 'Unreachable'}
            />
            <HealthBadge
              ok={health.storage.ok}
              label="Media Storage"
              detail={health.storage.ok ? `${health.storage.total_files} files · ${fmtBytes(health.storage.total_bytes)}` : 'Error'}
            />
          </div>
        )}
      </section>

      {/* ── Bottom: Game Providers ────────────────────────────────────────── */}
      {stats.topGameProviders.length > 0 && (
        <section>
          <SectionTitle>Top Game Providers — Last 30 Days</SectionTitle>
          <Card>
            <CardContent className="pt-4">
              <BarChart
                data={stats.topGameProviders.map(p => ({ label: p.provider, value: p.deposit_count }))}
                valueKey="value"
                color="#6366F1"
                height={120}
                formatValue={v => `${v} txns`}
              />
              <div className="mt-3 space-y-1">
                {stats.topGameProviders.map((p, i) => (
                  <div key={p.provider} className="flex items-center justify-between text-xs text-gray-600">
                    <span>#{i + 1} {p.provider}</span>
                    <span className="font-medium">{p.deposit_count} txns · {fmt(p.deposit_amount)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

    </div>
  );
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd erp && npx tsc --noEmit 2>&1 | head -30
```

Expected: Zero errors. Fix any type mismatches (e.g., if `thirtyDayChart` or `csPerformance` types don't match).

- [ ] **Step 4: Run full suite — no regressions**

```bash
cd erp && npx vitest run --reporter=verbose 2>&1 | tail -10
```

Expected: All tests pass (same count as before Task 3 — no new test file in this task).

- [ ] **Step 5: Commit**

```bash
git add 'erp/src/app/(dashboard)/page.tsx'
git commit -m "feat(dashboard): Dashboard 2.0 — 6-section executive layout, period charts, system health"
```

---

### Task 4: Final Verification

**Files:** No new files — verification only.

- [ ] **Step 1: Full test suite**

```bash
cd erp && npx vitest run --reporter=verbose 2>&1 | tail -30
```

Expected: All tests pass. New count = prior count + tests from Tasks 1 and 2.

- [ ] **Step 2: TypeScript**

```bash
cd erp && npx tsc --noEmit 2>&1 | head -20
```

Expected: Zero errors.

- [ ] **Step 3: Next.js build**

```bash
cd erp && npm run build 2>&1 | tail -40
```

Expected: Build succeeds. Check for:
- `/` (dashboard) route visible
- `/api/dashboard` route visible
- `/api/dashboard/health` route visible

- [ ] **Step 4: Architecture guards**

```bash
# Guard 1: No new media upload logic in dashboard
grep -r "uploadFile\|writeFile\|base64\|Buffer.from" erp/src/app/api/dashboard/ 2>/dev/null && echo "VIOLATION" || echo "CLEAN"

# Guard 2: Dashboard API has no write operations (no INSERT/UPDATE/DELETE)
grep -in "INSERT\|UPDATE\|DELETE" erp/src/app/api/dashboard/route.ts && echo "VIOLATION" || echo "CLEAN"

# Guard 3: Health endpoint reads only
grep -in "INSERT\|UPDATE\|DELETE" erp/src/app/api/dashboard/health/route.ts && echo "VIOLATION" || echo "CLEAN"

# Guard 4: Dashboard page uses existing chart components (not inline SVG)
grep "BarChart\|LineChart" "erp/src/app/(dashboard)/page.tsx"

# Guard 5: No modifications to locked components
git diff HEAD~10..HEAD -- erp/src/components/media/ erp/src/components/charts/ erp/src/app/\(dashboard\)/livechat/ 2>/dev/null | grep "^+" | grep -v "^+++" | head -5 && echo "CHECK ABOVE" || echo "LOCKED FILES CLEAN"
```

Expected:
- Guard 1: CLEAN
- Guard 2: CLEAN (no write operations)
- Guard 3: CLEAN
- Guard 4: Both component names appear
- Guard 5: No unexpected changes to locked files

- [ ] **Step 5: Python regression**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot && python -m pytest bot/ -x -q 2>&1 | tail -10
```

Expected: Same 11 pre-existing failures, no new ones.

- [ ] **Step 6: Update progress ledger and commit**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot
cat >> .superpowers/sdd/progress.md << 'EOF'

# Phase 5.6 — Dashboard 2.0 Progress Ledger
# Plan: docs/superpowers/plans/2026-07-04-phase56-dashboard-v2.md
# Base commit (5.6 start): 0a0e396
EOF

git add .superpowers/sdd/progress.md
git commit -m "chore(dashboard): Phase 5.6 verification — all checks PASS" --allow-empty
```

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|---|---|
| Today Deposit / Withdrawal / Profit | ✅ Task 1 (existing) + Task 3 (Financial section) |
| Weekly Revenue | ✅ Task 1 (`weeklyDepositAmount`) + Task 3 |
| Monthly Revenue | ✅ Task 1 (existing `monthlyRevenue`) + Task 3 |
| New Members Today | ✅ Task 1 (existing) + Task 3 (Members section) |
| Active Members | ✅ Task 1 (existing) + Task 3 |
| Online Members | ✅ Task 1 (`onlineMembers`) + Task 3 |
| VIP Members | ✅ Task 1 (`vipMembers`) + Task 3 |
| Pending Deposits / Withdrawals | ✅ Task 1 (existing) + Task 3 (Operations section) |
| Open Live Chats | ✅ Task 1 (`openLiveChats`) + Task 3 |
| Waiting Customers | ✅ Task 1 (`waitingCustomers`) + Task 3 |
| Broadcast Sent Today | ✅ Task 1 (`broadcastSentToday`) + Task 3 (Marketing section) |
| Promotion Performance | ✅ Task 1 (existing `topPromotions`) + Task 3 |
| Top Campaigns | ✅ Task 1 (existing `topPromotions`) + Task 3 |
| Average Response Time | ✅ Task 1 (`avgResponseTimeSeconds`) + Task 3 (Support section) |
| Chat Volume | ✅ Task 1 (`chatSessionsToday`) + Task 3 |
| CS Performance | ✅ Task 1 (`csPerformance`) + Task 3 |
| Database Health | ✅ Task 2 + Task 3 (System section) |
| Relay Health | ✅ Task 2 + Task 3 |
| Storage Health | ✅ Task 2 + Task 3 |
| Bot Status | ✅ Covered by Relay Health (same service) |
| Daily Chart | ✅ Task 3 (7d period selector) |
| Weekly Chart | ✅ Task 3 (30d period with daily grouping) |
| Monthly Chart | ✅ Task 3 (6m period selector, existing `monthlyRevenue`) |
| Date Range Filter | ✅ Task 3 (period selector: 7d / 30d / 6m) |
| Auto-refresh | ✅ Task 3 (60-second interval) |
| READ ONLY | ✅ All — no write operations in any new code |

### Placeholder Scan

No TBD, TODO, or incomplete sections detected.

### Type Consistency

- `DashboardStats.thirtyDayChart` defined in Task 1 → consumed in Task 3: `stats.thirtyDayChart.map(d => ({ label: d.date, ...d }))` — shape `{ date, deposit, withdrawal }` matches
- `DashboardStats.csPerformance` defined as `{ agent: string; sessions: number }[]` in Task 1 → consumed in Task 3: `cs.agent`, `cs.sessions` — matches
- `DashboardStats.vipMembers`, `onlineMembers`, `openLiveChats`, `waitingCustomers`, `broadcastSentToday`, `weeklyDepositAmount`, `thisMonthDepositAmount`, `avgResponseTimeSeconds`, `chatSessionsToday` — all `number` in Task 1, used as `number` in Task 3 — consistent
- `HealthData` interface defined locally in Task 3 page — matches health endpoint response shape from Task 2
- `BarChart` props: `{ data: { label: string; value: number }[], valueKey: string, color: string, height: number, formatValue }` — used correctly in Task 3

*All types consistent across tasks.*
