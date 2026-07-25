# Transaction Module V2 — Phase B Design
# ERP Transaction Detail UX / Architecture
# Revision 2

**Date:** 2026-07-25
**Revision:** 2 (post Design Review)
**Phase A Tag:** `v2-phase-a-foundation` (commit d2b5160)
**Status:** Design — Pending Final Approval

---

## Design Philosophy — Operation Workspace

> Transaction Detail is not a detail page.
> It is a **Transaction Operation Workspace**.

ERP is an Operation Console, not a CMS. CS / Finance / Supervisor / Admin
open a transaction and stay for several minutes — sometimes ten or more —
while handling it.

The Workspace must enable the operator to:

1. **Inspect** — View all transaction data, member info, payment details
2. **Understand** — Read the full audit Timeline in chronological order
3. **Annotate** — Write, edit, and delete Internal Notes in context
4. **Act** — Approve, Reject, or Hold — without scrolling away from the data

All four activities happen **simultaneously in one screen**.
No tab switching. No page navigation. No losing context.

The left panel is the **Command Center** — fixed, sticky, always visible.
The right panel is the **Workspace** — a scrollable, extensible area that
grows with future features (Phase C: Audit/Risk, Phase D: Realtime,
Phase E: AI) without ever requiring a layout redesign.

---

## Implementation Constraints (Phase B — Hard Limits)

The following are strictly prohibited in Phase B:

| Prohibited | Reason |
|------------|--------|
| Modify Database schema | Phase A migration 082 is complete and sealed |
| Add new Migration files | No DB changes needed for UI layer |
| Modify Provider API / Callback / Webhook | External integration layer — permanent freeze |
| Modify Wallet logic | Out of scope |
| Modify Telegram Bot | Out of scope |
| Modify Website (public-facing) | Out of scope |
| Modify AES encryption | Out of scope |
| Modify `users.id` | Platform constraint — permanent |

**All Phase B work is ERP UI Layer only.**
API layer (Phase A) is complete. No new API routes. No modified routes.

---

## Section 1 — Information Architecture

### Left Panel (Master) — Fixed Info + Control Center

| Block | Content |
|-------|---------|
| **TransactionHeader** | Transaction ID, Type Badge, Created At, Back link |
| **StatusCard** | Current status badge, Processing by/at, Approved/Rejected by/at |
| **MemberCard** | first_name, phone, public_id, Balance |
| **PaymentCard** | Deposit: amount/bonus/credit/promo/receiving_bank/QR; Withdrawal: amount/provider/game_username/bank |
| **WalletCard** | available_balance (inside MemberCard) |
| **TurnoverCard** | Withdrawal only: active turnover required/completed (progress bar) |
| **ReceiptCard** | Withdrawal only: upload/view receipt |
| **ActionPanel** | Transaction Summary + Approve / Reject / Hold (sticky, buttons pinned to bottom) |

### Right Panel (Workspace) — Extensible Work Area

| Block | Phase | Content |
|-------|-------|---------|
| **TimelinePanel** | B-2 | Audit timeline, collapsible, paginated Load More, filter reserved |
| **NotesPanel** | B-3 | Internal Notes full CRUD, collapsible |
| **AuditPanel** | C | Full audit_logs viewer |
| **RiskPanel** | C | Risk score / flags |
| **AttachmentPanel** | C | Attachment management |
| **ProviderLogsPanel** | D | Game provider request/response logs |
| **AIPanel** | E | AI suggestions / risk score / fraud detection |

---

## Section 2 — ASCII Wireframes

### Desktop (≥1280px) — Master + Workspace

