# Transactions Center UX Upgrade — Design Spec
**Date:** 2026-07-26  
**Platform:** Tesla88 / SSWIN88 v1.0  
**Scope:** ERP Transactions Center — Finance / Customer Service UX only  

---

## Goal

Upgrade the ERP Transactions Center so Finance and Customer Service staff can:
- See a real-time operational queue of pending work
- Hear an audio alert when a new deposit or withdrawal arrives
- Find specific transactions quickly via search
- View the pending workload at a glance from the sidebar and browser title

No changes to approval logic, wallet, authentication, 918KISS, nginx, or Docker.

---

## Non-Goals (explicitly out of scope)

- Deposit approval / rejection logic
- Withdrawal approval / rejection logic
- Receipt upload / viewer
- Authentication / login / registration
- Wallet / game APIs / 918KISS
- nginx / Docker / deployment
- Existing API response contract changes
- Removing the existing `/api/deposits/stream` endpoint

---

## Clarifications (added 2026-07-26 post-approval)

1. **Single source of truth is absolute.** Summary Card, Sidebar Badge, Browser Title, and Pending Tab Badge must all derive their count from the same `GET /api/transactions/pending-count` call. No location may maintain its own independent counter.

2. **Notification sound fires at most once per throttle window.** If multiple `pending_changed` events arrive within the 250ms throttle window, `playNotifBeep()` is called exactly once — not once per event. The throttle collapses burst events into a single API fetch, and the sound decision is made after that single fetch.

3. **Row highlight is one-shot and session-keyed.** A row highlights only when its composite key (`{type}-{id}`) is absent from the previous render's ID set AND the update was triggered by a realtime SSE event (not by tab switch, search change, pagination, or manual navigation). A `highlightSource` flag distinguishes SSE-driven refreshes from user-driven ones. Existing rows never re-highlight.

4. **Search applies identically to deposits and withdrawals.** The ILIKE filter on `u.first_name`, `u.phone`, `u.public_id`, `u.id::text` is added to the outer WHERE clause of the UNION ALL sub-query, so it applies uniformly regardless of which table a row came from. There is no type-specific search path.

---

## Architecture Overview

### Single Source of Truth

All four UI locations (sidebar badge, browser title, pending tab badge, summary card) read from **one** database query:

```sql
SELECT (
  SELECT COUNT(*) FROM deposit_requests  WHERE status = 'PENDING'
) + (
  SELECT COUNT(*) FROM withdrawal_requests WHERE status = 'PENDING'
)::int AS pending_count;
```

The count:
- Increases when a new PENDING record is inserted (deposit or withdrawal)
- Increases when a record is updated back to PENDING (edge case)
- Decreases when a PENDING record transitions to any other status
- Is **never** cleared by opening the Transactions page
- Is **never** stored in session state — always authoritative from DB

### Realtime Flow

```
DB insert/update on deposit_requests or withdrawal_requests
        ↓
Postgres trigger fires
        ↓
pg_notify('transaction_pending_count', '{"event":"pending_changed"}')
        ↓
/api/transactions/stream (SSE, LISTEN channel)
        ↓
Browser receives event
        ↓
Frontend calls GET /api/transactions/pending-count
        ↓
Update: sidebar badge + browser title + pending tab badge + pending list
```

Sound plays only when `newCount > prevCount` (queue grew).

---

## Section 1 — Realtime Infrastructure

### 1.1 Database Migration

**File:** `db/migrations/034_transaction_pending_count.sql`

One trigger function, attached to both tables.

**Notify when:**
| Operation | Condition | Action |
|-----------|-----------|--------|
| INSERT | `NEW.status = 'PENDING'` | pg_notify |
| UPDATE | `OLD.status ≠ 'PENDING'` AND `NEW.status = 'PENDING'` | pg_notify |
| UPDATE | `OLD.status = 'PENDING'` AND `NEW.status ≠ 'PENDING'` | pg_notify |
| All other cases | — | No-op |

Payload: `{"event": "pending_changed"}` (no count, no type — client re-fetches)

No new columns. No schema changes. Trigger only.

### 1.2 SSE Endpoint

**File:** `erp/src/app/api/transactions/stream/route.ts`

- Pattern: exact mirror of `/api/deposits/stream`
- Auth: requires `deposit.view` OR `withdraw.view` permission
- LISTEN channel: `transaction_pending_count`
- Heartbeat: `': ping\n\n'` every 25 seconds
- Response: `text/event-stream`, `X-Accel-Buffering: no`
- Existing `/api/deposits/stream` is preserved unchanged

### 1.3 Pending Count API

**File:** `erp/src/app/api/transactions/pending-count/route.ts`

```
GET /api/transactions/pending-count
→ { count: number }
```

