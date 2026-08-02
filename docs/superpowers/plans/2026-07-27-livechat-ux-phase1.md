# ERP LiveChat UX & Customer Service Improvements — Phase 1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve CS workflow in the ERP LiveChat: auto-create sessions, full tag management with enable/disable/sort, configurable notification interval, and tag UX improvements in MemberCard.

**Architecture:** Six independent deliverables sharing one DB migration. All API changes are additive (new fields / new endpoints), never removing existing contracts. MemberCard tag state already resets correctly (done in prior session); this plan adds sort_order + is_active to the DB, plumbs the interval setting through system_settings, and polishes the management UIs.

**Tech Stack:** Next.js 14 App Router (TypeScript), PostgreSQL via `pool` from `@/lib/db`, existing patterns: `requirePermission()`, `pool.query`, `system_settings` upsert, `support_repo.ts` functions.

## Global Constraints

- NEVER modify: 918KISS / Game APIs / Wallet logic / Deposit-Withdraw approval / Authentication / Login / Registration / Receipt Upload / Receipt Viewer / Docker / nginx / production deployment / existing API contracts.
- All new API routes follow the existing pattern: `requirePermission(...)` first, then DB query, then `NextResponse.json(...)`.
- TypeScript strict — no `any`, use type assertions only where pattern already exists in the codebase.
- Keep existing `CustomerTag`, `SupportSession`, `MemberCardData` types backward-compatible (add fields, never remove).
- Prefer the smallest change that satisfies the spec. YAGNI.
- Do NOT hardcode tag lists anywhere in UI. All tags come from DB.
- Disabled tags: must NOT appear in the "Add tag" dropdown; existing assignments stay visible.
- Commit after every task. Use `git add <specific files>` — never `git add -A`.

---

## File Map

| File | Change |
|---|---|
| `erp/migrations/084_tag_enhancements_and_notification_interval.sql` | CREATE (migration) |
| `erp/src/lib/types.ts` | MODIFY — add `sort_order`, `is_active`, `updated_at` to `CustomerTag` |
| `erp/src/lib/repositories/support_repo.ts` | MODIFY — update tag repo functions |
| `erp/src/app/api/livechat/tags/route.ts` | MODIFY — pass `include_inactive` param |
| `erp/src/app/api/livechat/tags/[id]/route.ts` | MODIFY — support `is_active`, `sort_order` in PATCH |
| `erp/src/app/api/livechat/sessions/by-member/[memberId]/route.ts` | MODIFY — add POST endpoint |
| `erp/src/app/api/settings/notifications/route.ts` | CREATE — GET + PATCH for notification interval |
| `erp/src/app/(dashboard)/livechat/tags/page.tsx` | MODIFY — add disable/enable, sort, search |
| `erp/src/app/(dashboard)/members/[id]/page.tsx` | MODIFY — openChat uses POST |
| `erp/src/components/sidebar.tsx` | MODIFY — add Tags link, fetch interval from API |
| `erp/src/components/livechat/MemberCard.tsx` | MODIFY — filter inactive tags from dropdown, tag search |
| `erp/src/components/livechat/NotificationSettings.tsx` | MODIFY — show transaction/livechat labels |
| `erp/src/app/(dashboard)/settings/brand/page.tsx` | MODIFY — add Notification Settings section |

---

### Task 1: Database Migration

Adds `sort_order`, `is_active`, `updated_at` to `customer_tags`; seeds `notification_reminder_interval_ms`.

**Files:**
- Create: `erp/migrations/084_tag_enhancements_and_notification_interval.sql`

**Interfaces:**
- Produces: `customer_tags` with new columns; `system_settings` row for interval

- [ ] **Step 1: Write the migration file**