```
┌──────────────────────────────────┬───────────────────────────────────────────┐
│ ← Back to Transactions           │  W O R K S P A C E                       │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │                                           │
│ #1234  [DEPOSIT]  [PROCESSING]   │ ▼ TIMELINE                    [↺] [⋯ ▾] │
│ Created: 25 Jul 2026, 14:30      │ ┌──────────────────────────────────────┐  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ │ Filter: [All] [System] [Admin] [Notes│  │
│                                  │ │         (reserved — not active yet)  │  │
│ STATUS                           │ │──────────────────────────────────────│  │
│ ● PROCESSING                     │ │ ● [APPROVED] Admin01 · 2m ago        │  │
│ Processing by: CS_01             │ │   "Approved after verification"      │  │
│ Since: 5 mins ago                │ │                                      │  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ │ ● [PROCESSING] CS_01 · 5m ago       │  │
│                                  │ │   "Started processing"               │  │
│ MEMBER                           │ │                                      │  │
│ John Tan                         │ │ ● [CREATED] System · 10m ago         │  │
│ +6012-3456789                    │ │   "Member submitted deposit"         │  │
│ ID: USR-00123                    │ │                                      │  │
│ Balance: RM 1,250.00             │ │              [ Load More ]           │  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ └──────────────────────────────────────┘  │
│                                  │                                           │
│ TRANSACTION                      │ ▼ INTERNAL NOTES                          │
│ Amount:  RM 500.00               │ ┌──────────────────────────────────────┐  │
│ Bonus:  +RM 50.00                │ │ ┌──────────────────────────────────┐ │  │
│ Credit:  RM 550.00               │ │ │ Admin01 · 2m ago      [✎]  [✕]  │ │  │
│ Promo:   Welcome Bonus           │ │ │ Member confirmed via Telegram.   │ │  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ │ └──────────────────────────────────┘ │  │
│                                  │ │                                      │  │
│ PAYMENT BANK                     │ │ ┌──────────────────────────────────┐ │  │
│ Maybank                          │ │ │ CS_01 · 5m ago                  │ │  │
│ Acc: 1234-5678-9012              │ │ │ Waiting for bank confirmation.   │ │  │
│ Holder: John Tan                 │ │ └──────────────────────────────────┘ │  │
│ [View QR Code ↗]                 │ │                                      │  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ │ ┌── Add Note ──────────────────┐    │  │
│                                  │ │ │ Type your note here...        │    │  │
│ ╔══ ACTION PANEL ══════════════╗ │ │ └──────────────────────────────┘    │  │
│ ║                              ║ │ │ Ctrl+Enter to submit  (0/2000)     │  │
│ ║ TRANSACTION SUMMARY          ║ │ │                  [➕ Add Note]      │  │
│ ║ ─────────────────────────── ║ │ └──────────────────────────────────────┘  │
│ ║ Amount   RM 500.00          ║ │                                           │
│ ║ Bonus   +RM 50.00           ║ │ ▶ AUDIT PANEL  (Phase C — coming soon)   │
│ ║ Credit   RM 550.00          ║ │                                           │
│ ║ Status   PROCESSING         ║ │ ▶ RISK PANEL   (Phase C — coming soon)   │
│ ║ Provider Maybank            ║ │                                           │
│ ║ ─────────────────────────── ║ │                                           │
│ ║                              ║ │                                           │
│ ║  [✓  Approve    ]           ║ │                                           │
│ ║  [✕  Reject     ]           ║ │                                           │
│ ║  [⏸  Hold       ]           ║ │                                           │
│ ║                              ║ │                                           │
│ ╚══════════════════════════════╝ │                                           │
│  sticky — buttons pinned bottom  │                                           │
└──────────────────────────────────┴───────────────────────────────────────────┘
  35-40% width                        60-65% width
  left panel: position sticky         workspace: independent scroll
  action panel: flex col, buttons      each section: collapsible accordion
               always at bottom
```

### Tablet (768px – 1279px)

```
┌────────────────────────────────────────────────────────────────┐
│ ← Back    #1234  [DEPOSIT]  [PROCESSING]                       │
├────────────────────────────────────────────────────────────────┤
│  MEMBER               │  TRANSACTION          │  ACTIONS       │
│  John Tan             │  RM 500.00            │ [✓ Approve]   │
│  +6012-3456789        │  +RM 50.00 bonus      │ [✕ Reject]    │
│  Balance: RM 1,250    │  Promo: Welcome       │ [⏸ Hold]      │
│                       │  Credit: RM 550.00    │               │
├───────────────────────┴───────────────────────┴────────────────┤
│  PAYMENT BANK                                                  │
│  Maybank  ·  1234-5678-9012  ·  John Tan  [View QR ↗]         │
├────────────────────────────────────────────────────────────────┤
│  ▼ TIMELINE                                        [↺] [⋯ ▾] │
│  ● [APPROVED]   Admin01 · 2m ago                               │
│    "Approved after verification"                               │
│  ● [PROCESSING] CS_01 · 5m ago                                 │
│  ● [CREATED]    System · 10m ago                               │
│                              [ Load More ]                     │
├────────────────────────────────────────────────────────────────┤
│  ▼ INTERNAL NOTES                                              │
│  ┌──────────────────────────────────────────────────────┐      │
│  │ Admin01 · 2m ago                          [✎]  [✕]  │      │
│  │ Member confirmed via Telegram.                        │      │
│  └──────────────────────────────────────────────────────┘      │
│  ┌────────────────────────────────────────────────────┐        │
│  │  Type your note...                [➕ Add Note]    │        │
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
│ ─ Transaction Summary ─  │
│ Amount  RM 500.00        │
│ Bonus  +RM 50.00         │
│ Credit  RM 550.00        │
│ Status  PROCESSING       │
│ ──────────────────────   │
│ [ ✓  Approve  ]          │
│ [ ✕  Reject   ]          │
│ [ ⏸  Hold     ]          │
├──────────────────────────┤
│ ▼ TIMELINE               │
│ ●[APPROVED]  Admin 2m    │
│ ●[PROCESSING] CS  5m     │
│ ●[CREATED] System 10m    │
│     [ Load More ]        │
├──────────────────────────┤
│ ▼ INTERNAL NOTES         │
│ ┌──────────────────────┐ │
│ │Admin01 · 2m [✎] [✕] │ │
│ │Member confirmed...   │ │
│ └──────────────────────┘ │
│ ┌──────────────────────┐ │
│ │ Type note...         │ │
│ └──────────────────────┘ │
│ (0/2000)  [➕ Add Note] │
└──────────────────────────┘
```