- Auth: requires `deposit.view` OR `withdraw.view`
- Always queries DB — no caching
- Returns sum of PENDING deposits + PENDING withdrawals

---

## Section 2 — Sidebar Refactor

**File:** `erp/src/components/sidebar.tsx`

### 2.1 State Change

Remove:
- `depositsUnread` state
- `fetch('/api/deposits/unread')` GET (initial load)
- `fetch('/api/deposits/unread', { method: 'POST' })` (clear on navigate)
- EventSource for `/api/deposits/stream` in sidebar
- The `useEffect` that clears deposit badge on `/transactions` navigation

Add:
- `pendingCount: number` state (default 0)
- Initial load: `fetch('/api/transactions/pending-count')`
- EventSource for `/api/transactions/stream`

### 2.2 SSE Handler (Throttled)

On `message` event from `/api/transactions/stream`:

```typescript
// Throttle: schedule ONE refresh per 250ms window.
// Multiple burst events collapse into a single fetch + a single sound decision.
const scheduleRefresh = useCallback(() => {
  if (refreshTimer.current) return;          // already scheduled — skip
  refreshTimer.current = setTimeout(() => {
    refreshTimer.current = null;
    fetch('/api/transactions/pending-count')
      .then(r => r.json())
      .then((d: { count: number }) => {
        setPendingCount(prev => {
          // Sound fires at most once per throttle window, only when count grows.
          if (d.count > prev) playNotifBeep();
          return d.count;
        });
      })
      .catch(() => {});
  }, 250);
}, []);
```

- Timer reference: `useRef<ReturnType<typeof setTimeout> | null>(null)`
- Cleared on component unmount
- **Invariant:** `playNotifBeep()` is called at most once per 250ms window, regardless of how many SSE events arrive in that window.

### 2.3 Browser Title

```typescript
useEffect(() => {
  document.title = pendingCount > 0
    ? `(${pendingCount}) Tesla88 ERP`
    : 'Tesla88 ERP';
}, [pendingCount]);
```

### 2.4 Sidebar Badge

The Transactions nav item displays `pendingCount`:

```tsx
{href === '/transactions' && pendingCount > 0 && (
  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
    {pendingCount > 99 ? '99+' : pendingCount}
  </span>
)}
```

---

## Section 3 — Transactions API Extension

**File:** `erp/src/app/api/transactions/route.ts`

### 3.1 New Query Parameters

| Param | Values | Behavior |
|-------|--------|----------|
| `type` | `pending` (new) | WHERE status='PENDING', newest first, ignores `status` param |
| `search` | any string | ILIKE on `u.first_name`, `u.phone`, `u.public_id`, `u.id::text` |

Existing params (`type=all|deposit|withdrawal`, `status`, `page`) are unchanged.

### 3.2 Search SQL Pattern

Search is applied as a single `AND` condition on the **outer** query wrapping the UNION ALL sub-query. It therefore applies uniformly and identically to both deposit rows and withdrawal rows — there is no type-specific search path.

```sql
-- Outer query structure:
SELECT * FROM (
  -- deposit half of UNION ALL (u = users JOIN)
  UNION ALL
  -- withdrawal half of UNION ALL (u = users JOIN)
) sub
WHERE (
  u.first_name ILIKE $1
  OR u.phone    ILIKE $1
  OR u.public_id ILIKE $1
  OR u.id::text  ILIKE $1
)
-- plus any existing status / pending filters
ORDER BY created_at DESC
LIMIT $2 OFFSET $3
```

Where `$1 = '%' + term + '%'`.

**Invariant:** Because both halves of the UNION ALL join the same `users` table on `user_id`, the `u.*` columns are identical in structure. The outer WHERE filter works equally on deposit rows and withdrawal rows without any conditional logic.

### 3.3 Pending Type Logic

When `type=pending`:
- Use the UNION ALL base SQL (both deposits + withdrawals)
- Override status filter to `status = 'PENDING'`
- Ignore any explicit `status` param from query string
- Sort: `ORDER BY created_at DESC` (newest first)
- Works with `search` param

### 3.4 Filter Combinations — All Valid

| type | status | search | Result |
|------|--------|--------|--------|
| pending | — | — | All PENDING, newest first |
| pending | — | "john" | All PENDING matching "john" |
| all | PENDING | "john" | Equivalent to above (explicit status filter) |
| deposit | — | "0123" | Deposits matching "0123" |
| withdrawal | APPROVED | — | Approved withdrawals |
| all | — | "SS10" | All types matching "SS10" |

### 3.5 Backward Compatibility

Existing calls without `search` or `type=pending` behave identically to current implementation.

---

## Section 4 — Transactions Page Rewrite