```sql
-- 084_tag_enhancements_and_notification_interval.sql
-- Adds sort_order, is_active, updated_at to customer_tags.
-- Seeds default notification reminder interval in system_settings.

ALTER TABLE customer_tags
  ADD COLUMN IF NOT EXISTS sort_order  INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Back-fill sort_order alphabetically for existing rows
UPDATE customer_tags
SET sort_order = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name) AS rn FROM customer_tags
) sub
WHERE customer_tags.id = sub.id;

INSERT INTO system_settings (key, value, description)
VALUES (
  'notification_reminder_interval_ms',
  '3000',
  'Interval (ms) between repeated transaction reminder beeps. Allowed: 2000, 3000, 5000, 8000.'
)
ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 2: Apply migration on dev**

```bash
psql "$DATABASE_URL" -f erp/migrations/084_tag_enhancements_and_notification_interval.sql
```

Expected: `ALTER TABLE`, `UPDATE N`, `INSERT 0 1` (or `INSERT 1 0`)

- [ ] **Step 3: Verify columns exist**

```bash
psql "$DATABASE_URL" -c "\d customer_tags"
```

Expected: columns `sort_order`, `is_active`, `updated_at` present.

- [ ] **Step 4: Commit**

```bash
git add erp/migrations/084_tag_enhancements_and_notification_interval.sql
git commit -m "feat(db): add sort_order/is_active/updated_at to customer_tags; seed notification interval"
```

---

### Task 2: CustomerTag Type + Repo + APIs

Update the `CustomerTag` type and all repo/API functions to use the new fields.

**Files:**
- Modify: `erp/src/lib/types.ts` (lines 330–335)
- Modify: `erp/src/lib/repositories/support_repo.ts` (lines 997–1034)
- Modify: `erp/src/app/api/livechat/tags/route.ts`
- Modify: `erp/src/app/api/livechat/tags/[id]/route.ts`

**Interfaces:**
- Consumes: Migration from Task 1
- Produces: `CustomerTag` with `sort_order: number`, `is_active: boolean`, `updated_at: string`; `getAllTags(includeInactive?: boolean)` function; PATCH API supporting `is_active`, `sort_order`

- [ ] **Step 1: Update `CustomerTag` type in `erp/src/lib/types.ts`**

Find the existing `CustomerTag` interface (around line 330) and replace it:

```typescript
// ── Customer Tags ─────────────────────────────────────────────────────────────

