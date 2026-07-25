# Transaction Module V2 — Phase B Design
# ERP Transaction Detail UX / Architecture

**Date:** 2026-07-25
**Phase A Tag:** `v2-phase-a-foundation` (commit d2b5160)
**Status:** Design — Pending Approval

---

## Design Philosophy

> Transaction Detail is a **Transaction Workspace**, not a read-only detail page.
> ERP is an Operation Console. CS/Finance/Admin open a transaction and stay for
> several minutes to handle it. The layout must allow:
> - Viewing transaction info (left)
> - Reading Timeline (right)
> - Writing Internal Notes (right)
> All simultaneously — no tab switching.

---

## Section 1 — Information Architecture

### Left Panel (Master) — Fixed Info

| Block | Content |
|-------|---------|
| **TransactionHeader** | Transaction ID, Type Badge, Created At, Back link |
| **StatusCard** | Current status badge, Processing by/at, Approved/Rejected by/at |
| **MemberCard** | first_name, phone, public_id, Balance |
| **PaymentCard** | Deposit: amount/bonus/credit/promo/receiving_bank/QR; Withdrawal: amount/provider/game_username/bank |
| **WalletCard** | available_balance (inside MemberCard) |
| **TurnoverCard** | Withdrawal only: active turnover required/completed (progress bar) |
| **ReceiptCard** | Withdrawal only: upload/view receipt |
| **ActionPanel** | Approve / Reject / Hold (sticky, always visible) |

### Right Panel (Workspace) — Work Area

| Block | Content |
|-------|---------|
| **TimelinePanel** | Audit timeline, paginated Load More |
| **NotesPanel** | Internal Notes full CRUD |
| *(future)* | AuditPanel / RiskPanel / AttachmentPanel / Provider Logs |

---

## Section 2 — ASCII Wireframes

### Desktop (≥1280px) — Master + Workspace

```
┌──────────────────────────────────┬───────────────────────────────────────────┐
│ ← Back to Transactions           │  W O R K S P A C E                       │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │                                           │
│ #1234  [DEPOSIT]  [PROCESSING]   │ ┌── TIMELINE ───────────────────────────┐ │
│ Created: 25 Jul 2026, 14:30      │ │                                       │ │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ │ ● DEPOSIT_APPROVED                   │ │
│                                  │ │   Admin01 · 2m ago                    │ │
│ STATUS                           │ │   "Approved after verification"       │ │
│ ● PROCESSING                     │ │                                       │ │
│ Processing by: CS_01             │ │ ● DEPOSIT_PROCESSING                  │ │
│ Since: 5 mins ago                │ │   CS_01 · 5m ago                      │ │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ │   "Started processing"               │ │
│                                  │ │                                       │ │
│ MEMBER                           │ │ ● DEPOSIT_CREATED                     │ │
│ John Tan                         │ │   System · 10m ago                    │ │
│ +6012-3456789                    │ │   "Member submitted deposit"          │ │
│ ID: USR-00123                    │ │                                       │ │
│ Balance: RM 1,250.00             │ │             [ Load More ]             │ │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ └───────────────────────────────────────┘ │
│                                  │                                           │
│ TRANSACTION                      │ ┌── INTERNAL NOTES ─────────────────────┐ │
│ Amount:  RM 500.00               │ │                                       │ │
│ Bonus:  +RM 50.00                │ │ ┌─────────────────────────────────┐   │ │
│ Credit:  RM 550.00               │ │ │ Admin01  ·  2m ago    [✎] [✕]  │   │ │
│ Promo:   Welcome Bonus           │ │ │ Member confirmed via Telegram.  │   │ │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ │ └─────────────────────────────────┘   │ │
│                                  │ │                                       │ │
│ PAYMENT BANK                     │ │ ┌─────────────────────────────────┐   │ │
│ Maybank                          │ │ │ CS_01  ·  5m ago                │   │ │
│ Acc: 1234-5678-9012              │ │ │ Waiting for bank confirmation.  │   │ │
│ Holder: John Tan                 │ │ └─────────────────────────────────┘   │ │
│ [View QR Code ↗]                 │ │                                       │ │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ │ ┌─── Add Note ──────────────────┐    │ │
│                                  │ │ │                               │    │ │
│ ┌── ACTIONS ─────────────────┐   │ │ │  Type your note here...       │    │ │
│ │                            │   │ │ │                               │    │ │
│ │  [✓  Approve    ]          │   │ │ └───────────────────────────────┘    │ │
│ │  [✕  Reject     ]          │   │ │  Ctrl+Enter to submit  (0/2000)     │ │
│ │  [⏸  Hold       ]          │   │ │                    [➕ Add Note]     │ │
│ │                            │   │ └───────────────────────────────────────┘ │
│ └────────────────────────────┘   │                                           │
│  (sticky — always visible)       │  *(Future: AuditPanel / RiskPanel)*       │
└──────────────────────────────────┴───────────────────────────────────────────┘
  35-40% width (position: sticky)    60-65% width (independent scroll)
```