---

## Section 3 — Timeline Event Color System

All timeline events must use a unified color system for instant recognition.

| Event Category | Color | Tailwind Class | Events |
|---------------|-------|----------------|--------|
| **Created** | Gray | `bg-gray-400` | `DEPOSIT_CREATED`, `WITHDRAW_CREATED` |
| **Processing** | Blue | `bg-blue-500` | `DEPOSIT_PROCESSING`, `WITHDRAW_PROCESSING` |
| **Approved / Paid** | Green | `bg-green-500` | `DEPOSIT_APPROVED`, `WITHDRAW_APPROVED` |
| **Rejected** | Red | `bg-red-500` | `DEPOSIT_REJECTED`, `WITHDRAW_REJECTED` |
| **Hold** | Yellow | `bg-yellow-400` | *(future)* |
| **Internal Note** | Purple | `bg-purple-500` | `INTERNAL_NOTE_CREATED`, `INTERNAL_NOTE_UPDATED`, `INTERNAL_NOTE_DELETED` |
| **Receipt** | Teal | `bg-teal-500` | `RECEIPT_UPLOADED`, `RECEIPT_VIEWED`, `RECEIPT_DOWNLOADED` |
| **Status Change** | Orange | `bg-orange-400` | `STATUS_CHANGED` |
| **System Event** | Dark Gray | `bg-gray-600` | Unknown / unmapped events |

### TimelineEventBadge Color Logic

```typescript
const EVENT_COLOR_MAP: Record<string, string> = {
  DEPOSIT_CREATED:        'bg-gray-400 text-white',
  WITHDRAW_CREATED:       'bg-gray-400 text-white',
  DEPOSIT_PROCESSING:     'bg-blue-500 text-white',
  WITHDRAW_PROCESSING:    'bg-blue-500 text-white',
  DEPOSIT_APPROVED:       'bg-green-500 text-white',
  WITHDRAW_APPROVED:      'bg-green-500 text-white',
  DEPOSIT_REJECTED:       'bg-red-500 text-white',
  WITHDRAW_REJECTED:      'bg-red-500 text-white',
  INTERNAL_NOTE_CREATED:  'bg-purple-500 text-white',
  INTERNAL_NOTE_UPDATED:  'bg-purple-500 text-white',
  INTERNAL_NOTE_DELETED:  'bg-purple-400 text-white',
  RECEIPT_UPLOADED:       'bg-teal-500 text-white',
  RECEIPT_VIEWED:         'bg-teal-400 text-white',
  RECEIPT_DOWNLOADED:     'bg-teal-400 text-white',
  STATUS_CHANGED:         'bg-orange-400 text-white',
};
// Fallback for unknown events:
const DEFAULT_COLOR = 'bg-gray-600 text-white';
```

---

## Section 4 — Component Design

### Left Panel Components

| Component | Responsibility | Key Props |
|-----------|---------------|-----------|
| `TransactionHeader` | ID / Type Badge / Created At / Back link | `id, type, createdAt` |
| `TransactionTypeBadge` | `[DEPOSIT]` / `[WITHDRAWAL]` colored badge | `type` |
| `TransactionStatusBadge` | Status colored badge | `status` |
| `StatusCard` | Full status + processing/approved/rejected by & at | `detail` |
| `MemberCard` | Member info + balance | `detail` |
| `PaymentCard` | Deposit/withdrawal payment info (conditional render) | `detail` |
| `ReceiptCard` | Receipt upload/view (withdrawal only) | `detail, onUpload` |
| `TurnoverCard` | Bonus turnover progress bar (withdrawal only) | `required, completed` |
| **`ActionPanel`** | **Transaction Summary + Approve/Reject/Hold (sticky, buttons pinned to bottom)** | `detail, meId, onAction` |
| **`TransactionSummary`** | **Compact summary inside ActionPanel: Amount/Bonus/Credit/Status/Provider** | `detail` |
| `RejectModal` | Reject reason modal (existing — reuse) | `onSubmit, onClose` |

