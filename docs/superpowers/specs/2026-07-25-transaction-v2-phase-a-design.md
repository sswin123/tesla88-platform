# ERP Transaction Module V2 — Full Roadmap Design Specification
# (Phase A: Foundation · Phase B: Detail V2 · Phase C: Search · Phase D: Realtime)

**Goal:** Build the core infrastructure required for all future Transaction V2 features — Internal Notes, Timeline, Transaction Event System, and the Transaction Service layer — without changing any existing production workflow.

**Architecture:** Additive-only. New modules sit alongside existing routes; no existing route is modified. Future phases adopt the new modules incrementally.

**Tech Stack:** TypeScript, Next.js App Router (API Routes), PostgreSQL, existing `audit_repo`, `require_permission`, `role_permissions`.

---

## Global Constraints

- **BACKWARD COMPATIBILITY IS MANDATORY.** Every existing production flow (Deposit/Withdraw create, process, approve, reject, balance update, SSE, LISTEN/NOTIFY, audit, media) must continue working exactly as before. No existing file signature, route behavior, or DB column is removed or broken.
- No frontend UI changes in Phase A. APIs are built; UI is Phase B.
- Follow existing repository pattern (standalone exported async functions, not classes).
- `as const` object for event names — no TypeScript enum.
- Soft delete on notes — no physical row deletion.
- All new permissions use dot-notation strings (`transaction.notes.view`, etc.).

---

## Roadmap Context

```
Phase A  ← THIS SPEC
  └─ Foundation: Events, Notes, Timeline, Service modules

Phase B  — Transaction Detail V2 (UI redesign, migrates approve/reject into service)
Phase C  — Search & Advanced Filters
Phase D  — Realtime Enhancement (emitTransactionEvent wired to SSE/Webhooks)
```

---

## File Structure

### New files

```
erp/src/lib/transactions/
├── transaction_events.ts        — event constants + TransactionAuditPayload + emitTransactionEvent()
├── transaction_audit.ts         — audit helper wrapping audit_repo
├── transaction_notes.ts         — notes orchestration (notes_repo + audit + emit)
└── index.ts                     — re-exports public API

erp/src/lib/repositories/
└── notes_repo.ts                — pure DB: transaction_internal_notes CRUD

erp/src/app/api/transactions/[type]/[id]/
├── notes/
│   ├── route.ts                 — GET (list) + POST (create)
│   └── [noteId]/
│       └── route.ts             — PUT (update) + DELETE (soft delete)
└── timeline/
    └── route.ts                 — GET (paginated TimelineItem list)

erp/migrations/
└── 082_transaction_v2_foundation.sql
```

### Modified files

```
erp/src/lib/repositories/audit_repo.ts
  — ADD: getAuditLogsByTarget() (new function, existing functions untouched)
  — ADD: optional description param to logAudit() (backward-compatible default)
```

---

## Section 1 — Database

### Migration 082

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 082: Transaction V2 Phase A Foundation
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Internal Notes table (soft delete via deleted_at)
CREATE TABLE IF NOT EXISTS transaction_internal_notes (
  id               SERIAL       PRIMARY KEY,
  transaction_type VARCHAR(20)  NOT NULL CHECK (transaction_type IN ('deposit','withdrawal')),
  transaction_id   INTEGER      NOT NULL,
  admin_id         INTEGER      NOT NULL REFERENCES admins(id),
  content          TEXT         NOT NULL,
  created_at       TIMESTAMPTZ  DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ  NULL  -- soft delete; NULL = active
);