### Tablet (768px – 1279px)

```
┌────────────────────────────────────────────────────────────────┐
│ ← Back    #1234  [DEPOSIT]  [PROCESSING]                       │
├────────────────────────────────────────────────────────────────┤
│  MEMBER               │  TRANSACTION          │  ACTIONS       │
│  John Tan             │  RM 500.00            │  [✓ Approve]  │
│  +6012-3456789        │  +RM 50.00 bonus      │  [✕ Reject]   │
│  Balance: RM 1,250    │  Promo: Welcome       │  [⏸ Hold]     │
│                       │  Credit: RM 550.00    │               │
├───────────────────────┴───────────────────────┴────────────────┤
│  PAYMENT BANK                                                  │
│  Maybank  ·  1234-5678-9012  ·  John Tan  [View QR ↗]         │
├────────────────────────────────────────────────────────────────┤
│  TIMELINE                                                      │
│  ● DEPOSIT_APPROVED  ·  Admin01  ·  2m ago                     │
│    "Approved after verification"                               │
│  ● DEPOSIT_PROCESSING  ·  CS_01  ·  5m ago                     │
│  ● DEPOSIT_CREATED  ·  System  ·  10m ago                      │
│                                  [ Load More ]                 │
├────────────────────────────────────────────────────────────────┤
│  INTERNAL NOTES                                                │
│  ┌──────────────────────────────────────────────────────┐      │
│  │ Admin01  ·  2m ago                        [✎]  [✕]  │      │
│  │ Member confirmed via Telegram.                        │      │
│  └──────────────────────────────────────────────────────┘      │
│  ┌────────────────────────────────────────────────────┐        │
│  │  Type your note...                  [➕ Add Note]  │        │
│  └────────────────────────────────────────────────────┘        │
└────────────────────────────────────────────────────────────────┘
```

### Mobile (<768px)

```
┌──────────────────────────┐
│ ←  #1234  [DEPOSIT]      │
│          [PROCESSING]    │
├──────────────────────────┤
│ MEMBER                   │
│ John Tan                 │
│ +6012-3456789            │
│ RM 1,250.00 balance      │
├──────────────────────────┤
│ TRANSACTION              │
│ Amount:  RM 500.00       │
│ Bonus:  +RM 50.00        │
│ Credit:  RM 550.00       │
│ Promo:   Welcome Bonus   │
├──────────────────────────┤
│ PAYMENT BANK             │
│ Maybank                  │
│ 1234-5678-9012           │
│ John Tan  [View QR ↗]    │
├──────────────────────────┤
│ ACTIONS                  │
│ [ ✓  Approve  ]          │
│ [ ✕  Reject   ]          │
│ [ ⏸  Hold     ]          │
│ Processed by: CS_01      │
├──────────────────────────┤
│ TIMELINE                 │
│ ● DEPOSIT_APPROVED       │
│   Admin01 · 2m ago       │
│   "Approved..."          │
│ ● DEPOSIT_PROCESSING     │
│   CS_01 · 5m ago         │
│ ● DEPOSIT_CREATED        │
│   System · 10m ago       │
│     [ Load More ]        │
├──────────────────────────┤
│ INTERNAL NOTES           │
│ ┌──────────────────────┐ │
│ │Admin01 · 2m ago [✎✕]│ │
│ │Member confirmed...   │ │
│ └──────────────────────┘ │
│ ┌──────────────────────┐ │
│ │ Type note...         │ │
│ └──────────────────────┘ │
│ (0/2000)  [➕ Add Note] │
└──────────────────────────┘
```