export interface CustomerTag {
  id: number;
  name: string;
  color: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Update `getAllTags` in `erp/src/lib/repositories/support_repo.ts`**

Replace the existing `getAllTags` function (starts at line 997):

```typescript
export async function getAllTags(includeInactive = false): Promise<CustomerTag[]> {
  const where = includeInactive ? '' : 'WHERE is_active = TRUE';
  const { rows } = await pool.query(
    `SELECT id, name, color, sort_order, is_active, created_at, updated_at
     FROM customer_tags
     ${where}
     ORDER BY sort_order ASC, name ASC`
  );
  return rows;
}
```

- [ ] **Step 3: Update `createTag` in `support_repo.ts`**

Replace the existing `createTag` function (starts at line 1004):

```typescript
export async function createTag(data: { name: string; color: string; sort_order?: number }): Promise<CustomerTag> {
  // Place new tag after current max sort_order
  const maxRow = await pool.query<{ max: number | null }>(`SELECT MAX(sort_order) AS max FROM customer_tags`);
  const nextOrder = (maxRow.rows[0]?.max ?? 0) + 1;
  const { rows } = await pool.query(
    `INSERT INTO customer_tags (name, color, sort_order)
     VALUES ($1, $2, $3)
     RETURNING id, name, color, sort_order, is_active, created_at, updated_at`,
    [data.name, data.color, data.sort_order ?? nextOrder]
  );
  return rows[0];
}
```

- [ ] **Step 4: Update `updateTag` in `support_repo.ts`**

Replace the existing `updateTag` function (starts at line 1013):

```typescript
export async function updateTag(
  id: number,
  data: { name?: string; color?: string; is_active?: boolean; sort_order?: number }
): Promise<CustomerTag | null> {
  const sets: string[] = [];
  const params: (string | number | boolean)[] = [];
  let i = 1;
  if (data.name       !== undefined) { sets.push(`name=$${i++}`);       params.push(data.name); }
  if (data.color      !== undefined) { sets.push(`color=$${i++}`);      params.push(data.color); }
  if (data.is_active  !== undefined) { sets.push(`is_active=$${i++}`);  params.push(data.is_active); }
  if (data.sort_order !== undefined) { sets.push(`sort_order=$${i++}`); params.push(data.sort_order); }
  if (!sets.length) return null;
  sets.push(`updated_at=NOW()`);
  params.push(id);
  const { rows } = await pool.query(
    `UPDATE customer_tags SET ${sets.join(', ')} WHERE id=$${i}
     RETURNING id, name, color, sort_order, is_active, created_at, updated_at`,
    params
  );
  return rows[0] ?? null;
}
```

- [ ] **Step 5: Update `GET /api/livechat/tags/route.ts`**

Replace the entire file content:

```typescript
import { getAllTags } from '@/lib/repositories/support_repo';
import { requirePermission } from '@/lib/require_permission';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const authPayload = await requirePermission('livechat.view');
  if (!authPayload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const includeInactive = req.nextUrl.searchParams.get('include_inactive') === '1';
  const tags = await getAllTags(includeInactive);
  return NextResponse.json(tags);
}

export async function POST(req: NextRequest) {
  const payload = await requirePermission('livechat.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { name?: string; color?: string };
  if (!body.name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const { createTag } = await import('@/lib/repositories/support_repo');
  const tag = await createTag({ name: body.name.trim(), color: body.color ?? '#6B7280' });
  return NextResponse.json(tag, { status: 201 });
}
```

Wait — `createTag` is already imported at file top. Write the corrected full file:

```typescript
import { getAllTags, createTag } from '@/lib/repositories/support_repo';
import { requirePermission } from '@/lib/require_permission';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const authPayload = await requirePermission('livechat.view');
  if (!authPayload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const includeInactive = req.nextUrl.searchParams.get('include_inactive') === '1';
  const tags = await getAllTags(includeInactive);
  return NextResponse.json(tags);
}

export async function POST(req: NextRequest) {
  const payload = await requirePermission('livechat.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { name?: string; color?: string };
  if (!body.name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const tag = await createTag({ name: body.name.trim(), color: body.color ?? '#6B7280' });
  return NextResponse.json(tag, { status: 201 });
}
```

- [ ] **Step 6: Update `PATCH /api/livechat/tags/[id]/route.ts`**

Replace entire file:

```typescript
import { updateTag, deleteTag } from '@/lib/repositories/support_repo';
import { requirePermission } from '@/lib/require_permission';
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await requirePermission('livechat.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    name?: string;
    color?: string;
    is_active?: boolean;
    sort_order?: number;
  };
  const tag = await updateTag(Number(id), body);
  if (!tag) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(tag);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await requirePermission('livechat.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  await deleteTag(Number(id));
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 7: Also update the getTagsForUser query to include new fields**

In `support_repo.ts` find `getTagsForUser` (around line 1036) and update the SELECT:

```typescript
export async function getTagsForUser(userId: number): Promise<CustomerTag[]> {
  const { rows } = await pool.query(
    `SELECT ct.id, ct.name, ct.color, ct.sort_order, ct.is_active, ct.created_at, ct.updated_at
     FROM user_tag_assignments uta
     JOIN customer_tags ct ON ct.id = uta.tag_id
     WHERE uta.user_id = $1
     ORDER BY ct.sort_order ASC, ct.name ASC`,
    [userId]
  );
  return rows;
}
```

Also update any other `SELECT` in support_repo.ts that queries `customer_tags` columns to include the new fields. Search for `ct.id, ct.name, ct.color, ct.created_at` and replace with `ct.id, ct.name, ct.color, ct.sort_order, ct.is_active, ct.created_at, ct.updated_at` in every occurrence.

- [ ] **Step 8: Verify TypeScript compiles**

```bash
cd erp && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to `CustomerTag`.

- [ ] **Step 9: Commit**

```bash
git add erp/src/lib/types.ts erp/src/lib/repositories/support_repo.ts \
        erp/src/app/api/livechat/tags/route.ts \
        "erp/src/app/api/livechat/tags/[id]/route.ts"
git commit -m "feat(tags): add sort_order/is_active/updated_at to CustomerTag type and repo"
```

---

### Task 3: Tag Management UI

Upgrade the existing `/livechat/tags/page.tsx` to support enable/disable, sort order, search, and show `is_active` state visually.

**Files:**
- Modify: `erp/src/app/(dashboard)/livechat/tags/page.tsx` (full rewrite)

**Interfaces:**
- Consumes: `CustomerTag` with `sort_order`, `is_active` from Task 2
- Produces: A working management page at `/livechat/tags`

- [ ] **Step 1: Rewrite `erp/src/app/(dashboard)/livechat/tags/page.tsx`**

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TagBadge } from '@/components/livechat/TagBadge';
import type { CustomerTag } from '@/lib/types';