#### ActionPanel — Enhanced Design

ActionPanel is the **Transaction Control Center**. It must:
- Always be visible (sticky)
- Show a compact Transaction Summary above the buttons
- Have buttons **pinned to the bottom** of the card regardless of content height

```
╔═══════════════════════════╗
║  TRANSACTION SUMMARY      ║   ← TransactionSummary sub-component
║  ─────────────────────── ║
║  Amount   RM 500.00       ║
║  Bonus   +RM 50.00        ║
║  Credit   RM 550.00       ║
║  Status   PROCESSING      ║
║  Provider Maybank         ║
║  ─────────────────────── ║
║                           ║
║  [space — grows/shrinks]  ║   ← flex-1 spacer
║                           ║
║  [ ✓  Approve    ]        ║   ← always at bottom
║  [ ✕  Reject     ]        ║
║  [ ⏸  Hold       ]        ║
╚═══════════════════════════╝
```

Implementation pattern:
```tsx
// ActionPanel layout: flex flex-col h-full
// TransactionSummary: flex-shrink-0 (top)
// <div className="flex-1" />  (spacer)
// ButtonGroup: flex-shrink-0 (always bottom)
```

### Right Panel (Workspace) Components

| Component | Responsibility | Key Props |
|-----------|---------------|-----------|
| `WorkspacePanel` | Right panel container, renders accordion sections | `sections: WorkspaceSection[]` |
| `WorkspaceSection` | Collapsible accordion wrapper for each panel | `title, defaultOpen, children` |
| **`TimelinePanel`** | **Timeline panel with header + filter reservation + list + pagination + realtime interface** | `type, id, onRefresh?, onSubscribe?` |
| `TimelineItem` | Single timeline event row | `item: TimelineItem` |
| `TimelineEventBadge` | Event type colored badge (color system) | `event` |
| **`TimelineFilter`** | **Filter bar UI (reserved — not active in Phase B)** | `activeFilter, onChange` |
| `NotesPanel` | Notes panel with header + list + editor | `type, id, permissions` |
| `NoteCard` | Single note with Edit/Delete buttons | `note, canEdit, canDelete, onEdit, onDelete` |
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
RiskPanel         — Phase C: Risk score / risk flags
AuditPanel        — Phase C: Full audit_logs viewer
AttachmentPanel   — Phase C: Attachment management
PinnedNotesPanel  — Phase C: Pinned notes at top of workspace
ProviderLogsPanel — Phase D: Game provider request/response logs
RealtimeIndicator — Phase D: SSE connection status badge
AIPanel           — Phase E: AI suggestions / risk score / fraud detection
```

---

## Section 5 — Workspace Collapsible Sections (Accordion)

All Workspace panels use a collapsible accordion pattern.

```
▼ TIMELINE                              [↺ Refresh]  [⋯ ▾ filter]
┌────────────────────────────────────────────────────────────────┐
│  (timeline content)                                            │
└────────────────────────────────────────────────────────────────┘

▼ INTERNAL NOTES                                   [n notes]
┌────────────────────────────────────────────────────────────────┐
│  (notes content + editor)                                      │
└────────────────────────────────────────────────────────────────┘

▶ AUDIT PANEL    (Phase C — coming soon)   ← collapsed by default

▶ RISK PANEL     (Phase C — coming soon)   ← collapsed by default
```

**Accordion Rules:**
- Timeline: open by default
- Notes: open by default
- Future panels: collapsed by default, with "coming soon" placeholder
- Collapsed state persisted in `localStorage` per user
- Keyboard: Enter / Space to toggle section
- ARIA: `aria-expanded`, `aria-controls` on toggle button

**Why Accordion:**
When Timeline is long (many events), Notes panel would require scrolling far
down to reach. With collapsible sections, the operator can collapse Timeline
after reviewing it and immediately access Notes.

---

## Section 6 — Timeline Filter (Reserved)

The Timeline filter bar is included in the DOM but **not active** in Phase B.
It renders as a visually present but non-functional UI placeholder.

```
Filter: [All ✓] [System] [Admin] [Notes]
                (dimmed / pointer-events: none)