---

## Section 3 — Component Design

### Left Panel Components

| Component | Responsibility | Key Props |
|-----------|---------------|-----------|
| `TransactionHeader` | ID / Type Badge / Created At / Back link | `id, type, createdAt` |
| `TransactionTypeBadge` | `[DEPOSIT]` / `[WITHDRAWAL]` colored badge | `type` |
| `TransactionStatusBadge` | Status colored badge | `status` |
| `StatusCard` | Full status card with processing/approved/rejected by & at | `detail` |
| `MemberCard` | Member info + balance | `detail` |
| `PaymentCard` | Deposit/withdrawal payment info (conditional render) | `detail` |
| `ReceiptCard` | Receipt upload/view (withdrawal only) | `detail, onUpload` |
| `TurnoverCard` | Bonus turnover progress bar (withdrawal only) | `required, completed` |
| `ActionPanel` | Approve/Reject/Hold action area (sticky) | `detail, meId, onAction` |
| `RejectModal` | Reject reason modal (existing — reuse) | `onSubmit, onClose` |

### Right Panel (Workspace) Components

| Component | Responsibility | Key Props |
|-----------|---------------|-----------|
| `WorkspacePanel` | Right panel container (future-extensible) | `children` |
| `TimelinePanel` | Timeline panel with header + list + pagination | `type, id` |
| `TimelineItem` | Single timeline event row | `item: TimelineItem` |
| `TimelineEventBadge` | Event type colored badge | `event` |
| `NotesPanel` | Notes panel with header + list + editor | `type, id, permissions` |
| `NoteCard` | Single note card with Edit/Delete buttons | `note, canEdit, canDelete, onEdit, onDelete` |
| `NoteEditor` | New note textarea | `onSubmit, onCancel?` |
| `InlineNoteEditor` | In-card edit mode | `note, onSave, onCancel` |

### Shared UI Components

| Component | Responsibility |
|-----------|---------------|
| `EmptyState` | Empty timeline / empty notes state |
| `LoadingSkeleton` | Skeleton loading (Timeline / Notes) |
| `ErrorState` | Error state + Retry button |
| `ConfirmDialog` | Delete confirmation modal (destructive) |
| `Toast` | Operation feedback (success / error / info) |
| `PermissionGuard` | Conditionally render based on permission |

### Future Reserved Components (Phase C/D/E)

```
RiskPanel       — Risk score / risk flags
AuditPanel      — Full audit_logs viewer
AttachmentPanel — Attachment management
ProviderLogsPanel — Game provider request/response logs
AIPanel         — AI suggestions (future)
```

---

## Section 4 — Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  ERP Browser (Next.js Client Component)                         │
│                                                                 │
│  useEffect → fetch('/api/transactions/{type}/{id}')             │
│  useEffect → fetch('/api/transactions/{type}/{id}/notes')       │
│  useEffect → fetch('/api/transactions/{type}/{id}/timeline')    │
│                                                                 │
│  Three fetches run in parallel, each with independent           │
│  loading / error state. Left panel not blocked by right panel.  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP fetch
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Next.js API Routes (App Router)                                │
│                                                                 │
│  1. requirePermission(permission)                               │
│     → JWT cookie → verifyJWT → can(role, permission)            │
│     → permission_engine (30s cache) → permissions_repo → DB    │
│                                                                 │
│  2. Input validation (type, id, noteId, content)                │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Service Layer (/lib/transactions/)                             │
│                                                                 │
│  createNote()  → dbCreateNote → recordTransactionAudit          │
│                  → emitTransactionEvent (Phase A no-op)         │
│  updateNote()  → dbUpdateNote → recordTransactionAudit          │
│  deleteNote()  → dbSoftDeleteNote → recordTransactionAudit      │
│  listNotes()   → dbListNotes (read-only, no side effects)       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Repository Layer (/lib/repositories/)                          │
│                                                                 │
│  notes_repo.ts    — transaction_internal_notes CRUD             │
│  audit_repo.ts    — audit_logs INSERT + getAuditLogsByTarget    │
│  permissions_repo — role_permissions SELECT                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │ pool.query($1, $2, ...)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  PostgreSQL                                                     │
│                                                                 │
│  transaction_internal_notes  (Phase A, migration 082)           │
│  audit_logs                  (Phase A, description column)      │
│  deposit_requests            (existing)                         │
│  withdrawal_requests         (existing)                         │
│  users                       (existing)                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Section 5 — Permission Matrix