export default function TagManagerPage() {
  const [tags, setTags] = useState<CustomerTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Add form
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6B7280');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [saving, setSaving] = useState(false);

  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [movingId, setMovingId] = useState<number | null>(null);

  const loadTags = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/livechat/tags?include_inactive=1');
      if (r.ok) setTags(await r.json() as CustomerTag[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadTags(); }, [loadTags]);

  async function handleAdd() {
    setAddError('');
    if (!newName.trim()) { setAddError('Tag name is required.'); return; }
    setAdding(true);
    try {
      const r = await fetch('/api/livechat/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      });
      if (r.ok) {
        setNewName(''); setNewColor('#6B7280');
        await loadTags();
      } else {
        const d = await r.json() as { error?: string };
        setAddError(d.error ?? 'Failed to add tag');
      }
    } finally { setAdding(false); }
  }

  async function handleSave(id: number) {
    setSaving(true);
    try {
      const r = await fetch(`/api/livechat/tags/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), color: editColor }),
      });
      if (r.ok) { setEditingId(null); await loadTags(); }
    } finally { setSaving(false); }
  }

  async function handleDelete(id: number, name: string) {
    if (!window.confirm(`Delete tag "${name}"? This will remove it from all users.`)) return;
    const r = await fetch(`/api/livechat/tags/${id}`, { method: 'DELETE' });
    if (r.ok) setTags((prev) => prev.filter((t) => t.id !== id));
  }

  async function handleToggleActive(tag: CustomerTag) {
    setTogglingId(tag.id);
    try {
      const r = await fetch(`/api/livechat/tags/${tag.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !tag.is_active }),
      });
      if (r.ok) await loadTags();
    } finally { setTogglingId(null); }
  }

  async function handleMove(tag: CustomerTag, direction: 'up' | 'down') {
    setMovingId(tag.id);
    const sorted = [...tags].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    const idx = sorted.findIndex((t) => t.id === tag.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) { setMovingId(null); return; }
    const swapTag = sorted[swapIdx];
    try {
      await Promise.all([
        fetch(`/api/livechat/tags/${tag.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: swapTag.sort_order }),
        }),
        fetch(`/api/livechat/tags/${swapTag.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: tag.sort_order }),
        }),
      ]);
      await loadTags();
    } finally { setMovingId(null); }
  }

  const filtered = tags.filter((t) =>
    !search.trim() || t.name.toLowerCase().includes(search.toLowerCase())
  );
  const sorted = [...filtered].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tag Management</h1>
        <span className="text-sm text-gray-400">{tags.length} total · {tags.filter(t => t.is_active).length} active</span>
      </div>

      {/* Add form */}
      <div className="rounded-lg border bg-gray-50 p-4 space-y-3">
        <h2 className="font-semibold text-sm">Add New Tag</h2>
        <div className="flex gap-2 items-center">
          <Input
            placeholder="Tag name (unique)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1"
            onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
          />
          <div className="flex items-center gap-1">
            <label className="text-xs text-gray-600">Color</label>
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="h-8 w-10 cursor-pointer rounded border border-gray-300 p-0.5"
            />
          </div>
          <Button onClick={() => void handleAdd()} disabled={adding} size="sm">
            {adding ? 'Adding…' : 'Add'}
          </Button>
        </div>
        {newName.trim() && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Preview:</span>
            <TagBadge tag={{ id: 0, name: newName, color: newColor, sort_order: 0, is_active: true, created_at: '', updated_at: '' }} />
          </div>
        )}
        {addError && <p className="text-xs text-red-500">{addError}</p>}
      </div>

      {/* Search */}
      <Input
        placeholder="Search tags…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />

      {/* Tag list */}
      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : sorted.length === 0 ? (
        <p className="text-gray-400 text-sm">{search ? 'No matching tags.' : 'No tags yet. Add one above.'}</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((tag, idx) =>
            editingId === tag.id ? (
              <div key={tag.id} className="flex items-center gap-2 rounded-lg border bg-white p-3 shadow-sm">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 h-8 text-sm"
                />
                <input
                  type="color"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  className="h-8 w-10 cursor-pointer rounded border border-gray-300 p-0.5"
                />
                <TagBadge tag={{ ...tag, name: editName || tag.name, color: editColor }} />
                <Button size="sm" className="h-7 text-xs" onClick={() => void handleSave(tag.id)} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingId(null)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div
                key={tag.id}
                className={`flex items-center gap-3 rounded-lg border bg-white p-3 shadow-sm ${!tag.is_active ? 'opacity-50' : ''}`}
              >
                {/* Sort arrows */}
                <div className="flex flex-col gap-0.5">
                  <button
                    className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none text-xs"
                    disabled={idx === 0 || movingId !== null}
                    onClick={() => void handleMove(tag, 'up')}
                    title="Move up"
                  >▲</button>
                  <button
                    className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none text-xs"
                    disabled={idx === sorted.length - 1 || movingId !== null}
                    onClick={() => void handleMove(tag, 'down')}
                    title="Move down"
                  >▼</button>
                </div>

                <TagBadge tag={tag} />
                <span className="flex-1 text-sm font-medium">{tag.name}</span>
                <span className="text-xs text-gray-400 font-mono">{tag.color}</span>

                {!tag.is_active && (
                  <span className="text-xs text-gray-400 border rounded px-1.5 py-0.5">Disabled</span>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  className={`h-7 text-xs ${tag.is_active ? 'text-amber-600 border-amber-300 hover:bg-amber-50' : 'text-green-600 border-green-300 hover:bg-green-50'}`}
                  disabled={togglingId === tag.id}
                  onClick={() => void handleToggleActive(tag)}
                >
                  {togglingId === tag.id ? '…' : tag.is_active ? 'Disable' : 'Enable'}
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => { setEditingId(tag.id); setEditName(tag.name); setEditColor(tag.color); }}>
                  Edit
                </Button>
                <Button size="sm" variant="destructive" className="h-7 text-xs"
                  onClick={() => void handleDelete(tag.id, tag.name)}>
                  Delete
                </Button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the page compiles**

```bash
cd erp && npx tsc --noEmit 2>&1 | grep "tags/page"
```

Expected: no output (no errors).

- [ ] **Step 3: Commit**

```bash
git add "erp/src/app/(dashboard)/livechat/tags/page.tsx"
git commit -m "feat(tags): full tag management UI — disable/enable, sort order, search"
```

---

### Task 4: Sidebar — Tag Management Link + MemberCard Inactive Filter

Two small changes: add "Tag Management" link to sidebar NAV_GROUPS; filter inactive tags from MemberCard "Add tag" dropdown.

**Files:**
- Modify: `erp/src/components/sidebar.tsx` (lines 58–60, NAV_GROUPS)
- Modify: `erp/src/components/livechat/MemberCard.tsx`

**Interfaces:**
- Consumes: Task 2 (CustomerTag with is_active)
- Produces: Tags Management link in sidebar; inactive tags hidden in Add dropdown

- [ ] **Step 1: Add Tag Management to sidebar NAV_GROUPS**

In `erp/src/components/sidebar.tsx`, find the Live Chat group (around lines 58–60):

```typescript
      { href: '/livechat',    label: 'Live Chat',   icon: MessageSquare,   permission: 'livechat.view' },
      { href: '/livechat/quick-replies', label: 'Quick Replies', icon: Zap, permission: 'livechat.view' },
```

Replace with:

```typescript
      { href: '/livechat',              label: 'Live Chat',       icon: MessageSquare, permission: 'livechat.view' },
      { href: '/livechat/quick-replies',label: 'Quick Replies',   icon: Zap,           permission: 'livechat.view' },
      { href: '/livechat/tags',         label: 'Tag Management',  icon: Tag,           permission: 'livechat.manage' },
```

Also add `Tag` to the lucide-react import at the top of the file. Find the existing import line (starts with `import { ... } from 'lucide-react'`) and add `Tag` to the list.

- [ ] **Step 2: Fix MemberCard "Add tag" dropdown to exclude inactive tags**

In `erp/src/components/livechat/MemberCard.tsx`, the `allTags` fetch currently calls `/api/livechat/tags` (returns only active). This is already correct — `getAllTags()` without `include_inactive` returns only active tags.

However, the `useEffect` that resets tags on member switch also resets `allTags` fetch. Verify the `allTags` useEffect has empty `[]` deps (it already does from previous session). No change needed here — `GET /api/livechat/tags` already returns only active tags by default after Task 2.

Confirm the filter in MemberCard's select:

```typescript
{allTags
  .filter((t) => !tags.some((ct) => ct.id === t.id))
  .map((t) => (
    <option key={t.id} value={t.id}>
      {t.name}
    </option>
  ))}
```

This is already correct — `allTags` only contains active tags, and already-assigned tags are filtered out. No change needed.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd erp && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add erp/src/components/sidebar.tsx erp/src/components/livechat/MemberCard.tsx
git commit -m "feat(sidebar): add Tag Management link; inactive tags hidden from MemberCard dropdown"
```

---

### Task 5: Auto-Create Session (Member Profile → Chat)

Add POST endpoint that finds or creates a session; update openChat() to use it.

**Files:**
- Modify: `erp/src/app/api/livechat/sessions/by-member/[memberId]/route.ts`
- Modify: `erp/src/app/(dashboard)/members/[id]/page.tsx`

**Interfaces:**
- Consumes: `createSessionForUser(userId, agentUsername)` from `support_repo.ts` (already exists)
- Produces: `POST /api/livechat/sessions/by-member/[memberId]` → `{ session_id: number, created: boolean }`

- [ ] **Step 1: Add POST handler to `by-member` API**

Replace the full content of `erp/src/app/api/livechat/sessions/by-member/[memberId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';
import { createSessionForUser } from '@/lib/repositories/support_repo';

type Ctx = { params: Promise<{ memberId: string }> };

// Returns the most recent livechat session for a member.
// Priority: OPEN → ACTIVE → most recent of any status.
export async function GET(_req: NextRequest, { params }: Ctx) {
  const payload = await requirePermission('livechat.view');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { memberId } = await params;
  const uid = parseInt(memberId, 10);
  if (isNaN(uid)) return NextResponse.json({ error: 'Invalid member ID' }, { status: 400 });

  const { rows } = await pool.query<{ id: number; status: string }>(
    `SELECT id, status
     FROM support_sessions
     WHERE user_id = $1
     ORDER BY
       CASE status WHEN 'OPEN' THEN 0 WHEN 'ACTIVE' THEN 1 ELSE 2 END,
       created_at DESC
     LIMIT 1`,
    [uid]
  );

  if (rows.length === 0) return NextResponse.json({ session_id: null });
  return NextResponse.json({ session_id: rows[0].id, status: rows[0].status });
}

// Finds the existing OPEN/ACTIVE session OR creates a new one.
// Used by Member Profile "Chat" button.
export async function POST(_req: NextRequest, { params }: Ctx) {
  const payload = await requirePermission('livechat.view');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { memberId } = await params;
  const uid = parseInt(memberId, 10);
  if (isNaN(uid)) return NextResponse.json({ error: 'Invalid member ID' }, { status: 400 });

  // Check if member exists
  const userRow = await pool.query<{ id: number }>(
    `SELECT id FROM users WHERE id = $1 LIMIT 1`,
    [uid]
  );
  if (userRow.rows.length === 0) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  // Find existing active session
  const { rows } = await pool.query<{ id: number; status: string }>(
    `SELECT id, status
     FROM support_sessions
     WHERE user_id = $1 AND status IN ('OPEN', 'ACTIVE')
     ORDER BY created_at DESC
     LIMIT 1`,
    [uid]
  );

  if (rows.length > 0) {
    return NextResponse.json({ session_id: rows[0].id, created: false });
  }

  // No active session — create one
  const session = await createSessionForUser(uid, payload.username);
  return NextResponse.json({ session_id: session.id, created: true }, { status: 201 });
}
```

- [ ] **Step 2: Update `openChat()` in `erp/src/app/(dashboard)/members/[id]/page.tsx`**

Find the existing `openChat()` function and replace it:

```typescript
  async function openChat() {
    if (!data) return;
    setChatLoading(true);
    setChatError('');
    try {
      const r = await fetch(`/api/livechat/sessions/by-member/${data.member.id}`, {
        method: 'POST',
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({})) as { error?: string };
        setChatError(d.error ?? '无法打开聊天');
        return;
      }
      const d = await r.json() as { session_id: number };
      router.push(`/livechat?session=${d.session_id}`);
    } catch {
      setChatError('网络错误，请重试');
    } finally {
      setChatLoading(false);
    }
  }
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd erp && npx tsc --noEmit 2>&1 | grep -E "by-member|members/\[id\]"
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add "erp/src/app/api/livechat/sessions/by-member/[memberId]/route.ts" \
        "erp/src/app/(dashboard)/members/[id]/page.tsx"
git commit -m "feat(members): auto-create livechat session from member profile chat button"
```

---

### Task 6: Configurable Notification Interval

Store interval in `system_settings`, fetch on sidebar mount, expose in Brand Center.

**Files:**
- Create: `erp/src/app/api/settings/notifications/route.ts`
- Modify: `erp/src/components/sidebar.tsx`
- Modify: `erp/src/app/(dashboard)/settings/brand/page.tsx`

**Interfaces:**
- Consumes: `getSetting`, `setSettings` from `settings_repo.ts`; migration seed from Task 1
- Produces: `GET /api/settings/notifications` → `{ reminder_interval_ms: number }`; `PATCH /api/settings/notifications` → `{ ok: true }`; sidebar reads interval dynamically

- [ ] **Step 1: Create `erp/src/app/api/settings/notifications/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getSetting, setSettings } from '@/lib/repositories/settings_repo';

const DEFAULT_INTERVAL_MS = 3000;
const ALLOWED_INTERVALS = [2000, 3000, 5000, 8000];

export async function GET() {
  const payload = await requirePermission('livechat.view');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await getSetting('notification_reminder_interval_ms');
  const ms  = parseInt(raw ?? String(DEFAULT_INTERVAL_MS), 10);
  const reminder_interval_ms = ALLOWED_INTERVALS.includes(ms) ? ms : DEFAULT_INTERVAL_MS;
  return NextResponse.json({ reminder_interval_ms });
}

export async function PATCH(req: NextRequest) {
  const payload = await requirePermission('brand.settings');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { reminder_interval_ms?: number };
  if (!ALLOWED_INTERVALS.includes(body.reminder_interval_ms ?? 0)) {
    return NextResponse.json({ error: `reminder_interval_ms must be one of: ${ALLOWED_INTERVALS.join(', ')}` }, { status: 400 });
  }

  await setSettings(
    { notification_reminder_interval_ms: String(body.reminder_interval_ms) },
    payload.username
  );
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Update sidebar to fetch interval on mount**

In `erp/src/components/sidebar.tsx`:

**2a.** Remove the module-level constant:
```
// DELETE this line:
const NOTIFICATION_REPEAT_INTERVAL_MS = 5_000;
```

**2b.** Add a ref for the interval value. Inside `export function Sidebar()`, after the existing state declarations, add:

```typescript
  const notifIntervalMs = useRef<number>(3000);
```

**2c.** In the existing `useEffect` that runs on mount (the one that fetches `/api/auth/me`, brand, maintenance, unread, pending-count — look for the main setup useEffect), add a fetch for the notification interval. Find where other setup fetches happen and add:

```typescript
      // Fetch notification interval
      fetch('/api/settings/notifications')
        .then((r) => r.ok ? r.json() : null)
        .then((d: { reminder_interval_ms?: number } | null) => {
          if (d?.reminder_interval_ms) notifIntervalMs.current = d.reminder_interval_ms;
        })
        .catch(() => {});
```

**2d.** Replace the usage of `NOTIFICATION_REPEAT_INTERVAL_MS` in the `setInterval` call. Find:

```typescript
        }, NOTIFICATION_REPEAT_INTERVAL_MS);
```

Replace with:

```typescript
        }, notifIntervalMs.current);
```

- [ ] **Step 3: Add Notification Settings section to Brand Center page**

In `erp/src/app/(dashboard)/settings/brand/page.tsx`:

**3a.** Add state for the interval setting. Find where component state is declared and add:

```typescript
  const [notifInterval, setNotifInterval]       = useState<number>(3000);
  const [savingNotif,   setSavingNotif]          = useState(false);
```

**3b.** In the `useEffect` (or initial data load) where the brand settings are fetched, also fetch notification settings:

```typescript
      fetch('/api/settings/notifications')
        .then((r) => r.ok ? r.json() : null)
        .then((d: { reminder_interval_ms?: number } | null) => {
          if (d?.reminder_interval_ms) setNotifInterval(d.reminder_interval_ms);
        })
        .catch(() => {});
```

**3c.** Add a save function:

```typescript
  async function saveNotifSettings() {
    setSavingNotif(true);
    try {
      const r = await fetch('/api/settings/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminder_interval_ms: notifInterval }),
      });
      if (r.ok) show('通知设置已保存', 'success');
      else { const d = await r.json() as { error?: string }; show(d.error ?? '保存失败', 'error'); }
    } finally { setSavingNotif(false); }
  }
```

(Note: `show` is the existing toast function already in the brand page.)

**3d.** Add a Notification Settings section to the JSX, after the last existing `<Section>` and before the closing `</form>` or page container. Place it using the existing `Section` component pattern already in the file:

```tsx
<Section title="Notification Settings">
  <div className="space-y-4">
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Transaction Reminder Interval
      </label>
      <p className="text-xs text-gray-500 mb-2">
        How often the pending transaction beep repeats while staff has not acknowledged.
      </p>
      <div className="flex items-center gap-3">
        <select
          value={notifInterval}
          onChange={(e) => setNotifInterval(Number(e.target.value))}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value={2000}>2000 ms (Fast)</option>
          <option value={3000}>3000 ms (Default)</option>
          <option value={5000}>5000 ms (Normal)</option>
          <option value={8000}>8000 ms (Slow)</option>
        </select>
        <button
          type="button"
          onClick={() => void saveNotifSettings()}
          disabled={savingNotif}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {savingNotif ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  </div>
</Section>
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd erp && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add erp/src/app/api/settings/notifications/route.ts \
        erp/src/components/sidebar.tsx \
        "erp/src/app/(dashboard)/settings/brand/page.tsx"
git commit -m "feat(notifications): configurable transaction reminder interval via system_settings"
```

---

### Task 7: MemberCard Tag Search + NotificationSettings Labels

Two small UX improvements: tag search in the "Add tag" dropdown; sound type labels in the notification bell popover.

**Files:**
- Modify: `erp/src/components/livechat/MemberCard.tsx`
- Modify: `erp/src/components/livechat/NotificationSettings.tsx`

**Interfaces:**
- Consumes: Task 2 (CustomerTag with is_active — active-only tags in dropdown)
- Produces: Searchable tag selector; labeled sound toggles

- [ ] **Step 1: Add tag search to MemberCard**

In `erp/src/components/livechat/MemberCard.tsx`:

**1a.** Add state for search after the existing state declarations:

```typescript
  const [tagSearch, setTagSearch] = useState('');
```

**1b.** Also reset tagSearch when member changes. Find the existing `useEffect` that resets tags on member switch and add:

```typescript
  useEffect(() => {
    setTags(member.tags ?? []);
    setSelectedTagId('');
    setTagSearch('');
  }, [member.id]);
```

**1c.** Replace the `<select>` and surrounding `<div className="flex gap-1">` in the Tags section with a searchable version:

```tsx
        <div className="space-y-1">
          <input
            type="text"
            placeholder="Search tags…"
            value={tagSearch}
            onChange={(e) => setTagSearch(e.target.value)}
            className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300"
          />
          <div className="flex gap-1">
            <select
              value={selectedTagId}
              onChange={(e) => setSelectedTagId(e.target.value ? Number(e.target.value) : '')}
              className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300"
              size={1}
            >
              <option value="">Add tag…</option>
              {allTags
                .filter((t) => !tags.some((ct) => ct.id === t.id))
                .filter((t) => !tagSearch.trim() || t.name.toLowerCase().includes(tagSearch.toLowerCase()))
                .map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7 px-2"
              onClick={() => { void handleAddTag(); setTagSearch(''); }}
              disabled={!selectedTagId || addingTag}
            >
              Add
            </Button>
          </div>
        </div>
```

- [ ] **Step 2: Add sound type labels to NotificationSettings**

In `erp/src/components/livechat/NotificationSettings.tsx`, update the `Sound` label to clarify it covers both sounds:

Find:
```tsx
            <label className="flex items-center gap-2 mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.sound}
                onChange={() => handleToggle('sound')}
                className="accent-blue-500"
              />
              <span>Sound</span>
            </label>
```

Replace with:
```tsx
            <label className="flex items-center gap-2 mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.sound}
                onChange={() => handleToggle('sound')}
                className="accent-blue-500"
              />
              <div>
                <span className="block">Sound</span>
                <span className="text-[10px] text-gray-400 leading-tight">Transaction · Live Chat</span>
              </div>
            </label>
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd erp && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add erp/src/components/livechat/MemberCard.tsx \
        erp/src/components/livechat/NotificationSettings.tsx
git commit -m "feat(livechat): tag search in MemberCard; sound labels in notification settings"
```

---

## Self-Review

### Spec Coverage

| Spec Requirement | Covered By |
|---|---|
| Task 1: Auto-create session | Task 5 |
| Task 2: Create/Edit/Delete/Disable/Enable/Color/Sort tag | Tasks 1, 2, 3 |
| Task 2: Search tags | Task 3 + Task 7 |
| Task 2: No hardcoded tags | Task 2 (DB-driven) |
| Task 2: Disabled tags hidden from dropdown | Task 2 (getAllTags active-only default) |
| Task 2: Existing assignments remain visible | Task 2 (getTagsForUser fetches all assigned) |
| Task 2: Tag Management menu | Task 4 |
| Task 3: Default 3000ms | Task 1 (migration seed) |
| Task 3: Configurable | Task 6 |
| Task 3: Start Process stops reminder | Existing logic unchanged |
| Task 4: Sound settings UI | Task 7 |
| Task 5: Member switching resets tags | Done in prior session |
| Task 5: Tag list remains cached | Existing (allTags not re-fetched) |
| Task 5: Tag search | Task 7 |
| Task 6: Performance (allTags cached) | Existing + Task 4 |
| Task 7: No breaking changes | All changes additive |

### Gap Check

- `getAllTags` used in `getSessionsLiveChat` batch-load (line 190–207 of support_repo) also queries customer_tags indirectly — the batch query selects `ct.id, ct.name, ct.color, ct.created_at`. This needs to be updated to include new fields too. **Fix:** In Task 2 Step 7, explicitly call out that ALL `SELECT` statements touching customer_tags columns must be updated.
- `TagBadge` renders `tag.color` and `tag.name` — no change needed; new fields are additive.
- The brand settings page is large and complex. When adding the Notification Settings section, must locate the correct insertion point by searching for the final `</div>` of the page container, not guess line numbers.

### Placeholder Scan

Clean — all steps contain actual code to write.

### Type Consistency

- `CustomerTag` updated once in `types.ts`; all usages derive from that type.
- `createSessionForUser` imported by exact name from `support_repo.ts`.
- `notifIntervalMs` is a `useRef<number>` — consistent with existing `reminderInterval` ref pattern in sidebar.