(reserved — coming in Phase C)
```

**Implementation:** Render `TimelineFilter` component with `disabled` prop.
When `disabled`, all filter tabs show but are non-interactive. A tooltip on
hover: "Timeline filters coming soon."

This ensures Phase C can activate filtering by removing `disabled` — no
component redesign needed.

---

## Section 7 — Realtime Architecture Reservation

TimelinePanel's interface is designed to support both manual refresh (Phase B)
and realtime subscription (Phase D) without component changes.

```typescript
interface TimelinePanelProps {
  type: 'deposit' | 'withdrawal';
  id: number;
  // Phase B: call this to manually refresh timeline
  onRefresh?: () => void;
  // Phase D: subscribe to realtime SSE/WebSocket events
  // When provided, panel automatically receives push updates
  onSubscribe?: (callback: (item: TimelineItem) => void) => () => void;
}
```

**Phase B behavior:** `onRefresh` provided, `onSubscribe` undefined.
Manual Refresh button visible. No polling.

**Phase D behavior:** `onSubscribe` provided, pointing to SSE connection.
New events prepended to timeline automatically. Refresh button hidden.
`emitTransactionEvent()` (Phase A no-op) wired to SSE broadcaster.

This mirrors the pattern already established by Phase A's
`emitTransactionEvent()` placeholder — Phase D fills in the implementation
without touching TimelinePanel.

---

## Section 8 — Data Flow

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
│                                                                 │
│  Phase D addition (no Phase B changes):                         │
│  useEffect → subscribeTimeline(SSE) → push items to list        │
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
│  listNotes()   → dbListNotes (read-only)                        │
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

## Section 9 — Permission Matrix

### Phase A Permissions (migration 082 — already seeded in production)

| Permission | SUPER_ADMIN | ADMIN | SUPERVISOR | FINANCE | SUPPORT | CS |
|------------|:-----------:|:-----:|:----------:|:-------:|:-------:|:--:|
| `transaction.timeline.view` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `transaction.notes.view` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `transaction.notes.create` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `transaction.notes.edit` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `transaction.notes.delete` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |

> CS role: all Phase A permissions are FALSE by default (migration 082).
> SUPPORT/FINANCE: view/create/edit = TRUE, delete = FALSE.
> SUPERVISOR/ADMIN: all TRUE.
> SUPER_ADMIN: bypasses permission check entirely (permission_engine).

### Current Edit Ownership Model (Phase A API)

The Phase A API does **not** enforce per-admin ownership on edit/delete.
The 403 check in PUT/DELETE validates only that the note belongs to the
requested transaction (type+id), not that the requesting admin created it.

Any admin with `transaction.notes.edit` can edit any note in the transaction.
This is an intentional design decision for operational flexibility.

### Future Permission Enhancement (Design Reserved — No DB/API Changes Now)

In a future phase, granular ownership permissions may be introduced:

| Future Permission | Meaning |
|-------------------|---------|
| `transaction.notes.edit.self` | Can edit only notes created by self |
| `transaction.notes.edit.any` | Can edit any note in the transaction |
| `transaction.notes.delete.self` | Can delete only notes created by self |
| `transaction.notes.delete.any` | Can delete any note in the transaction |

**When this is implemented:**
- Migration adds new permission rows (additive, no existing rows changed)
- API PUT/DELETE adds an optional ownership check based on the finer-grained permission
- UI shows/hides [✎] [✕] per note based on `admin_id === currentAdmin.id`
- Existing behavior preserved: `edit.any` / `delete.any` = current behavior

> **Phase B: DO NOT implement. DO NOT add DB rows. DO NOT modify API.**
> This section is design reservation only.

### UI Layer Behavior

```
TimelinePanel:
  Has transaction.timeline.view → render panel (open by default)
  No permission → entire panel hidden

NotesPanel:
  Has transaction.notes.view   → render note list (open by default)
  Has transaction.notes.create → render NoteEditor
  Has transaction.notes.edit   → show [✎] on each NoteCard
  Has transaction.notes.delete → show [✕] on each NoteCard
  No transaction.notes.view    → entire panel hidden

WorkspacePanel with both panels hidden:
  "You don't have permission to view this workspace."