**File:** `erp/src/app/(dashboard)/transactions/page.tsx`

### 4.1 Tab Order and Default

```
[ Pending (5) ] [ All ] [ Deposits ] [ Withdrawals ]
```

- Default tab: `pending`
- `TabType = 'pending' | 'all' | 'deposit' | 'withdrawal'`
- Switching tabs resets page to 1, preserves search

### 4.2 Search Bar

```tsx
<Input
  placeholder="Search by Member ID, username, phone..."
  value={search}
  onChange={e => { setSearch(e.target.value); setPage(1); }}
  className="w-64"
/>
```

- 500ms debounce (useEffect with setTimeout, clears on change)
- Changing search resets to page 1
- Search state persists across tab switches

### 4.3 Pending Summary Card

Displayed only when `tab === 'pending'`, above the table.

```
┌─────────────────────────────────────────────────┐
│  Pending Summary                                 │
│  Deposit  [N]   Withdraw  [N]   Total  [N]       │
└─────────────────────────────────────────────────┘
```

- Counts fetched from `GET /api/transactions/pending-count`
- Also fetches individual counts from:
  - `GET /api/transactions/pending-count` returns total
  - Deposit count: `SELECT COUNT(*) FROM deposit_requests WHERE status='PENDING'`
  - Withdraw count: computed as `total - deposit_count`
- **Implementation**: Extend `pending-count` API to also return `{ count, deposit_count, withdrawal_count }` — all in one query
- Updates in realtime (re-fetches after SSE event, same throttle as sidebar)

### 4.4 Realtime Auto-Refresh

```typescript
// Subscribe to /api/transactions/stream
// On any event → if not currently loading → re-fetch the current list
// Do NOT reset: tab, page, search, status filter
useEffect(() => {
  const es = new EventSource('/api/transactions/stream');
  es.onmessage = () => {
    loadRef.current();      // re-fetch list with current params
    refreshCount();         // re-fetch pending summary card
  };
  return () => es.close();
}, []);
```

### 4.5 Row Highlight for New Arrivals

Highlight applies **only** to rows that arrive via an SSE-triggered refresh. Tab switches, search changes, pagination, and manual navigation never trigger highlights.

A boolean `isRealtimeRefresh` flag is passed into the load function:

```typescript
const load = useCallback((realtimeRefresh = false) => {
  setLoading(true);
  fetch(...)
    .then(r => r.json())
    .then(d => {
      const incoming = d.data as TransactionRow[];
      if (realtimeRefresh) {
        // Only highlight rows whose key was absent from the previous render.
        const incomingKeys = new Set(incoming.map(r => `${r.type}-${r.id}`));
        const newKeys = new Set([...incomingKeys].filter(k => !prevIdsRef.current.has(k)));
        if (newKeys.size > 0) {
          setHighlightedIds(newKeys);
          setTimeout(() => setHighlightedIds(new Set()), 2500);
        }
        prevIdsRef.current = incomingKeys;
      } else {
        // User-driven navigation: update prevIds silently, never highlight.
        prevIdsRef.current = new Set(incoming.map(r => `${r.type}-${r.id}`));
        setHighlightedIds(new Set());
      }
      setData(d);
    })
    .finally(() => setLoading(false));
}, [tab, status, search, page]);

// SSE triggers:
es.onmessage = () => { loadRef.current(true); };   // realtimeRefresh = true

// User navigation (tab switch, search, pagination):
load(false);                                         // realtimeRefresh = false
```

**Invariants:**
- A row highlights at most once — the `prevIdsRef` is updated after each SSE refresh, so the same row ID cannot re-highlight on the next event.
- Tab switch / search change / pagination always calls `load(false)` → highlight set is cleared → existing rows never re-highlight.

CSS in `erp/src/app/globals.css`:
```css
@keyframes highlight-fade {
  0%   { background-color: rgb(254 240 138); } /* yellow-200 */
  100% { background-color: transparent; }
}
.animate-highlight {
  animation: highlight-fade 2.5s ease-out forwards;
}
```

### 4.6 Type Indicator Labels

| Type | Display |
|------|---------|
| deposit | `🟢 Deposit` — `bg-emerald-50 text-emerald-700 border-emerald-200` |
| withdrawal | `🟠 Withdraw` — `bg-orange-50 text-orange-700 border-orange-200` |

Reuses existing `TYPE_CLASS` pattern in the file.

### 4.7 Empty State

When `tab === 'pending'` and rows is empty (not loading):
```tsx
<tr>
  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
    No pending transactions.
  </td>
</tr>
```

For other tabs: existing "No transactions found" text.

### 4.8 Pending Tab Badge Source