### Phase A Permissions (migration 082 — already seeded)

| Permission | SUPER_ADMIN | ADMIN | SUPERVISOR | FINANCE | SUPPORT | CS |
|------------|:-----------:|:-----:|:----------:|:-------:|:-------:|:--:|
| `transaction.timeline.view` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `transaction.notes.view` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `transaction.notes.create` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `transaction.notes.edit` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `transaction.notes.delete` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |

> CS role: all Phase A permissions are FALSE by default in migration 082.
> SUPPORT/FINANCE: view/create/edit = TRUE, delete = FALSE.
> SUPERVISOR/ADMIN: all TRUE.
> SUPER_ADMIN: bypasses permission check entirely.

### UI Layer Behavior

```
TimelinePanel:
  Has transaction.timeline.view → render panel
  No permission → entire panel hidden (no 403 message shown)

NotesPanel:
  Has transaction.notes.view   → render note list
  Has transaction.notes.create → render NoteEditor
  Has transaction.notes.edit   → show [✎] on each NoteCard
  Has transaction.notes.delete → show [✕] on each NoteCard
  No transaction.notes.view    → entire panel hidden

Edit ownership:
  API layer: validates note belongs to the transaction (type/id match)
  API layer: does NOT enforce admin_id ownership — any admin with edit
             permission can edit any note (by design — operational flexibility)

WorkspacePanel with both panels hidden → show placeholder:
  "You don't have permission to view this section."
```

---

## Section 6 — API Mapping

| Component | API Endpoint | Repository Function | Permission |
|-----------|-------------|-------------------|------------|
| `TransactionHeader` + `StatusCard` + `MemberCard` + `PaymentCard` | `GET /api/transactions/{type}/{id}` | Direct SQL (existing) | `deposit.view` / `withdraw.view` |
| `TimelinePanel` | `GET /api/transactions/{type}/{id}/timeline?page=1&pageSize=20` | `audit_repo.getAuditLogsByTarget()` | `transaction.timeline.view` |
| `NotesPanel` (list) | `GET /api/transactions/{type}/{id}/notes` | `notes_repo.dbListNotes()` | `transaction.notes.view` |
| `NoteEditor` (create) | `POST /api/transactions/{type}/{id}/notes` | `notes_repo.dbCreateNote()` | `transaction.notes.create` |
| `InlineNoteEditor` (update) | `PUT /api/transactions/{type}/{id}/notes/{noteId}` | `notes_repo.dbUpdateNote()` | `transaction.notes.edit` |
| `NoteCard` (delete) | `DELETE /api/transactions/{type}/{id}/notes/{noteId}` | `notes_repo.dbSoftDeleteNote()` | `transaction.notes.delete` |
| `ActionPanel` (approve) | `POST /api/deposits/{id}/approve` or `withdrawals/{id}/approve` | existing | existing |
| `ActionPanel` (reject) | `POST /api/deposits/{id}/reject` or `withdrawals/{id}/reject` | existing | existing |
| `ReceiptCard` (upload) | `POST /api/withdrawals/{id}/receipt` | existing | existing |

---

## Section 7 — Interaction Design

### Add Note