```

---

## Section 10 — API Mapping

| Component | API Endpoint | Repository Function | Permission |
|-----------|-------------|-------------------|------------|
| `TransactionHeader` + `StatusCard` + `MemberCard` + `PaymentCard` + **`TransactionSummary`** | `GET /api/transactions/{type}/{id}` | Direct SQL (existing) | `deposit.view` / `withdraw.view` |
| `TimelinePanel` | `GET /api/transactions/{type}/{id}/timeline?page=1&pageSize=20` | `audit_repo.getAuditLogsByTarget()` | `transaction.timeline.view` |
| `NotesPanel` (list) | `GET /api/transactions/{type}/{id}/notes` | `notes_repo.dbListNotes()` | `transaction.notes.view` |
| `NoteEditor` (create) | `POST /api/transactions/{type}/{id}/notes` | `notes_repo.dbCreateNote()` | `transaction.notes.create` |
| `InlineNoteEditor` (update) | `PUT /api/transactions/{type}/{id}/notes/{noteId}` | `notes_repo.dbUpdateNote()` | `transaction.notes.edit` |
| `NoteCard` (delete) | `DELETE /api/transactions/{type}/{id}/notes/{noteId}` | `notes_repo.dbSoftDeleteNote()` | `transaction.notes.delete` |
| `ActionPanel` (approve) | `POST /api/deposits/{id}/approve` or `withdrawals/{id}/approve` | existing | existing |
| `ActionPanel` (reject) | `POST /api/deposits/{id}/reject` or `withdrawals/{id}/reject` | existing | existing |
| `ReceiptCard` (upload) | `POST /api/withdrawals/{id}/receipt` | existing | existing |

---

## Section 11 — Interaction Design

### Add Note

```
User clicks NoteEditor textarea (or presses N shortcut)
→ Types content
→ Character count updates live (bottom-right "x/2000")
→ Submit: [Add Note] button or Ctrl+Enter
→ Button shows "Adding..." loading state
→ API POST success → prepend note to list → clear textarea → "Note added" Toast
→ API POST failure → "Failed to add note" Error Toast → content preserved
```

### Edit Note

```
User clicks [✎] on NoteCard
→ NoteCard switches to InlineNoteEditor (pre-filled with content)
→ Other [✎] buttons disabled (one edit at a time)
→ Submit: [Save] or Ctrl+Enter
→ API PUT success → collapse editor → NoteCard shows new content → "Note updated" Toast
→ API PUT failure → "Failed to update note" Error Toast → exit edit mode, content reverts
→ [Cancel] or Esc → editor collapses, content reverts

Note: API does NOT enforce per-admin ownership. Any admin with
transaction.notes.edit can edit any note. 403 from PUT indicates
note/transaction type-id mismatch — a system inconsistency, not
an authorization failure from the UI's perspective.
```

### Delete Note

```
User clicks [✕] on NoteCard
→ ConfirmDialog:
    Title: "Delete Note"
    Body:  "This note will be permanently deleted."
    [Cancel]  [Delete (destructive)]
→ Cancel → dialog closes, no action
→ Delete → API DELETE
    success → dialog closes → NoteCard removed (fade-out) → "Note deleted" Toast
    failure → dialog closes → "Failed to delete note" Error Toast
```

### Timeline Accordion

```
▼ TIMELINE header click → collapse Timeline section
  → Timeline content hidden, accordion row remains visible
  → Notes panel moves up (easier to reach)
▶ TIMELINE header click → expand Timeline section
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
  → Button "Loading..." (disabled)
  → Fetch page=N+1, append to list
  → If items.length >= total → hide [Load More]
  → Failure → "Failed to load more" Toast

Manual Refresh (Phase B):
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

### Error States

```
TimelinePanel load failure: "⚠ Failed to load timeline." [Retry]
NotesPanel load failure:    "⚠ Failed to load notes."    [Retry]
Main detail failure:        Full page error (existing behavior)
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
Keyboard: Esc → Cancel; Enter → does NOT auto-confirm (prevents accidental delete)
Focus trap: Tab cycles only between [Cancel] and [Confirm]
On open: focus to [Cancel]
On close: focus returns to trigger element
```

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `N` | Focus NoteEditor textarea |
| `Ctrl + Enter` | Submit note (add or edit mode) |
| `Esc` | Close InlineNoteEditor / close ConfirmDialog |
| `Tab` | Standard order: Left panel → ActionPanel → Timeline → Notes |

---

## Section 12 — Performance Design

### Timeline

```
Strategy:      "Load More" pagination (not Infinite Scroll)
Initial fetch: page=1, pageSize=20
Per load more: +20 items, append to list (cumulative)
API cap:       pageSize max = 100 (enforced in API layer)
Virtual list:  Not needed (expected < 200 items per transaction)
Polling:       None in Phase B (Manual Refresh only)
Phase D:       onSubscribe() replaces polling with SSE push
```

### Notes