The badge on the Pending tab reads `pendingCount` from a local state that:
- Is populated on mount from `GET /api/transactions/pending-count`
- Updates via the same `/api/transactions/stream` SSE subscription
- Uses the same throttle (250ms) as the sidebar

This is the same source of truth — same API, same count — just two subscribers.

---

## Section 5 — Extended Pending Count API

**File:** `erp/src/app/api/transactions/pending-count/route.ts`

Response includes breakdown for the Summary Card:

```json
{
  "count": 8,
  "deposit_count": 5,
  "withdrawal_count": 3
}
```

Single query:
```sql
SELECT
  SUM(CASE WHEN source = 'deposit'    THEN 1 ELSE 0 END)::int AS deposit_count,
  SUM(CASE WHEN source = 'withdrawal' THEN 1 ELSE 0 END)::int AS withdrawal_count,
  COUNT(*)::int AS count
FROM (
  SELECT 'deposit'    AS source FROM deposit_requests    WHERE status = 'PENDING'
  UNION ALL
  SELECT 'withdrawal' AS source FROM withdrawal_requests WHERE status = 'PENDING'
) sub
```

---

## File Manifest

| File | Action | Notes |
|------|--------|-------|
| `db/migrations/034_transaction_pending_count.sql` | **CREATE** | pg_notify trigger, no schema changes |
| `erp/src/app/api/transactions/stream/route.ts` | **CREATE** | SSE for transaction_pending_count channel |
| `erp/src/app/api/transactions/pending-count/route.ts` | **CREATE** | Returns `{count, deposit_count, withdrawal_count}` |
| `erp/src/app/api/transactions/route.ts` | **MODIFY** | Add `search` param + `type=pending` support |
| `erp/src/components/sidebar.tsx` | **MODIFY** | Replace depositsUnread with pendingCount |
| `erp/src/app/(dashboard)/transactions/page.tsx` | **REWRITE** | Full feature set |
| `erp/src/app/globals.css` | **MODIFY** | Add `@keyframes highlight-fade` + `.animate-highlight` |

**Not modified:** `/api/deposits/stream`, `/api/deposits/unread`, any 918KISS files, nginx, Docker, auth, wallet, receipt.

---

## Testing Checklist

### Backend
- [ ] Migration runs without error; triggers attached to both tables
- [ ] `GET /api/transactions/pending-count` returns correct sum
- [ ] Inserting a PENDING deposit → pg_notify fires → SSE client receives event
- [ ] Approving a deposit → pg_notify fires → count decreases
- [ ] `GET /api/transactions?type=pending` returns only PENDING rows, newest first
- [ ] `GET /api/transactions?search=john` filters correctly across all tabs
- [ ] `GET /api/transactions?type=pending&search=SS10` combines correctly
- [ ] Existing calls without new params return same results as before

### Frontend
- [ ] Sidebar badge shows total PENDING count on load
- [ ] Browser title shows `(N) Tesla88 ERP` when N > 0
- [ ] Browser title shows `Tesla88 ERP` when N = 0
- [ ] Sound plays when new PENDING arrives (count increases)
- [ ] Sound does NOT play when PENDING resolves (count decreases)
- [ ] Navigating to /transactions does NOT clear the badge
- [ ] Pending tab is default on page load
- [ ] Pending tab shows only PENDING rows
- [ ] Pending tab badge matches sidebar badge matches browser title (same number)
- [ ] Pending Summary Card shows correct deposit / withdraw / total breakdown
- [ ] New row gets highlight animation; fades after 2.5s
- [ ] Search filters correctly (Member ID / username / phone)
- [ ] Search + Pending tab works together
- [ ] Search + status filter works together
- [ ] Search reset to page 1 on change
- [ ] Auto-refresh does not reset tab / search / page
- [ ] Empty state "No pending transactions." shown when Pending tab is empty
- [ ] All existing tabs (All / Deposits / Withdrawals) still work correctly

### Regression
- [ ] Deposit approval flow unchanged
- [ ] Withdrawal approval flow unchanged
- [ ] Receipt upload / viewer unchanged
- [ ] LiveChat badge and sound unchanged
- [ ] Member Management unchanged
- [ ] 918KISS unchanged

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Trigger fires too frequently under high load | Low | Throttle on client (250ms); trigger is lightweight pg_notify only |
| SSE connection drops silently | Low-Medium | Existing heartbeat pattern (25s ping) already handles this |
| Highlight animation misidentifies rows | Low | Uses composite key `{type}-{id}` which is globally unique |
| `globals.css` edit causes style regression | Low | Adding a new keyframe + class; no existing styles touched |
| Backward-compat break on transactions API | None | New params are additive; no existing params changed |
| Double sound (sidebar + page both play) | None by design | Only sidebar plays sound; page component does not call `playNotifBeep()` |