```
User clicks NoteEditor textarea
→ Types content
→ Character count updates live (bottom-right "x/2000")
→ [Add Note] button / Ctrl+Enter to submit
→ Button shows "Adding..." loading state
→ API POST success → clear textarea → prepend note to list → "Note added" Toast
→ API POST failure → "Failed to add note" Error Toast → content preserved
```

### Edit Note

```
User clicks [✎] on NoteCard
→ NoteCard switches to InlineNoteEditor (textarea pre-filled with content)
→ Other [✎] buttons disabled (one edit at a time)
→ User modifies → clicks [Save] / Ctrl+Enter
→ API PUT success → InlineNoteEditor collapses → NoteCard shows new content → "Note updated" Toast
→ API PUT failure → "Failed to update note" Error Toast → exit edit mode, content reverts
→ User clicks [Cancel] → InlineNoteEditor collapses, content reverts

Note: API does NOT enforce per-admin ownership. Any admin with transaction.notes.edit
permission can edit any note in the transaction (by design). 403 from PUT means the
note's transaction_type/id does not match the URL — a system inconsistency that should
not happen in normal operation.
```

### Delete Note

```
User clicks [✕] on NoteCard
→ ConfirmDialog appears:
    Title: "Delete Note"
    Body:  "This note will be permanently deleted."
    [Cancel]  [Delete] (destructive red)
→ Click Cancel → dialog closes, no action
→ Click Delete → API DELETE request
    → success → dialog closes → NoteCard removed (fade-out) → "Note deleted" Toast
    → failure → dialog closes → "Failed to delete note" Error Toast
```

### Timeline Load More

```
Initial load:
  Auto-fetch page=1, pageSize=20
  Show LoadingSkeleton (3 placeholder rows)
  Success → render TimelineItem list
  Failure → ErrorState with Retry button

Load More:
  User clicks [Load More]
  → Button becomes "Loading..." (disabled)
  → Fetch page=N+1 (cumulative, not replace)
  → Success → new items appended to bottom
  → If all loaded (items.length >= total) → hide [Load More] button
  → Failure → "Failed to load more" Toast

Manual Refresh:
  [↺ Refresh] icon in TimelinePanel header
  → Reset to page=1, replace list
```

### Empty States

```
Timeline empty:
  Icon + "No timeline events yet."

Notes empty (has create permission):
  Icon + "No notes yet. Add the first note below."

Notes empty (no create permission):
  Icon + "No notes yet."
```

### Error States (component-level, not full page)

```
TimelinePanel load failure:
  "⚠ Failed to load timeline."  [Retry]

NotesPanel load failure:
  "⚠ Failed to load notes."  [Retry]

Main transaction detail failure:
  Full page error (existing behavior preserved)
```

### Toast Spec

```
Position: bottom-right, fixed, z-index: 9999
Types: success (green) / error (red) / info (blue)
Duration: 3s auto-dismiss (error: 5s)
Multiple toasts stack vertically
aria-live: "polite" (success/info) / "assertive" (error)
```

### Confirmation Dialog Spec

```
Position: centered modal with backdrop
Content: title + description + [Cancel] + [Confirm (destructive)]
Keyboard: Esc → Cancel; Enter → does NOT auto-confirm (prevents accidental delete)
Focus trap: Tab cycles only between [Cancel] and [Confirm]
On open: focus moves to [Cancel]
On close: focus returns to trigger element ([✕] button)
```

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `N` | Focus NoteEditor textarea |
| `Ctrl + Enter` | Submit note (add or edit) |
| `Esc` | Close InlineNoteEditor / close ConfirmDialog |
| `Tab` | Standard order: Left panel → ActionPanel → Timeline → Notes |

---

## Section 8 — Performance Design

### Timeline

```
Strategy:      "Load More" pagination (not Infinite Scroll)
Initial fetch: page=1, pageSize=20
Per load more: +20 items, append to list (do not replace)
API cap:       pageSize max = 100 (already enforced in API layer)
Virtual list:  Not needed (expected < 200 items per transaction)
Polling:       None (timeline events are immutable; Manual Refresh available)
```