```
Strategy:      Load all at once (typically < 50 per transaction)
Optimistic updates:
  POST success → prepend to list immediately (no re-fetch needed)
  DELETE success → remove from list immediately (no re-fetch needed)
  PUT success → update NoteCard content immediately (no re-fetch needed)
Failure rollback:
  POST failure → remove optimistic item, restore textarea content
  DELETE failure → restore NoteCard to list
  PUT failure → restore original content
```

### Three Parallel Fetches on Mount

```
Page mounts → three concurrent fetches:
  1. fetchDetail()    → main transaction data (left panel)
  2. fetchTimeline()  → timeline events (workspace, section 1)
  3. fetchNotes()     → notes list (workspace, section 2)

Each has independent loading/error state.
Left panel not blocked by workspace failures.
```

---

## Section 13 — Accessibility

### Tab Order

```
Back Link
→ TransactionHeader
→ StatusCard
→ MemberCard (Member Link)
→ PaymentCard
→ ReceiptCard / TurnoverCard (if rendered)
→ ActionPanel [Approve] → [Reject] → [Hold]
→ WorkspaceSection toggle (Timeline) → [↺ Refresh] → [Load More]
→ WorkspaceSection toggle (Notes) → NoteCard [✎] → [✕] → NoteEditor → [Add Note]
```

### ARIA Labels

```tsx
<button aria-label="Approve transaction #1234">
<button aria-label="Reject transaction #1234">
<button aria-label="Hold transaction #1234">
<button aria-label="Edit note">
<button aria-label="Delete note">
<button aria-label="Toggle Timeline section" aria-expanded={open} aria-controls="timeline-content">
<div role="dialog" aria-modal="true" aria-labelledby="dialog-title">
<div aria-live="polite">   {/* success/info toasts */}
<div aria-live="assertive"> {/* error toasts */}
<section aria-label="Transaction timeline">
<ul role="list"> (TimelineItem list)
<div aria-busy="true" aria-label="Loading..."> (skeletons)
```

### Focus Management

```
Open ConfirmDialog    → focus to [Cancel]
Close ConfirmDialog   → focus returns to [✕] trigger
Open InlineNoteEditor → focus to textarea
Close InlineNoteEditor → focus returns to [✎] trigger
Keyboard N shortcut   → focus NoteEditor textarea
```

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  .note-card-exit     { animation: none; }
  .timeline-item-enter { animation: none; }
  .accordion-content  { transition: none; }
}
```

---

## Section 14 — Implementation Plan

### Phase B-1 — Layout Redesign + Left Panel + ActionPanel Enhancement

**Goal:** Rewrite `transactions/[type]/[id]/page.tsx` with dual-column
Master+Workspace layout. Implement all left panel cards including enhanced
ActionPanel with TransactionSummary. Right panel is empty WorkspacePanel
with accordion skeleton.

**No new APIs. No migrations.**

**Files to create:**
```
erp/src/components/transactions/TransactionHeader.tsx
erp/src/components/transactions/StatusCard.tsx
erp/src/components/transactions/MemberCard.tsx
erp/src/components/transactions/PaymentCard.tsx
erp/src/components/transactions/ReceiptCard.tsx
erp/src/components/transactions/TurnoverCard.tsx
erp/src/components/transactions/TransactionSummary.tsx      ← new (Revision 2)
erp/src/components/transactions/ActionPanel.tsx
erp/src/components/transactions/WorkspacePanel.tsx
erp/src/components/transactions/WorkspaceSection.tsx        ← new (Revision 2)
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

**Test scope:**
- Deposit / Withdrawal left panel renders all cards
- ActionPanel: TransactionSummary shows Amount/Bonus/Credit/Status/Provider
- ActionPanel: buttons remain at bottom when content above is long
- ActionPanel: sticky on scroll (buttons never require scroll-to-top)
- Approve / Reject / Hold actions work (regression)
- Receipt upload + Ctrl+V paste (regression)
- WorkspacePanel renders with empty accordion sections
- Desktop dual-column ≥1280px
- Tablet 768-1279px
- Mobile <768px single-column

**Risks:**
- Ctrl+V clipboard paste for receipt must be preserved in ReceiptCard
- RejectModal prop drilling must remain correct
- Sticky left panel CSS must not conflict with nav header
- Flex layout for ActionPanel (sticky bottom buttons) needs careful testing

---

### Phase B-2 — Timeline Panel

**Goal:** Implement TimelinePanel in WorkspacePanel with color system,
accordion, filter reservation, realtime interface, and Load More pagination.