CREATE INDEX IF NOT EXISTS idx_txn_notes_lookup
  ON transaction_internal_notes (transaction_type, transaction_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- 2. Extend audit_logs: add optional human-readable description
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS description TEXT;

-- 3. Index for Timeline queries by target
CREATE INDEX IF NOT EXISTS idx_audit_logs_target
  ON audit_logs (target_type, target_id, created_at DESC);

-- 4. Seed new permissions (default: not granted — admins assign via ERP)
INSERT INTO role_permissions (role, permission, granted, updated_by)
VALUES
  ('CS',          'transaction.notes.view',     FALSE, 'migration-082'),
  ('CS',          'transaction.notes.create',   FALSE, 'migration-082'),
  ('CS',          'transaction.notes.edit',     FALSE, 'migration-082'),
  ('CS',          'transaction.notes.delete',   FALSE, 'migration-082'),
  ('CS',          'transaction.timeline.view',  FALSE, 'migration-082'),
  ('SUPPORT',     'transaction.notes.view',     TRUE,  'migration-082'),
  ('SUPPORT',     'transaction.notes.create',   TRUE,  'migration-082'),
  ('SUPPORT',     'transaction.notes.edit',     TRUE,  'migration-082'),
  ('SUPPORT',     'transaction.notes.delete',   FALSE, 'migration-082'),
  ('SUPPORT',     'transaction.timeline.view',  TRUE,  'migration-082'),
  ('FINANCE',     'transaction.notes.view',     TRUE,  'migration-082'),
  ('FINANCE',     'transaction.notes.create',   TRUE,  'migration-082'),
  ('FINANCE',     'transaction.notes.edit',     TRUE,  'migration-082'),
  ('FINANCE',     'transaction.notes.delete',   FALSE, 'migration-082'),
  ('FINANCE',     'transaction.timeline.view',  TRUE,  'migration-082'),
  ('SUPERVISOR',  'transaction.notes.view',     TRUE,  'migration-082'),
  ('SUPERVISOR',  'transaction.notes.create',   TRUE,  'migration-082'),
  ('SUPERVISOR',  'transaction.notes.edit',     TRUE,  'migration-082'),
  ('SUPERVISOR',  'transaction.notes.delete',   TRUE,  'migration-082'),
  ('SUPERVISOR',  'transaction.timeline.view',  TRUE,  'migration-082'),
  ('ADMIN',       'transaction.notes.view',     TRUE,  'migration-082'),
  ('ADMIN',       'transaction.notes.create',   TRUE,  'migration-082'),
  ('ADMIN',       'transaction.notes.edit',     TRUE,  'migration-082'),
  ('ADMIN',       'transaction.notes.delete',   TRUE,  'migration-082'),
  ('ADMIN',       'transaction.timeline.view',  TRUE,  'migration-082')
ON CONFLICT (role, permission) DO NOTHING;
-- SUPER_ADMIN bypasses permission checks in can() — no row needed.
```

---

## Section 2 — Event System

### `erp/src/lib/transactions/transaction_events.ts`

```typescript
export const TransactionEvent = {
  // Deposit lifecycle
  DEPOSIT_CREATED:        'DEPOSIT_CREATED',
  DEPOSIT_PROCESSING:     'DEPOSIT_PROCESSING',
  DEPOSIT_APPROVED:       'DEPOSIT_APPROVED',
  DEPOSIT_REJECTED:       'DEPOSIT_REJECTED',

  // Withdrawal lifecycle
  WITHDRAW_CREATED:       'WITHDRAW_CREATED',
  WITHDRAW_PROCESSING:    'WITHDRAW_PROCESSING',
  WITHDRAW_APPROVED:      'WITHDRAW_APPROVED',
  WITHDRAW_REJECTED:      'WITHDRAW_REJECTED',

  // Internal notes (explicit prefix avoids future collision)
  INTERNAL_NOTE_CREATED:  'INTERNAL_NOTE_CREATED',
  INTERNAL_NOTE_UPDATED:  'INTERNAL_NOTE_UPDATED',
  INTERNAL_NOTE_DELETED:  'INTERNAL_NOTE_DELETED',

  // Receipt
  RECEIPT_UPLOADED:       'RECEIPT_UPLOADED',
  RECEIPT_VIEWED:         'RECEIPT_VIEWED',
  RECEIPT_DOWNLOADED:     'RECEIPT_DOWNLOADED',

  // Status
  STATUS_CHANGED:         'STATUS_CHANGED',
} as const;

export type TransactionEventType = typeof TransactionEvent[keyof typeof TransactionEvent];
export type TransactionType = 'deposit' | 'withdrawal';

export interface TransactionAuditPayload {
  adminId:         number;
  event:           TransactionEventType;
  transactionType: TransactionType;
  transactionId:   number;
  description:     string;
  metadata?:       Record<string, unknown>;
}

// Phase A: no-op placeholder.
// Phase D: SSE / Webhook / Analytics / Notification hooks subscribe here
// without modifying Notes or Audit code.
export async function emitTransactionEvent(
  event: TransactionEventType,
  payload: Record<string, unknown>,
): Promise<void> {
  // intentional no-op in Phase A
  void event;
  void payload;
}
```

---

## Section 3 — Repository Layer

### `erp/src/lib/repositories/notes_repo.ts`

```typescript
// Pure DB operations — no business logic, no permission checks.

export interface NoteRow {
  id:               number;
  transaction_type: TransactionType;
  transaction_id:   number;
  admin_id:         number;
  content:          string;
  created_at:       string;
  updated_at:       string;
}

export async function dbCreateNote(data: {
  transaction_type: TransactionType;
  transaction_id:   number;
  admin_id:         number;
  content:          string;
}): Promise<NoteRow>

export async function dbUpdateNote(noteId: number, content: string): Promise<NoteRow>

export async function dbSoftDeleteNote(noteId: number): Promise<void>
// Sets deleted_at = NOW() — does NOT physically delete.

export async function dbListNotes(
  transaction_type: TransactionType,
  transaction_id:   number,
): Promise<NoteRow[]>
// WHERE deleted_at IS NULL, ORDER BY created_at ASC

export async function dbGetNoteById(noteId: number): Promise<NoteRow | null>
// Includes soft-deleted rows (for ownership checks before delete)
```

### `erp/src/lib/repositories/audit_repo.ts` — Backward-compatible extension

```typescript
// Existing logAudit() — signature extended with optional description only:
export async function logAudit(data: {
  admin_id:    number;
  action:      string;
  target_type: string;
  target_id?:  number | null;
  old_value?:  Record<string, unknown> | null;
  new_value?:  Record<string, unknown> | null;
  description?: string;   // ← NEW optional field; all existing callers unaffected
}): Promise<void>

// NEW function — does not replace getAuditLogs():
export async function getAuditLogsByTarget(opts: {
  target_type: string;
  target_id:   number;
  page:        number;     // 1-based
  pageSize:    number;     // default 20
}): Promise<{ data: AuditLog[]; total: number }>
```

---

## Section 4 — Transaction Modules

### `erp/src/lib/transactions/transaction_audit.ts`

Wraps `logAudit()` with `TransactionAuditPayload`. Single call site for transaction audit entries.

```typescript
export async function recordTransactionAudit(payload: TransactionAuditPayload): Promise<void>
// Calls logAudit({ action: payload.event, target_type: payload.transactionType,
//   target_id: payload.transactionId, description: payload.description,
//   new_value: payload.metadata ?? null, admin_id: payload.adminId })
```

### `erp/src/lib/transactions/transaction_notes.ts`

Orchestration: `notes_repo` + `recordTransactionAudit` + `emitTransactionEvent`. No permission checks here — those live in API routes.

```typescript
export async function createNote(params: {
  adminId:         number;
  transactionType: TransactionType;
  transactionId:   number;
  content:         string;
}): Promise<NoteRow>
// 1. dbCreateNote()
// 2. recordTransactionAudit(INTERNAL_NOTE_CREATED)
// 3. emitTransactionEvent(INTERNAL_NOTE_CREATED, { noteId, transactionType, transactionId })

export async function updateNote(params: {
  adminId: number;
  noteId:  number;
  content: string;
}): Promise<NoteRow>
// 1. Verify note exists (dbGetNoteById)
// 2. dbUpdateNote()
// 3. recordTransactionAudit(INTERNAL_NOTE_UPDATED)
// 4. emitTransactionEvent(...)

export async function deleteNote(params: {
  adminId: number;
  noteId:  number;
}): Promise<void>
// 1. Verify note exists
// 2. dbSoftDeleteNote()
// 3. recordTransactionAudit(INTERNAL_NOTE_DELETED)
// 4. emitTransactionEvent(...)

export async function listNotes(params: {
  transactionType: TransactionType;
  transactionId:   number;
}): Promise<NoteRow[]>
// dbListNotes() — no side effects
```

### `erp/src/lib/transactions/index.ts`

```typescript
export * from './transaction_events';
export * from './transaction_audit';
export * from './transaction_notes';
```

---

## Section 5 — API Layer

All routes follow existing pattern: `requirePermission()` → service call → JSON response.

### `GET /api/transactions/[type]/[id]/notes`

Permission: `transaction.notes.view`  
Response: `{ notes: NoteRow[] }`

### `POST /api/transactions/[type]/[id]/notes`

Permission: `transaction.notes.create`  
Body: `{ content: string }`  
Response: `{ note: NoteRow }`

### `PUT /api/transactions/[type]/[id]/notes/[noteId]`

Permission: `transaction.notes.edit`  
Body: `{ content: string }`  
Response: `{ note: NoteRow }`

### `DELETE /api/transactions/[type]/[id]/notes/[noteId]`

Permission: `transaction.notes.delete`  
Response: `{ ok: true }` (soft delete)

### `GET /api/transactions/[type]/[id]/timeline`

Permission: `transaction.timeline.view`  
Query: `?page=1&pageSize=20`  
Response: `{ items: TimelineItem[]; total: number; page: number; pageSize: number }`

**TimelineItem ViewModel** (never exposes raw audit_logs columns):

```typescript
interface TimelineItem {
  id:          number;
  event:       string;          // e.g. "DEPOSIT_APPROVED"
  description: string;          // human-readable
  adminName:   string | null;   // joined from admins table
  metadata:    Record<string, unknown> | null;
  createdAt:   string;          // ISO 8601
}
```

---

## Section 6 — Permission Defaults

| Role | notes.view | notes.create | notes.edit | notes.delete | timeline.view |
|------|-----------|--------------|------------|--------------|---------------|
| CS | ✗ | ✗ | ✗ | ✗ | ✗ |
| SUPPORT | ✓ | ✓ | ✓ | ✗ | ✓ |
| FINANCE | ✓ | ✓ | ✓ | ✗ | ✓ |
| SUPERVISOR | ✓ | ✓ | ✓ | ✓ | ✓ |
| ADMIN | ✓ | ✓ | ✓ | ✓ | ✓ |
| SUPER_ADMIN | ✓ (bypass) | ✓ | ✓ | ✓ | ✓ |

Defaults can be changed via ERP Settings → Permissions page.

---

## Testing Checklist

### DB / Migration
- [ ] Migration 082 runs cleanly on fresh DB
- [ ] Migration 082 is idempotent (safe to run twice)
- [ ] `transaction_internal_notes` rows with `deleted_at` are excluded from list queries
- [ ] `audit_logs.description` column exists and existing rows have NULL (no regression)
- [ ] `idx_audit_logs_target` index present

### Notes API
- [ ] `GET /notes` returns only non-deleted notes for correct transaction
- [ ] `POST /notes` creates note, logs audit with event `INTERNAL_NOTE_CREATED`
- [ ] `PUT /notes/[id]` updates content, logs audit
- [ ] `DELETE /notes/[id]` sets `deleted_at`, note no longer appears in list
- [ ] Permission denied returns 401/403
- [ ] Invalid `[type]` param (not `deposit`/`withdrawal`) returns 400

### Timeline API
- [ ] Returns `TimelineItem[]` — no raw audit_log columns exposed
- [ ] Pagination: `?page=2&pageSize=5` returns correct slice
- [ ] `total` count is accurate
- [ ] `adminName` is populated (joined from admins)
- [ ] Returns empty list when no audit entries exist (not 404)

### Backward Compatibility
- [ ] Deposit approve flow works end-to-end unchanged
- [ ] Deposit reject flow works unchanged
- [ ] Withdrawal approve/reject/paid flows work unchanged
- [ ] SSE deposit stream (`/api/deposits/stream`) still works
- [ ] Existing audit entries still appear in `/api/audit`
- [ ] `logAudit()` without `description` still works (no crash)

---

## Deployment Steps

1. Run `npm run build` — verify no TS errors
2. Apply migration 082 to staging DB
3. Deploy to staging, verify all existing flows
4. Test Notes and Timeline APIs via ERP (or curl)
5. Apply migration 082 to production DB
6. Deploy to production
7. Verify existing transaction workflows in production (smoke test)

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Migration 082 alters `audit_logs` (ADD COLUMN) | Low | `ADD COLUMN IF NOT EXISTS` is non-blocking; NULL default |
| New index on `audit_logs` (large table) | Medium | `CREATE INDEX IF NOT EXISTS` — create CONCURRENTLY in production if table is large |
| Permission seed conflicts | Low | `ON CONFLICT DO NOTHING` — safe to re-run |
| Soft delete logic not filtering correctly | Medium | Covered by partial index + WHERE clause in repo |
| No existing route touched | None | Phase A is additive only — zero regression risk from route changes |

---

## Phase B — Transaction Detail V2

### Goals
Redesign the Transaction Detail page into a professional enterprise layout. Add receipt preview, member history, timeline UI, and internal notes UI. Migrate `approve/reject/process` routes to call `TransactionService` helper methods.

### Backward Compatibility
All existing approve/reject/process API routes continue to work. Phase B wraps their shared logic inside `TransactionService` methods without changing external behavior or response format.

### DB Changes — Migration 083
No new tables required. Potential additions only if audit trail for receipt views is needed:
```sql
-- Optional: track receipt view events (Phase B may log via audit_logs only)
-- If receipt_viewed_at is needed on deposit_requests:
ALTER TABLE deposit_requests ADD COLUMN IF NOT EXISTS receipt_viewed_at TIMESTAMPTZ;
```

### Architecture Reuse
| Feature | Existing Infrastructure | Reuse |
|---------|------------------------|-------|
| Receipt Preview | `/api/deposits/[id]/receipt/route.ts` already serves via Media Library | ✅ No new backend — frontend only |
| Member Summary Stats | `deposit_requests`, `withdrawal_requests`, `users.balance` | ✅ New API: `GET /api/members/[id]/transaction-summary` |
| Deposit/Withdraw History | Existing deposit/withdrawal APIs | ✅ Reuse with `user_id` filter |
| Timeline UI | Phase A `GET /api/transactions/[type]/[id]/timeline` | ✅ Phase A API consumed by Phase B UI |
| Internal Notes UI | Phase A `GET/POST/PUT/DELETE /api/transactions/[type]/[id]/notes` | ✅ Phase A API consumed by Phase B UI |
| Audit logging | Phase A `recordTransactionAudit()` | ✅ Call on receipt view |

### New API — Migration 083
```
GET /api/members/[id]/transaction-summary
```
Returns:
```typescript
{
  total_deposit:      number;  // sum of APPROVED deposit amounts
  total_withdrawal:   number;  // sum of PAID withdrawal amounts
  available_balance:  number;  // users.balance
  last_deposit_at:    string | null;
  last_withdrawal_at: string | null;
}
```

### Detail Page Sections (UI)
1. **Member Information** — name, member ID, username, phone, balance, VIP, register date, View Profile button
2. **Transaction Information** — ID, amount, bonus, promotion, reference, status, timestamps
3. **Bank Information** — customer bank, company bank, account number, account holder
4. **Payment Receipt** — thumbnail preview, click to enlarge, open in tab, download (PNG/JPG/JPEG/WEBP/PDF)
5. **Approval Information** — approved/rejected by, timestamps, reject reason, internal note
6. **Timeline** — chronological event list from Phase A API
7. **Internal Notes** — add/edit/delete panel from Phase A API
8. **Member Transaction History** — summary stats + latest 10 deposits + latest 10 withdrawals + "View Full" button

### Permissions (Phase B additions)
```
transaction.receipt.view      — view receipt preview
transaction.receipt.download  — download receipt
```

### Estimated Complexity: Large (4–5 days)

---

## Phase C — Search & Advanced Filters

### Goals
Add multi-field search and advanced filter panel to the Transaction list page.

### DB Changes — Migration 084
```sql
-- Enable trigram search for partial matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN indexes on searchable text columns
CREATE INDEX IF NOT EXISTS idx_deposit_requests_search
  ON deposit_requests USING gin(
    (COALESCE(reference_number, '') || ' ' || COALESCE(notes, '')) gin_trgm_ops
  );

-- Index for join-based search on users
CREATE INDEX IF NOT EXISTS idx_users_search
  ON users USING gin(
    (username || ' ' || COALESCE(full_name, '') || ' ' || COALESCE(phone, '')) gin_trgm_ops
  );
```

### New API
```
GET /api/transactions/search?q=&type=&status=&dateFrom=&dateTo=&amountMin=&amountMax=&page=1&pageSize=20
```
Searchable fields:
- Transaction ID · Deposit ID · Withdraw ID
- Member ID · Public Member ID
- Username · Member Name · Phone Number
- Reference Number · Bank Account Number · Bank Account Name · Bank Name
- Status · Date Range · Amount Range

### Architecture Reuse
- Existing `deposit_requests` and `withdrawal_requests` tables — no schema changes
- Existing permission: `deposit.view` / `withdrawal.view`
- `pg_trgm` for partial matching on text fields

### Estimated Complexity: Medium (2–3 days)

---

## Phase D — Withdraw Realtime Notification

### Goals
Mirror the existing Deposit SSE realtime system for Withdrawal requests. 100% reuse of deposit pattern.

### DB Changes — Migration 085
```sql
-- Unread column for ERP badge count
ALTER TABLE withdrawal_requests
  ADD COLUMN IF NOT EXISTS erp_unread BOOLEAN NOT NULL DEFAULT false;

-- PostgreSQL NOTIFY trigger (mirrors notify_new_deposit from migration 050)
CREATE OR REPLACE FUNCTION notify_new_withdrawal()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'PENDING' THEN
    NEW.erp_unread := true;
    PERFORM pg_notify('withdrawal_updates', json_build_object(
      'type',    'new_withdrawal',
      'id',      NEW.id,
      'user_id', NEW.user_id
    )::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_withdrawal_insert ON withdrawal_requests;
CREATE TRIGGER on_withdrawal_insert
  BEFORE INSERT ON withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION notify_new_withdrawal();
```

### New API Routes (mirrors deposit SSE pattern exactly)
```
GET /api/withdrawals/stream   — SSE: LISTEN withdrawal_updates (mirrors /api/deposits/stream)
GET /api/withdrawals/unread   — unread count (mirrors /api/deposits/unread)
PUT /api/withdrawals/unread   — mark all read
```

### ERP UI Changes
- Transaction list: new withdraw SSE connection alongside existing deposit SSE
- On `new_withdrawal` event: play notification sound + increment badge + prepend row
- Unread badge on "Withdrawals" tab/section (mirrors deposit badge)
- `emitTransactionEvent(WITHDRAW_CREATED, ...)` called in Phase D (wires Phase A placeholder)

### Future WebSocket-ready
`emitTransactionEvent()` placeholder (added in Phase A) becomes the hook point. Phase D wires SSE; a future WebSocket upgrade only changes the emitter, not Notes or Audit code.

### Architecture Reuse
| Component | Source | Reuse |
|-----------|--------|-------|
| SSE stream handler | `/api/deposits/stream/route.ts` | ✅ Copy pattern, change channel name |
| Unread API | `/api/deposits/unread/route.ts` | ✅ Copy pattern |
| Notification sound | Existing deposit sound asset | ✅ Same asset |
| LISTEN/NOTIFY | PostgreSQL, migration 050 pattern | ✅ New trigger only |

### Estimated Complexity: Small (1–2 days)

---

## Full Migration Plan Summary

| Migration | Phase | Content |
|-----------|-------|---------|
| 082 | A | `transaction_internal_notes` · `audit_logs.description` · target index · permission seed |
| 083 | B | `receipt_viewed_at` on deposit_requests (optional) |
| 084 | C | `pg_trgm` extension · GIN search indexes |
| 085 | D | `withdrawal_requests.erp_unread` · `notify_new_withdrawal()` trigger |

---

## Full Backward Compatibility Guarantee

Every existing production flow is unaffected across all phases:

| Flow | Phase A | Phase B | Phase C | Phase D |
|------|---------|---------|---------|---------|
| Website Deposit | ✅ Unchanged | ✅ Unchanged | ✅ Unchanged | ✅ Unchanged |
| Website Withdrawal | ✅ Unchanged | ✅ Unchanged | ✅ Unchanged | ✅ Trigger added (additive) |
| ERP Deposit approve/reject | ✅ Unchanged | ✅ Unchanged | ✅ Unchanged | ✅ Unchanged |
| ERP Withdrawal approve/reject | ✅ Unchanged | ✅ Unchanged | ✅ Unchanged | ✅ Unchanged |
| Balance updates | ✅ Unchanged | ✅ Unchanged | ✅ Unchanged | ✅ Unchanged |
| Existing audit logs | ✅ Extended (additive) | ✅ Unchanged | ✅ Unchanged | ✅ Unchanged |
| Media Library | ✅ Unchanged | ✅ Read-only reuse | ✅ Unchanged | ✅ Unchanged |
| Deposit SSE stream | ✅ Unchanged | ✅ Unchanged | ✅ Unchanged | ✅ Unchanged |