### Notes

```
Strategy:      Load all at once (typically < 50 per transaction)
Optimistic updates:
  POST success → prepend to list immediately (no re-fetch)
  DELETE success → remove from list immediately (no re-fetch)
  PUT success → update NoteCard content immediately (no re-fetch)
  (Reduces API calls, improves perceived performance)
Failure rollback:
  POST failure → remove optimistic item, restore textarea content
  DELETE failure → restore NoteCard to list
  PUT failure → restore original content
```

### Three Parallel Fetches on Mount

```
Page mounts → three concurrent fetches:
  1. fetchDetail()    → main transaction data (left panel)
  2. fetchTimeline()  → timeline events (right panel, section 1)
  3. fetchNotes()     → notes list (right panel, section 2)

Each has independent loading/error state.
Left panel not blocked by workspace panel failures.
```

---

## Section 9 — Accessibility

### Tab Order

```
Back Link
→ TransactionHeader
→ StatusCard
→ MemberCard (Member Link)
→ PaymentCard
→ ReceiptCard / TurnoverCard (if rendered)
→ ActionPanel [Approve] → [Reject] → [Hold]
→ TimelinePanel [↺ Refresh] → [Load More]
→ NotesPanel [✎ Edit] → [✕ Delete] (per card)
→ NoteEditor [textarea] → [Add Note]
```

### ARIA Labels

```tsx
// ActionPanel
<button aria-label="Approve transaction #1234">
<button aria-label="Reject transaction #1234">
<button aria-label="Hold transaction #1234">

// NoteCard
<button aria-label="Edit note">
<button aria-label="Delete note">

// ConfirmDialog
<div role="dialog" aria-modal="true" aria-labelledby="dialog-title">

// Toast container
<div aria-live="polite"> (success/info)
<div aria-live="assertive"> (error)

// Timeline list
<section aria-label="Transaction timeline">
  <ul role="list">
    <li role="listitem"> (each TimelineItem)

// Loading state
<div aria-busy="true" aria-label="Loading...">
```

### Focus Management