**Files to create:**
```
erp/src/components/transactions/TimelinePanel.tsx
erp/src/components/transactions/TimelineItem.tsx
erp/src/components/transactions/TimelineEventBadge.tsx      ← color system
erp/src/components/transactions/TimelineFilter.tsx          ← reserved (disabled)
erp/src/components/transactions/EmptyState.tsx
erp/src/components/transactions/LoadingSkeleton.tsx
erp/src/components/transactions/ErrorState.tsx
```

**Expected commits:**
- `feat(transaction-v2): implement timeline panel with color system and load-more`

**Test scope:**
- Loading skeleton → success renders timeline items
- Event colors: APPROVED=green, PROCESSING=blue, REJECTED=red, CREATED=gray, NOTE=purple
- Empty timeline → EmptyState
- Load failure → ErrorState + Retry
- Load More appends (page 2+), hidden when all loaded
- Filter bar renders (disabled), no interactions
- Accordion: Timeline collapsible, open by default
- No `transaction.timeline.view` permission → panel hidden
- Refresh button resets to page 1
- `adminName: null` for system events renders gracefully ("System")

**Risks:**
- Permission check: call `/api/auth/me` for client-side panel visibility;
  API continues to enforce server-side
- Filter UI must be visually present but non-interactive (CSS `pointer-events: none` with tooltip)

---

### Phase B-3 — Notes Panel

**Goal:** Implement NotesPanel with full CRUD, accordion, permission gates,
keyboard shortcuts, optimistic updates, Toast feedback.

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

**Test scope:**
- Notes load (loading → success → empty state)
- Add Note: success (optimistic prepend + Toast), failure (rollback + Error Toast)
- Edit Note: inline editor, save success/failure, cancel
- Delete Note: ConfirmDialog, confirm/cancel
- Permission gates: no view=hidden, no create=no editor, no delete=no [✕]
- Accordion: Notes collapsible, open by default
- Keyboard: N focuses, Ctrl+Enter submits, Esc cancels
- Character count 0/2000, button disabled at limit
- Optimistic rollback on all mutation failures
- One-at-a-time edit (second [✎] disabled while editing)

**Risks:**
- Optimistic rollback state management (add / edit / delete each need rollback)
- Edit exclusivity: shared state needed across all NoteCards
- AdminId for UI from `/api/auth/me` (already used in existing page)

---

## Section 15 — Future Reserved Roadmap

### Phase C — Expanded Workspace

| Feature | Component | Dependency |
|---------|-----------|-----------|
| Risk Panel | `RiskPanel` | risk_flags table (new migration) |
| Audit Panel | `AuditPanel` | existing audit_logs, no migration |
| Pinned Notes | `PinnedNotesPanel` | `transaction_internal_notes.pinned_at` (new migration) |
| Timeline Filter | `TimelineFilter` (activate) | No API change — filter by event type client-side or add `?filter=` param |
| Attachment Panel | `AttachmentPanel` | media_library integration |

### Phase D — Realtime Workspace

| Feature | Component | Dependency |
|---------|-----------|-----------|
| Realtime Timeline | `TimelinePanel (onSubscribe)` | SSE endpoint, `emitTransactionEvent()` wired |
| Realtime Notes | `NotesPanel` | SSE push for note created/updated/deleted |
| Provider Logs | `ProviderLogsPanel` | provider_logs table (new) |
| Webhook Logs | `WebhookPanel` | webhook_logs table (new) |
| RealtimeIndicator | `RealtimeIndicator` | SSE connection status |

### Phase E — AI-Powered Workspace

| Feature | Component | Dependency |
|---------|-----------|-----------|
| AI Assistant | `AIPanel` | External AI API |
| AI Suggested Reply | Inside `NotesPanel` | AI API |
| AI Risk Score | Inside `RiskPanel` | AI API + risk model |
| AI Fraud Detection | Inside `RiskPanel` | AI API + pattern model |

---

## Summary

```
Phase B — ERP UI Layer Only. Zero DB/API changes.

Phase B-1: Layout + Left Panel + ActionPanel Enhancement
Phase B-2: Timeline Panel (color system, accordion, filter reserved, realtime interface)
Phase B-3: Notes Panel (full CRUD, optimistic updates, keyboard shortcuts)

Total expected commits: 5–7
New migrations:         0
New APIs:               0
Modified APIs:          0
Backward compatible:    YES
```

---

## Permanent Constraints

- Platform: SSWIN88/Tesla88 v1.0.0 — 绝不修改 `users.id`
- External integration layer (Provider API / Callback / Webhook) — 绝不修改
- `gp_credentials` AES-256-GCM encrypted — plaintext never returned from any API
- All reports and updates must be in Chinese
- BACKWARD COMPATIBILITY IS MANDATORY