```
Open ConfirmDialog → focus moves to [Cancel]
Close ConfirmDialog → focus returns to [✕] trigger
Open InlineNoteEditor → focus moves to textarea
Close InlineNoteEditor → focus returns to [✎] trigger
Keyboard shortcut N → focus NoteEditor textarea
```

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  .note-card-exit { animation: none; }
  .timeline-item-enter { animation: none; }
}
```

---

## Section 10 — Implementation Plan

### Phase B-1 — Layout Redesign + Left Panel

**Goal:** Rewrite `transactions/[type]/[id]/page.tsx` with new dual-column
Master+Workspace layout. Implement all left panel cards. Right panel is
empty WorkspacePanel placeholder.

**No new APIs needed.** Uses existing `GET /api/transactions/{type}/{id}`.

**Files to create:**
```
erp/src/components/transactions/TransactionHeader.tsx
erp/src/components/transactions/StatusCard.tsx
erp/src/components/transactions/MemberCard.tsx
erp/src/components/transactions/PaymentCard.tsx
erp/src/components/transactions/ReceiptCard.tsx
erp/src/components/transactions/TurnoverCard.tsx
erp/src/components/transactions/ActionPanel.tsx
erp/src/components/transactions/WorkspacePanel.tsx
erp/src/components/ui/ConfirmDialog.tsx
erp/src/components/ui/Toast.tsx
```

**Files to modify:**
```
erp/src/app/(dashboard)/transactions/[type]/[id]/page.tsx  — complete rewrite
```

**Expected commits:**
- `feat(transaction-v2): add transaction component directory with left panel cards`
- `feat(transaction-v2): implement phase b-1 dual-column workspace layout`

**Migration:** None
**New API:** None

**Test scope:**
- Deposit detail renders all left panel cards correctly
- Withdrawal detail renders (including TurnoverCard, ReceiptCard)
- Approve / Reject / Hold actions work (regression)
- Receipt upload with Ctrl+V paste preserved (regression)
- Sticky ActionPanel visible when scrolling
- Desktop dual-column renders at ≥1280px
- Tablet layout renders at 768-1279px
- Mobile single-column renders at <768px

**Risks:**
- Ctrl+V clipboard paste for receipt must be preserved in ReceiptCard
- RejectModal prop drilling must remain correct (type/id)
- Sticky left panel CSS must not conflict with page header

---

### Phase B-2 — Timeline Panel

**Goal:** Implement TimelinePanel in WorkspacePanel, connected to
Phase A `GET /api/transactions/{type}/{id}/timeline`.

**Files to create:**
```
erp/src/components/transactions/TimelinePanel.tsx
erp/src/components/transactions/TimelineItem.tsx
erp/src/components/transactions/TimelineEventBadge.tsx
erp/src/components/transactions/EmptyState.tsx
erp/src/components/transactions/LoadingSkeleton.tsx
erp/src/components/transactions/ErrorState.tsx
```

**Expected commits:**
- `feat(transaction-v2): implement timeline panel with paginated load-more`

**Migration:** None
**New API:** None (Phase A `GET /timeline` already implemented)

**Test scope:**
- Loading skeleton → success renders timeline items
- Empty timeline → EmptyState renders
- Timeline load failure → ErrorState + Retry
- Load More appends items (page 2+)
- Load More hidden when all items loaded
- No `transaction.timeline.view` permission → panel not rendered
- Refresh button resets to page 1
- Tablet and mobile render correctly

**Risks:**
- Permission check strategy: call `/api/auth/me` on mount to get admin role,
  derive client-side panel visibility. API still enforces permission server-side.
- Timeline items may have `adminName: null` for system events — handle gracefully

---

### Phase B-3 — Notes Panel

**Goal:** Implement NotesPanel with full CRUD, permission gates,
keyboard shortcuts, optimistic updates, and toast feedback.

**Files to create:**
```
erp/src/components/transactions/NotesPanel.tsx
erp/src/components/transactions/NoteCard.tsx
erp/src/components/transactions/NoteEditor.tsx
erp/src/components/transactions/InlineNoteEditor.tsx
```

**Expected commits:**
- `feat(transaction-v2): implement notes panel with crud and permission gates`
- `feat(transaction-v2): add keyboard shortcuts and optimistic updates to notes`

**Migration:** None
**New API:** None (all Phase A Notes CRUD already implemented)

**Test scope:**
- Notes load (loading → success → empty state)
- Add Note: success (optimistic prepend + Toast), failure (rollback + Error Toast)
- Edit Note: inline editor opens, save success, save failure, cancel
- Delete Note: ConfirmDialog appears, confirm (remove + Toast), cancel (no-op)
- Permission gates:
  - No `notes.view` → panel hidden
  - No `notes.create` → NoteEditor hidden
  - No `notes.delete` → [✕] hidden on all cards
- Keyboard: N focuses textarea, Ctrl+Enter submits, Esc cancels
- Character count: 0/2000 → 2000/2000 (button disabled at limit)
- Optimistic rollback on failure

**Risks:**
- Optimistic update rollback logic needs careful state management
- One-at-a-time edit enforcement (multiple NoteCards must share edit state)
- Admin ID comparison requires `/api/auth/me` response (already used in existing page)

---

## Summary

```
Phase B-1: Layout + Left Panel   (no new API, pure UI refactor)
Phase B-2: Timeline Panel        (Phase A GET /timeline)
Phase B-3: Notes Panel           (Phase A Notes CRUD)

Total expected commits: 5–7
New migrations:         0
New APIs:               0
Modified APIs:          0
Backward compatible:    YES (all changes are UI layer only)
```

---

## Constraints (Permanent)

- Platform: SSWIN88/Tesla88 v1.0.0 — 绝不修改 `users.id`
- External integration layer (Provider API / Callback / Webhook) — 绝不修改
- `gp_credentials` AES-256-GCM encrypted — plaintext never returned from any API
- All reports and updates must be in Chinese
- BACKWARD COMPATIBILITY IS MANDATORY
