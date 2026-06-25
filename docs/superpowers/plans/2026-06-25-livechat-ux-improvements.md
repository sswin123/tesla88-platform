# Phase 3.5 — Live Chat UX & Operations Improvements

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the ERP Live Chat operator experience with desktop notifications, quick replies, internal notes, customer tags, enhanced filters, reply status indicators, image lightbox, extended member cards, improved conversation actions, and audit logging — all without changing existing APIs or breaking the Phase 3 architecture.

**Architecture:** All DB changes are additive (new tables via migration 008). New API routes follow the existing `GET/POST /api/livechat/...` convention. The SSE stream, relay server, and bot code are untouched. Server Component `page.tsx` gains async JWT reading to propagate `currentUsername` to client components.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Tailwind CSS 3, Shadcn UI (Button/Badge/Input), PostgreSQL via `pg` pool, Web Audio API (beep sound — no npm package), Browser Notification API (no npm package)

## Global Constraints

- Never break existing API routes, Docker setup, or database compatibility
- All DB changes additive only — new tables and new nullable/defaulted columns only
- No new npm packages; use only already-installed dependencies
- `cd erp && npm run lint` (`tsc --noEmit`) must pass 0 errors after every task
- Next.js 15: `params` is `Promise<{id: string}>` — always `await params`; `useSearchParams()` requires Suspense
- Auth: JWT cookie via `verifyJWT(token)` → payload `{ sub: number, username: string, role: AdminRole }`
- `logAudit` signature: `logAudit({ admin_id: number, action: string, target_type: string, target_id?: number | null, old_value?: Record<string,unknown> | null, new_value?: Record<string,unknown> | null }): Promise<void>`
- Typing Indicator (spec #9) deferred — requires bot-side relay changes outside this scope
- Voice waveform (spec #13 advanced) deferred — `<audio controls>` already present; waveform needs canvas library
- Performance tuning (spec #15) deferred — current architecture handles stated load without changes

---

## File Map

**New files:**
- `erp/migrations/008_livechat_ux.sql` — new tables
- `erp/src/hooks/useNotifications.ts` — browser notification + sound hook
- `erp/src/components/livechat/NotificationSettings.tsx` — settings popover
- `erp/src/components/livechat/NotesPanel.tsx` — internal notes UI
- `erp/src/components/livechat/TagPicker.tsx` — tag management in MemberCard
- `erp/src/components/livechat/ImageLightbox.tsx` — fullscreen image viewer
- `erp/src/app/api/livechat/quick-replies/route.ts` — list + create quick replies
- `erp/src/app/api/livechat/quick-replies/[id]/route.ts` — update + delete
- `erp/src/app/api/livechat/sessions/[id]/notes/route.ts` — list + create notes
- `erp/src/app/api/livechat/sessions/[id]/notes/[noteId]/route.ts` — delete note
- `erp/src/app/api/livechat/tags/route.ts` — list + create tags catalog
- `erp/src/app/api/livechat/tags/[id]/route.ts` — delete tag
- `erp/src/app/api/members/[id]/tags/route.ts` — get/add/remove user tags
- `erp/src/app/(dashboard)/livechat/settings/page.tsx` — quick reply admin page

**Modified files:**
- `erp/migrations/` — add 008
- `database.sql` — add new tables (for fresh Docker deployments)
- `erp/src/lib/types.ts` — new: `QuickReply`, `SessionNote`, `CustomerTag`; extend: `MemberCardData`, `SupportSession`
- `erp/src/lib/repositories/support_repo.ts` — new functions for notes, quick replies, tags, enhanced member card
- `erp/src/app/(dashboard)/livechat/page.tsx` — async, reads JWT, passes `currentUsername`
- `erp/src/app/(dashboard)/livechat/LiveChatClient.tsx` — accepts `currentUsername`, passes filters
- `erp/src/app/api/livechat/sessions/route.ts` — new filter params + auth for assigned_to_me
- `erp/src/app/api/livechat/sessions/[id]/route.ts` — add audit logging on PATCH
- `erp/src/components/livechat/ConversationList.tsx` — new filter pills, notification hook
- `erp/src/components/livechat/SessionCard.tsx` — show tags
- `erp/src/components/livechat/ReplyBox.tsx` — quick replies picker + reply status
- `erp/src/components/livechat/MemberCard.tsx` — extended data + tags panel
- `erp/src/components/livechat/SessionActions.tsx` — Transfer + Copy Telegram ID buttons
- `erp/src/components/livechat/ChatWindow.tsx` — image lightbox trigger

---

### Task 1: DB Migration 008

**Files:**
- Create: `erp/migrations/008_livechat_ux.sql`
- Modify: `database.sql`

**Interfaces:**
- Produces: tables `quick_replies`, `session_notes`, `customer_tags`, `user_tag_assignments`

- [ ] **Step 1: Write migration file**

```sql
-- erp/migrations/008_livechat_ux.sql

-- Quick replies for ERP agents
CREATE TABLE IF NOT EXISTS quick_replies (
    id         SERIAL       PRIMARY KEY,
    title      VARCHAR(100) NOT NULL,
    body       TEXT         NOT NULL,
    sort_order INTEGER      NOT NULL DEFAULT 0,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ  DEFAULT NOW()
);

INSERT INTO quick_replies (title, body, sort_order) VALUES
  ('Please wait',          'Please wait a moment.',              1),
  ('Send receipt',         'Please send your deposit receipt.',  2),
  ('Withdrawal approved',  'Your withdrawal has been approved.', 3),
  ('Restart Telegram',     'Please restart Telegram and try again.', 4),
  ('Thank you',            'Thank you for contacting support.',  5)
ON CONFLICT DO NOTHING;

-- Internal notes per session (never sent to customer)
CREATE TABLE IF NOT EXISTS session_notes (
    id         SERIAL       PRIMARY KEY,
    session_id INTEGER      NOT NULL REFERENCES support_sessions(id) ON DELETE CASCADE,
    author     VARCHAR(100) NOT NULL,
    body       TEXT         NOT NULL,
    created_at TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_notes_session
    ON session_notes(session_id);

-- Customer tag catalog
CREATE TABLE IF NOT EXISTS customer_tags (
    id         SERIAL      PRIMARY KEY,
    name       VARCHAR(50) NOT NULL UNIQUE,
    color      VARCHAR(7)  NOT NULL DEFAULT '#6b7280',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO customer_tags (name, color) VALUES
  ('VIP',           '#f59e0b'),
  ('High Risk',     '#ef4444'),
  ('Bonus Abuse',   '#8b5cf6'),
  ('Big Depositor', '#10b981'),
  ('Slow Payer',    '#f97316'),
  ('Blacklist',     '#1f2937')
ON CONFLICT DO NOTHING;

-- User ↔ tag many-to-many
CREATE TABLE IF NOT EXISTS user_tag_assignments (
    user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tag_id     INTEGER     NOT NULL REFERENCES customer_tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_user_tag_assignments_user
    ON user_tag_assignments(user_id);

CREATE INDEX IF NOT EXISTS idx_user_tag_assignments_tag
    ON user_tag_assignments(tag_id);
```

- [ ] **Step 2: Apply migration to running DB**

```bash
# From repo root — adjust connection string as needed
psql "$DATABASE_URL" -f erp/migrations/008_livechat_ux.sql
```

Expected: `CREATE TABLE`, `INSERT 5`, `CREATE TABLE`, `CREATE INDEX` etc. — no errors.

- [ ] **Step 3: Add same tables to database.sql (for fresh Docker deployments)**

In `database.sql`, after the existing SSE trigger block and before the `-- Phase 5A` section, add the entire SQL from Step 1 (same content).

- [ ] **Step 4: Verify**

```bash
# Connect to DB and check tables exist
psql "$DATABASE_URL" -c "\dt quick_replies session_notes customer_tags user_tag_assignments"
```

Expected: 4 rows in listing.

- [ ] **Step 5: Commit**

```bash
git add erp/migrations/008_livechat_ux.sql database.sql
git commit -m "feat(livechat): migration 008 — quick replies, session notes, customer tags"
```

---

### Task 2: Filter Enhancements (API + propagate current user)

**Files:**
- Modify: `erp/src/lib/repositories/support_repo.ts`
- Modify: `erp/src/app/api/livechat/sessions/route.ts`
- Modify: `erp/src/app/(dashboard)/livechat/page.tsx`
- Modify: `erp/src/app/(dashboard)/livechat/LiveChatClient.tsx`
- Modify: `erp/src/components/livechat/ConversationList.tsx`

**Interfaces:**
- `getSessionsLiveChat` gains new optional params: `assigned_to?: string`, `unassigned?: boolean`, `has_unread?: boolean`, `date_range?: 'today' | 'last_7_days'`
- `LiveChatClient` gains prop: `currentUsername: string | null`
- `ConversationList` gains prop: `currentUsername: string | null`

- [ ] **Step 1: Extend `getSessionsLiveChat` in `support_repo.ts`**

Find the existing function signature:
```typescript
export async function getSessionsLiveChat(opts: {
  status?: string;
  search?: string;
  limit: number;
  offset: number;
```

Replace with:
```typescript
export async function getSessionsLiveChat(opts: {
  status?: string;
  search?: string;
  assigned_to?: string;
  unassigned?: boolean;
  has_unread?: boolean;
  date_range?: 'today' | 'last_7_days';
  limit: number;
  offset: number;
```

Then in the filter-building block, after the existing `if (opts.search)` block, add:

```typescript
  if (opts.assigned_to) {
    mainConditions.push(`ss.assigned_to_username = $${pIdx++}`);
    mainParams.push(opts.assigned_to);
    countConditions.push(`ss.assigned_to_username = $${cIdx++}`);
    countParams.push(opts.assigned_to);
  }
  if (opts.unassigned) {
    mainConditions.push(`ss.assigned_to_username IS NULL`);
    countConditions.push(`ss.assigned_to_username IS NULL`);
  }
  if (opts.has_unread) {
    mainConditions.push(`ss.erp_unread_count > 0`);
    countConditions.push(`ss.erp_unread_count > 0`);
  }
  if (opts.date_range === 'today') {
    mainConditions.push(`ss.last_message_at::date = CURRENT_DATE`);
    countConditions.push(`ss.last_message_at::date = CURRENT_DATE`);
  } else if (opts.date_range === 'last_7_days') {
    mainConditions.push(`ss.last_message_at >= NOW() - INTERVAL '7 days'`);
    countConditions.push(`ss.last_message_at >= NOW() - INTERVAL '7 days'`);
  }
```

Also extend the existing search to include phone and session ID. Find:
```typescript
  if (opts.search) {
    mainConditions.push(
      `(u.first_name ILIKE $${pIdx} OR u.telegram_username ILIKE $${pIdx} OR u.id::text = $${pIdx + 1})`
    );
    mainParams.push(`%${opts.search}%`, opts.search);
    pIdx += 2;

    countConditions.push(
      `(u.first_name ILIKE $${cIdx} OR u.telegram_username ILIKE $${cIdx} OR u.id::text = $${cIdx + 1})`
    );
    countParams.push(`%${opts.search}%`, opts.search);
    cIdx += 2;
  }
```

Replace with:
```typescript
  if (opts.search) {
    mainConditions.push(
      `(u.first_name ILIKE $${pIdx} OR u.telegram_username ILIKE $${pIdx} OR u.phone ILIKE $${pIdx} OR u.id::text = $${pIdx + 1} OR ss.id::text = $${pIdx + 1})`
    );
    mainParams.push(`%${opts.search}%`, opts.search);
    pIdx += 2;

    countConditions.push(
      `(u.first_name ILIKE $${cIdx} OR u.telegram_username ILIKE $${cIdx} OR u.phone ILIKE $${cIdx} OR u.id::text = $${cIdx + 1} OR ss.id::text = $${cIdx + 1})`
    );
    countParams.push(`%${opts.search}%`, opts.search);
    cIdx += 2;
  }
```

- [ ] **Step 2: Update `GET /api/livechat/sessions/route.ts`**

Replace the entire file content:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getSessionsLiveChat, getSessionStats } from '@/lib/repositories/support_repo';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const status     = searchParams.get('status')     ?? undefined;
  const search     = searchParams.get('search')     ?? undefined;
  const unassigned = searchParams.get('unassigned') === 'true';
  const has_unread = searchParams.get('has_unread') === 'true';
  const date_range = (searchParams.get('date_range') ?? undefined) as
    'today' | 'last_7_days' | undefined;
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit  = 30;
  const offset = (page - 1) * limit;

  // "assigned_to_me" requires reading the caller's identity
  let assigned_to: string | undefined;
  if (searchParams.get('assigned_to_me') === 'true') {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    const payload = token ? await verifyJWT(token) : null;
    if (payload) assigned_to = payload.username;
  }

  const [{ sessions, total }, stats] = await Promise.all([
    getSessionsLiveChat({ status, search, assigned_to, unassigned, has_unread, date_range, limit, offset }),
    getSessionStats(),
  ]);

  return NextResponse.json({ sessions, total, page, limit, stats });
}
```

- [ ] **Step 3: Update `livechat/page.tsx` to pass `currentUsername`**

Replace entire `page.tsx`:

```tsx
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import LiveChatClient from './LiveChatClient';

export default async function Page() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;

  return (
    <Suspense fallback={<div>Loading…</div>}>
      <LiveChatClient currentUsername={payload?.username ?? null} />
    </Suspense>
  );
}
```

- [ ] **Step 4: Update `LiveChatClient.tsx` to accept and forward `currentUsername`**

Add prop to function signature:
```typescript
export default function LiveChatClient({ currentUsername }: { currentUsername: string | null }) {
```

Pass it to `ConversationList`:
```tsx
<ConversationList
  selectedId={selectedId}
  onSelect={handleSelect}
  currentUsername={currentUsername}
/>
```

- [ ] **Step 5: Update `ConversationList.tsx` — add filter UI**

Add `currentUsername` prop and new filter state:

```typescript
export function ConversationList({
  selectedId,
  onSelect,
  currentUsername,
}: {
  selectedId: number | null;
  onSelect: (id: number) => void;
  currentUsername: string | null;
}) {
```

Add filter state after existing `const [search, setSearch] = useState('');`:
```typescript
  type QuickFilter = '' | 'OPEN' | 'ACTIVE' | 'CLOSED' | 'assigned_to_me' | 'unassigned' | 'has_unread' | 'today' | 'last_7_days';
  const [filter, setFilter] = useState<QuickFilter>('');
```

Remove `const [tab, setTab] = useState('');` (replaced by `filter`).

Update the `load` callback to use `filter`:
```typescript
  const load = useCallback(async (f: QuickFilter, q: string) => {
    setLoading(true);
    const params = new URLSearchParams({ page: '1' });
    if (f === 'OPEN' || f === 'ACTIVE' || f === 'CLOSED') params.set('status', f);
    else if (f === 'assigned_to_me') params.set('assigned_to_me', 'true');
    else if (f === 'unassigned')     params.set('unassigned', 'true');
    else if (f === 'has_unread')     params.set('has_unread', 'true');
    else if (f === 'today')          params.set('date_range', 'today');
    else if (f === 'last_7_days')    params.set('date_range', 'last_7_days');
    if (q) params.set('search', q);
    const r = await fetch(`/api/livechat/sessions?${params}`);
    const d = await r.json();
    setSessions(d.sessions ?? []);
    setTotal(d.total ?? 0);
    setStats(d.stats ?? { open: 0, active: 0, closed_today: 0 });
    setLoading(false);
  }, []);
```

Update both useEffects: replace `tab` with `filter`.

Replace the TABS block and tab rendering with:
```tsx
      {/* Filter pills */}
      <div className="flex flex-wrap gap-1 border-b px-3 py-2">
        {([
          { label: 'All',          value: ''             },
          { label: 'Waiting',      value: 'OPEN'         },
          { label: 'Active',       value: 'ACTIVE'       },
          { label: 'Closed',       value: 'CLOSED'       },
          { label: 'Mine',         value: 'assigned_to_me', hide: !currentUsername },
          { label: 'Unassigned',   value: 'unassigned'   },
          { label: 'Unread',       value: 'has_unread'   },
          { label: 'Today',        value: 'today'        },
          { label: 'Last 7 days',  value: 'last_7_days'  },
        ] as { label: string; value: QuickFilter; hide?: boolean }[])
          .filter((f) => !f.hide)
          .map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                filter === f.value
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
      </div>
```

- [ ] **Step 6: Lint + verify**

```bash
cd erp && npm run lint
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add erp/src/lib/repositories/support_repo.ts \
        erp/src/app/api/livechat/sessions/route.ts \
        erp/src/app/\(dashboard\)/livechat/page.tsx \
        erp/src/app/\(dashboard\)/livechat/LiveChatClient.tsx \
        erp/src/components/livechat/ConversationList.tsx
git commit -m "feat(livechat): filter pills — Assigned to me, Unassigned, Has unread, date range + phone/session-ID search"
```

---

### Task 3: Desktop Notifications + Sound + Settings

**Files:**
- Create: `erp/src/hooks/useNotifications.ts`
- Create: `erp/src/components/livechat/NotificationSettings.tsx`
- Modify: `erp/src/components/livechat/ConversationList.tsx`

**Interfaces:**
- `useNotifications(opts: NotifSettings, selectedId: number | null): void` — SSE + notification trigger (internal hook, no external callers beyond ConversationList)
- `NotifSettings: { sound: boolean; browser: boolean }` — stored in localStorage key `livechat_notif`

- [ ] **Step 1: Create `erp/src/hooks/useNotifications.ts`**

```typescript
'use client';

import { useEffect, useRef } from 'react';

export interface NotifSettings {
  sound: boolean;
  browser: boolean;
}

export const NOTIF_KEY = 'livechat_notif';

export function loadNotifSettings(): NotifSettings {
  if (typeof window === 'undefined') return { sound: true, browser: true };
  try {
    return JSON.parse(localStorage.getItem(NOTIF_KEY) ?? 'null') ?? { sound: true, browser: true };
  } catch {
    return { sound: true, browser: true };
  }
}

export function saveNotifSettings(s: NotifSettings): void {
  localStorage.setItem(NOTIF_KEY, JSON.stringify(s));
}

function playBeep(): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // AudioContext not available (test env / SSR)
  }
}

function showBrowserNotif(title: string, body: string): void {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico', silent: true });
  }
}

export function useNotifications(
  settings: NotifSettings,
  selectedId: number | null,
  memberName?: string,
): void {
  const settingsRef = useRef(settings);
  const selectedIdRef = useRef(selectedId);
  const memberNameRef = useRef(memberName);

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { memberNameRef.current = memberName; }, [memberName]);

  useEffect(() => {
    const es = new EventSource('/api/livechat/stream');

    es.onmessage = (e: MessageEvent) => {
      try {
        const evt = JSON.parse(e.data as string) as {
          type: string;
          session_id: number;
          sender_type?: string;
        };

        if (evt.type !== 'new_message' || evt.sender_type !== 'USER') return;

        const s = settingsRef.current;
        if (s.sound) playBeep();
        if (s.browser) {
          const name = evt.session_id === selectedIdRef.current
            ? (memberNameRef.current ?? 'Customer')
            : 'Customer';
          showBrowserNotif('New message', `${name} sent a message`);
        }
      } catch {
        // ignore parse errors
      }
    };

    return () => es.close();
  }, []); // intentionally empty deps — uses refs for settings
}
```

- [ ] **Step 2: Create `erp/src/components/livechat/NotificationSettings.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { loadNotifSettings, saveNotifSettings } from '@/hooks/useNotifications';
import type { NotifSettings } from '@/hooks/useNotifications';

export function NotificationSettings({
  settings,
  onChange,
}: {
  settings: NotifSettings;
  onChange: (s: NotifSettings) => void;
}) {
  const [open, setOpen] = useState(false);

  function toggle(key: keyof NotifSettings) {
    const next = { ...settings, [key]: !settings[key] };
    saveNotifSettings(next);
    onChange(next);
    if (key === 'browser' && next.browser && typeof Notification !== 'undefined') {
      if (Notification.permission === 'default') {
        void Notification.requestPermission();
      }
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Notification settings"
        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      >
        🔔
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-20 w-52 rounded-lg border bg-white shadow-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-600 mb-1">Notifications</p>
            {([
              { key: 'sound',   label: '🔊 Sound' },
              { key: 'browser', label: '🖥 Browser popup' },
            ] as { key: keyof NotifSettings; label: string }[]).map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={settings[key]}
                  onChange={() => toggle(key)}
                  className="accent-blue-500"
                />
                {label}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire into `ConversationList.tsx`**

Add imports at the top:
```typescript
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNotifications, loadNotifSettings } from '@/hooks/useNotifications';
import { NotificationSettings } from './NotificationSettings';
import type { NotifSettings } from '@/hooks/useNotifications';
```

Add state inside the component (after existing state declarations):
```typescript
  const [notifSettings, setNotifSettings] = useState<NotifSettings>({ sound: true, browser: true });
  useEffect(() => { setNotifSettings(loadNotifSettings()); }, []);
  useNotifications(notifSettings, selectedId);
```

In the header JSX, replace:
```tsx
          <span className="text-xs text-gray-400">{total} sessions</span>
```
with:
```tsx
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">{total} sessions</span>
            <NotificationSettings settings={notifSettings} onChange={setNotifSettings} />
          </div>
```

- [ ] **Step 4: Lint + verify**

```bash
cd erp && npm run lint
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add erp/src/hooks/useNotifications.ts \
        erp/src/components/livechat/NotificationSettings.tsx \
        erp/src/components/livechat/ConversationList.tsx
git commit -m "feat(livechat): desktop notifications — browser popup + sound + settings panel"
```

---

### Task 4: Quick Replies

**Files:**
- Create: `erp/src/app/api/livechat/quick-replies/route.ts`
- Create: `erp/src/app/api/livechat/quick-replies/[id]/route.ts`
- Create: `erp/src/app/(dashboard)/livechat/settings/page.tsx`
- Modify: `erp/src/lib/types.ts` — add `QuickReply` interface
- Modify: `erp/src/lib/repositories/support_repo.ts` — add `getQuickReplies`, `createQuickReply`, `updateQuickReply`, `deleteQuickReply`
- Modify: `erp/src/components/livechat/ReplyBox.tsx` — quick reply picker button

**Interfaces:**
- `QuickReply: { id: number; title: string; body: string; sort_order: number; created_at: string }`
- `getQuickReplies(): Promise<QuickReply[]>`
- `createQuickReply(data: { title: string; body: string; sort_order: number; created_by: string }): Promise<QuickReply>`
- `updateQuickReply(id: number, data: { title?: string; body?: string; sort_order?: number }): Promise<QuickReply | null>`
- `deleteQuickReply(id: number): Promise<void>`

- [ ] **Step 1: Add `QuickReply` to `erp/src/lib/types.ts`**

Append after the existing `MemberCardData` interface:
```typescript
// ── Quick Replies ─────────────────────────────────────────────────────────────

export interface QuickReply {
  id: number;
  title: string;
  body: string;
  sort_order: number;
  created_at: string;
}
```

- [ ] **Step 2: Add repo functions to `support_repo.ts`**

Append to the bottom of the file:
```typescript
// ── Quick Replies ─────────────────────────────────────────────────────────────

export async function getQuickReplies(): Promise<import('@/lib/types').QuickReply[]> {
  const { rows } = await pool.query(
    `SELECT id, title, body, sort_order, created_at
     FROM quick_replies ORDER BY sort_order, id`
  );
  return rows;
}

export async function createQuickReply(data: {
  title: string;
  body: string;
  sort_order: number;
  created_by: string;
}): Promise<import('@/lib/types').QuickReply> {
  const { rows } = await pool.query(
    `INSERT INTO quick_replies (title, body, sort_order, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id, title, body, sort_order, created_at`,
    [data.title, data.body, data.sort_order, data.created_by]
  );
  return rows[0];
}

export async function updateQuickReply(
  id: number,
  data: { title?: string; body?: string; sort_order?: number }
): Promise<import('@/lib/types').QuickReply | null> {
  const sets: string[] = [];
  const params: (string | number)[] = [];
  let i = 1;
  if (data.title !== undefined)      { sets.push(`title=$${i++}`);      params.push(data.title); }
  if (data.body !== undefined)       { sets.push(`body=$${i++}`);       params.push(data.body); }
  if (data.sort_order !== undefined) { sets.push(`sort_order=$${i++}`); params.push(data.sort_order); }
  if (!sets.length) return null;
  params.push(id);
  const { rows } = await pool.query(
    `UPDATE quick_replies SET ${sets.join(', ')} WHERE id=$${i} RETURNING id, title, body, sort_order, created_at`,
    params
  );
  return rows[0] ?? null;
}

export async function deleteQuickReply(id: number): Promise<void> {
  await pool.query(`DELETE FROM quick_replies WHERE id=$1`, [id]);
}
```

- [ ] **Step 3: Create `erp/src/app/api/livechat/quick-replies/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getQuickReplies, createQuickReply } from '@/lib/repositories/support_repo';

export async function GET() {
  const replies = await getQuickReplies();
  return NextResponse.json({ replies });
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const title: string = (body.title ?? '').trim();
  const text: string  = (body.body  ?? '').trim();
  if (!title || !text) return NextResponse.json({ error: 'title and body required' }, { status: 400 });

  const reply = await createQuickReply({
    title,
    body: text,
    sort_order: body.sort_order ?? 0,
    created_by: payload.username,
  });
  return NextResponse.json({ reply }, { status: 201 });
}
```

- [ ] **Step 4: Create `erp/src/app/api/livechat/quick-replies/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { updateQuickReply, deleteQuickReply } from '@/lib/repositories/support_repo';

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  return token ? await verifyJWT(token) : null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const reply = await updateQuickReply(parseInt(id, 10), {
    title:      body.title,
    body:       body.body,
    sort_order: body.sort_order,
  });
  if (!reply) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ reply });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  await deleteQuickReply(parseInt(id, 10));
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Create quick replies settings page `erp/src/app/(dashboard)/livechat/settings/page.tsx`**

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { QuickReply } from '@/lib/types';

export default function QuickRepliesSettingsPage() {
  const [replies, setReplies]     = useState<QuickReply[]>([]);
  const [newTitle, setNewTitle]   = useState('');
  const [newBody, setNewBody]     = useState('');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  const load = useCallback(async () => {
    const r = await fetch('/api/livechat/quick-replies');
    const d = await r.json();
    setReplies(d.replies ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleCreate() {
    if (!newTitle.trim() || !newBody.trim()) return;
    setSaving(true); setError('');
    const r = await fetch('/api/livechat/quick-replies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle, body: newBody, sort_order: replies.length }),
    });
    if (r.ok) {
      setNewTitle(''); setNewBody('');
      await load();
    } else {
      const d = await r.json().catch(() => ({}));
      setError((d as { error?: string }).error ?? 'Failed');
    }
    setSaving(false);
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this quick reply?')) return;
    await fetch(`/api/livechat/quick-replies/${id}`, { method: 'DELETE' });
    await load();
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Quick Replies</h1>

      {/* Existing replies */}
      <div className="space-y-2 mb-6">
        {replies.map((r) => (
          <div key={r.id} className="flex items-start gap-3 rounded-lg border p-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{r.title}</p>
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{r.body}</p>
            </div>
            <Button
              size="sm"
              variant="destructive"
              className="flex-shrink-0"
              onClick={() => handleDelete(r.id)}
            >
              Delete
            </Button>
          </div>
        ))}
        {replies.length === 0 && (
          <p className="text-sm text-gray-400">No quick replies yet.</p>
        )}
      </div>

      {/* Add new */}
      <div className="rounded-lg border p-4 space-y-3">
        <h2 className="text-sm font-medium">Add Quick Reply</h2>
        <Input
          placeholder="Title (e.g. Please wait)"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          className="h-9 text-sm"
        />
        <textarea
          placeholder="Reply text…"
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <Button size="sm" onClick={handleCreate} disabled={saving || !newTitle.trim() || !newBody.trim()}>
          {saving ? 'Adding…' : 'Add Reply'}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Add quick reply picker to `ReplyBox.tsx`**

Add a `⚡` button to the ReplyBox toolbar. When clicked, shows an inline list of quick replies; clicking one fills the textarea.

At the top of `ReplyBox.tsx`, add import:
```typescript
import { useEffect, useState } from 'react';
import type { QuickReply } from '@/lib/types';
```

(Merge with existing imports.)

Inside `ReplyBox` component, add state and fetch:
```typescript
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    fetch('/api/livechat/quick-replies')
      .then((r) => r.json())
      .then((d) => setQuickReplies(d.replies ?? []))
      .catch(() => {});
  }, []);
```

In the toolbar JSX (after the emoji button), add:
```tsx
        {/* Quick replies */}
        {quickReplies.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowQR((v) => !v)}
              className="p-1.5 rounded hover:bg-gray-100 text-sm font-medium text-gray-500"
              title="Quick replies"
            >
              ⚡
            </button>
            {showQR && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowQR(false)} />
                <div className="absolute bottom-8 left-0 z-20 w-72 rounded-lg border bg-white shadow-lg py-1 max-h-60 overflow-y-auto">
                  {quickReplies.map((qr) => (
                    <button
                      key={qr.id}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-0"
                      onClick={() => {
                        setText(qr.body);
                        setShowQR(false);
                        textareaRef.current?.focus();
                      }}
                    >
                      <p className="text-xs font-medium text-gray-700">{qr.title}</p>
                      <p className="text-xs text-gray-400 truncate">{qr.body}</p>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
```

- [ ] **Step 7: Lint + verify**

```bash
cd erp && npm run lint
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add erp/src/lib/types.ts \
        erp/src/lib/repositories/support_repo.ts \
        erp/src/app/api/livechat/quick-replies/ \
        erp/src/app/\(dashboard\)/livechat/settings/ \
        erp/src/components/livechat/ReplyBox.tsx
git commit -m "feat(livechat): quick replies — admin settings page + ReplyBox picker"
```

---

### Task 5: Internal Notes

**Files:**
- Create: `erp/src/app/api/livechat/sessions/[id]/notes/route.ts`
- Create: `erp/src/app/api/livechat/sessions/[id]/notes/[noteId]/route.ts`
- Create: `erp/src/components/livechat/NotesPanel.tsx`
- Modify: `erp/src/lib/types.ts` — add `SessionNote`
- Modify: `erp/src/lib/repositories/support_repo.ts` — add `getSessionNotes`, `createSessionNote`, `deleteSessionNote`
- Modify: `erp/src/app/(dashboard)/livechat/LiveChatClient.tsx` — add NotesPanel to right sidebar

**Interfaces:**
- `SessionNote: { id: number; session_id: number; author: string; body: string; created_at: string }`
- `getSessionNotes(sessionId: number): Promise<SessionNote[]>`
- `createSessionNote(data: { session_id: number; author: string; body: string }): Promise<SessionNote>`
- `deleteSessionNote(noteId: number): Promise<void>`

- [ ] **Step 1: Add `SessionNote` to `erp/src/lib/types.ts`**

Append after `QuickReply`:
```typescript
export interface SessionNote {
  id: number;
  session_id: number;
  author: string;
  body: string;
  created_at: string;
}
```

- [ ] **Step 2: Add repo functions to `support_repo.ts`**

Append:
```typescript
// ── Session Notes ─────────────────────────────────────────────────────────────

export async function getSessionNotes(sessionId: number): Promise<import('@/lib/types').SessionNote[]> {
  const { rows } = await pool.query(
    `SELECT id, session_id, author, body, created_at
     FROM session_notes WHERE session_id = $1 ORDER BY created_at ASC`,
    [sessionId]
  );
  return rows;
}

export async function createSessionNote(data: {
  session_id: number;
  author: string;
  body: string;
}): Promise<import('@/lib/types').SessionNote> {
  const { rows } = await pool.query(
    `INSERT INTO session_notes (session_id, author, body)
     VALUES ($1, $2, $3)
     RETURNING id, session_id, author, body, created_at`,
    [data.session_id, data.author, data.body]
  );
  return rows[0];
}

export async function deleteSessionNote(noteId: number): Promise<void> {
  await pool.query(`DELETE FROM session_notes WHERE id = $1`, [noteId]);
}
```

- [ ] **Step 3: Create `erp/src/app/api/livechat/sessions/[id]/notes/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getSessionNotes, createSessionNote } from '@/lib/repositories/support_repo';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const notes = await getSessionNotes(parseInt(id, 10));
  return NextResponse.json({ notes });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const text: string = (body.body ?? '').trim();
  if (!text) return NextResponse.json({ error: 'body required' }, { status: 400 });

  const note = await createSessionNote({
    session_id: parseInt(id, 10),
    author: payload.username,
    body: text,
  });
  return NextResponse.json({ note }, { status: 201 });
}
```

- [ ] **Step 4: Create `erp/src/app/api/livechat/sessions/[id]/notes/[noteId]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { deleteSessionNote } from '@/lib/repositories/support_repo';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!(token ? await verifyJWT(token) : null))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { noteId } = await params;
  await deleteSessionNote(parseInt(noteId, 10));
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Create `erp/src/components/livechat/NotesPanel.tsx`**

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import type { SessionNote } from '@/lib/types';

export function NotesPanel({ sessionId }: { sessionId: number }) {
  const [notes, setNotes]   = useState<SessionNote[]>([]);
  const [body, setBody]     = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/livechat/sessions/${sessionId}/notes`);
    const d = await r.json();
    setNotes(d.notes ?? []);
  }, [sessionId]);

  useEffect(() => { void load(); }, [load]);

  async function handleAdd() {
    if (!body.trim()) return;
    setSaving(true);
    const r = await fetch(`/api/livechat/sessions/${sessionId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    if (r.ok) {
      setBody('');
      await load();
    }
    setSaving(false);
  }

  async function handleDelete(id: number) {
    await fetch(`/api/livechat/sessions/${sessionId}/notes/${id}`, { method: 'DELETE' });
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  return (
    <div className="border-t">
      <div className="p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Internal Notes
        </p>
        <div className="space-y-2 mb-3 max-h-40 overflow-y-auto">
          {notes.map((n) => (
            <div key={n.id} className="rounded bg-yellow-50 border border-yellow-200 p-2 text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-gray-600">@{n.author}</span>
                <div className="flex items-center gap-1 text-gray-400">
                  <span>{new Date(n.created_at).toLocaleDateString()}</span>
                  <button
                    onClick={() => handleDelete(n.id)}
                    className="hover:text-red-500 leading-none"
                    title="Delete note"
                  >
                    ×
                  </button>
                </div>
              </div>
              <p className="whitespace-pre-wrap break-words text-gray-700">{n.body}</p>
            </div>
          ))}
          {notes.length === 0 && (
            <p className="text-xs text-gray-400">No internal notes.</p>
          )}
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a note (internal only)…"
          className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs resize-none h-16 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <Button
          size="sm"
          className="mt-1 w-full"
          variant="outline"
          onClick={handleAdd}
          disabled={saving || !body.trim()}
        >
          {saving ? 'Saving…' : 'Add Note'}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Add `NotesPanel` to `LiveChatClient.tsx` right sidebar**

Add import:
```typescript
import { NotesPanel } from '@/components/livechat/NotesPanel';
```

In the right sidebar JSX, after the closing `</MemberCard>` tag:
```tsx
          {member && session ? (
            <>
              <MemberCard
                member={member}
                session={session}
                onStatusChange={(s) => setMember((m) => (m ? { ...m, status: s } : m))}
              />
              <NotesPanel sessionId={session.id} />
            </>
          ) : (
            ...
          )}
```

- [ ] **Step 7: Lint + verify**

```bash
cd erp && npm run lint
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add erp/src/lib/types.ts \
        erp/src/lib/repositories/support_repo.ts \
        erp/src/app/api/livechat/sessions/\[id\]/notes/ \
        erp/src/components/livechat/NotesPanel.tsx \
        erp/src/app/\(dashboard\)/livechat/LiveChatClient.tsx
git commit -m "feat(livechat): internal notes — per-session notes visible only inside ERP"
```

---

### Task 6: Customer Tags

**Files:**
- Create: `erp/src/app/api/livechat/tags/route.ts`
- Create: `erp/src/app/api/livechat/tags/[id]/route.ts`
- Create: `erp/src/app/api/members/[id]/tags/route.ts`
- Create: `erp/src/components/livechat/TagPicker.tsx`
- Modify: `erp/src/lib/types.ts` — add `CustomerTag`; extend `MemberCardData` with `tags`
- Modify: `erp/src/lib/repositories/support_repo.ts` — add tag repo functions; extend `getSessionWithDetails` to fetch tags
- Modify: `erp/src/components/livechat/MemberCard.tsx` — show tags + TagPicker
- Modify: `erp/src/components/livechat/SessionCard.tsx` — show up to 3 tags

**Interfaces:**
- `CustomerTag: { id: number; name: string; color: string; created_at: string }`
- `MemberCardData.tags: CustomerTag[]` (new field)
- `getAllTags(): Promise<CustomerTag[]>`
- `createTag(data: { name: string; color: string }): Promise<CustomerTag>`
- `deleteTag(id: number): Promise<void>`
- `getUserTags(userId: number): Promise<CustomerTag[]>`
- `addUserTag(userId: number, tagId: number): Promise<void>`
- `removeUserTag(userId: number, tagId: number): Promise<void>`

- [ ] **Step 1: Add `CustomerTag` to `erp/src/lib/types.ts`**

Append after `SessionNote`:
```typescript
export interface CustomerTag {
  id: number;
  name: string;
  color: string;
  created_at: string;
}
```

Extend `MemberCardData` — add `tags: CustomerTag[];` field:
```typescript
export interface MemberCardData {
  // ...existing fields...
  tags: CustomerTag[];
}
```

- [ ] **Step 2: Add tag repo functions to `support_repo.ts`**

Append:
```typescript
// ── Customer Tags ─────────────────────────────────────────────────────────────

export async function getAllTags(): Promise<import('@/lib/types').CustomerTag[]> {
  const { rows } = await pool.query(
    `SELECT id, name, color, created_at FROM customer_tags ORDER BY name`
  );
  return rows;
}

export async function createTag(data: { name: string; color: string }): Promise<import('@/lib/types').CustomerTag> {
  const { rows } = await pool.query(
    `INSERT INTO customer_tags (name, color) VALUES ($1, $2)
     RETURNING id, name, color, created_at`,
    [data.name, data.color]
  );
  return rows[0];
}

export async function deleteTag(id: number): Promise<void> {
  await pool.query(`DELETE FROM customer_tags WHERE id=$1`, [id]);
}

export async function getUserTags(userId: number): Promise<import('@/lib/types').CustomerTag[]> {
  const { rows } = await pool.query(
    `SELECT ct.id, ct.name, ct.color, ct.created_at
     FROM customer_tags ct
     JOIN user_tag_assignments uta ON uta.tag_id = ct.id
     WHERE uta.user_id = $1
     ORDER BY ct.name`,
    [userId]
  );
  return rows;
}

export async function addUserTag(userId: number, tagId: number): Promise<void> {
  await pool.query(
    `INSERT INTO user_tag_assignments (user_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, tagId]
  );
}

export async function removeUserTag(userId: number, tagId: number): Promise<void> {
  await pool.query(
    `DELETE FROM user_tag_assignments WHERE user_id=$1 AND tag_id=$2`,
    [userId, tagId]
  );
}
```

- [ ] **Step 3: Extend `getSessionWithDetails` to fetch tags**

In `getSessionWithDetails`, add a third parallel query for user tags:

Find:
```typescript
  const [sessionRows, messageRows] = await Promise.all([
```

Replace with:
```typescript
  const [sessionRows, messageRows, tagRows] = await Promise.all([
```

And add as third element:
```typescript
    getUserTags(0), // placeholder — replaced below after we know user_id
```

Wait — we don't know `user_id` yet when we start. Instead, after the parallel fetch, fetch tags separately using `row.user_id`:

Actually, let's do it differently. Add a fourth parallel query using a subquery:

Replace the `Promise.all` call with:
```typescript
  const [sessionRows, messageRows] = await Promise.all([
    pool.query(/* existing session query */),
    pool.query<SupportMessage>(/* existing messages query */),
  ]);

  if (!sessionRows.rows[0]) return null;
  const row = sessionRows.rows[0];

  const tagRows = await getUserTags(row.user_id);
```

Then in the `member` object construction, add `tags: tagRows`.

- [ ] **Step 4: Create `erp/src/app/api/livechat/tags/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getAllTags, createTag } from '@/lib/repositories/support_repo';

export async function GET() {
  const tags = await getAllTags();
  return NextResponse.json({ tags });
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const name: string  = (body.name  ?? '').trim();
  const color: string = (body.color ?? '#6b7280').trim();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  try {
    const tag = await createTag({ name, color });
    return NextResponse.json({ tag }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Tag name already exists' }, { status: 409 });
  }
}
```

- [ ] **Step 5: Create `erp/src/app/api/livechat/tags/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { deleteTag } from '@/lib/repositories/support_repo';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!(token ? await verifyJWT(token) : null))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  await deleteTag(parseInt(id, 10));
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Create `erp/src/app/api/members/[id]/tags/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getUserTags, addUserTag, removeUserTag } from '@/lib/repositories/support_repo';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tags = await getUserTags(parseInt(id, 10));
  return NextResponse.json({ tags });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!(token ? await verifyJWT(token) : null))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const tagId: number = body.tag_id;
  if (!tagId) return NextResponse.json({ error: 'tag_id required' }, { status: 400 });
  await addUserTag(parseInt(id, 10), tagId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!(token ? await verifyJWT(token) : null))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  await removeUserTag(parseInt(id, 10), body.tag_id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 7: Create `erp/src/components/livechat/TagPicker.tsx`**

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import type { CustomerTag } from '@/lib/types';

export function TagBadge({ tag, onRemove }: { tag: CustomerTag; onRemove?: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
      style={{ backgroundColor: tag.color }}
    >
      {tag.name}
      {onRemove && (
        <button
          onClick={onRemove}
          className="hover:opacity-75 leading-none"
          aria-label={`Remove ${tag.name}`}
        >
          ×
        </button>
      )}
    </span>
  );
}

export function TagPicker({ userId, initialTags }: { userId: number; initialTags: CustomerTag[] }) {
  const [userTags, setUserTags]   = useState<CustomerTag[]>(initialTags);
  const [allTags, setAllTags]     = useState<CustomerTag[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  const loadAllTags = useCallback(async () => {
    const r = await fetch('/api/livechat/tags');
    const d = await r.json();
    setAllTags(d.tags ?? []);
  }, []);

  useEffect(() => { void loadAllTags(); }, [loadAllTags]);

  const assignedIds = new Set(userTags.map((t) => t.id));
  const available = allTags.filter((t) => !assignedIds.has(t.id));

  async function addTag(tag: CustomerTag) {
    await fetch(`/api/members/${userId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_id: tag.id }),
    });
    setUserTags((prev) => [...prev, tag]);
  }

  async function removeTag(tagId: number) {
    await fetch(`/api/members/${userId}/tags`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_id: tagId }),
    });
    setUserTags((prev) => prev.filter((t) => t.id !== tagId));
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-2">
        {userTags.map((t) => (
          <TagBadge key={t.id} tag={t} onRemove={() => removeTag(t.id)} />
        ))}
        <div className="relative">
          <button
            onClick={() => setShowPicker((v) => !v)}
            className="rounded-full px-2 py-0.5 text-xs border border-dashed border-gray-300 text-gray-400 hover:border-gray-500 hover:text-gray-600"
          >
            + Tag
          </button>
          {showPicker && available.length > 0 && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowPicker(false)} />
              <div className="absolute left-0 top-6 z-20 w-44 rounded-lg border bg-white shadow-lg py-1">
                {available.map((t) => (
                  <button
                    key={t.id}
                    className="w-full text-left px-3 py-1.5 hover:bg-gray-50 flex items-center gap-2"
                    onClick={() => { addTag(t); setShowPicker(false); }}
                  >
                    <span
                      className="h-3 w-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: t.color }}
                    />
                    <span className="text-xs">{t.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Update `MemberCard.tsx` to display tags + TagPicker**

Add import:
```typescript
import { TagPicker } from './TagPicker';
```

Add a Tags section after the "Telegram info" block:
```tsx
      {/* Tags */}
      <div className="border-b p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Tags</p>
        <TagPicker userId={member.id} initialTags={member.tags ?? []} />
      </div>
```

- [ ] **Step 9: Update `SessionCard.tsx` to show up to 3 tags**

First, `SupportSession` needs a `tags` field from the list query. Add it to the interface in `types.ts`:
```typescript
  tags?: CustomerTag[];  // new — populated from sub-query in getSessionsLiveChat
```

Update `getSessionsLiveChat` in `support_repo.ts` — add a sub-query for tags in the main SELECT:
```typescript
  const tagsSub = `(
    SELECT json_agg(json_build_object('id', ct.id, 'name', ct.name, 'color', ct.color))
    FROM user_tag_assignments uta
    JOIN customer_tags ct ON ct.id = uta.tag_id
    WHERE uta.user_id = ss.user_id
  )`;
```

And include it in the SELECT:
```sql
SELECT ss.*,
       u.first_name, u.phone, u.telegram_id, u.telegram_username,
       ${lastMsgSub} AS last_message_content,
       ${lastMsgTypeSub} AS last_message_type,
       ${tagsSub} AS tags
```

In `SessionCard.tsx`, add after the unread count badge:
```tsx
        {session.tags && session.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {session.tags.slice(0, 3).map((t) => (
              <span
                key={t.id}
                className="rounded-full px-1.5 py-0.5 text-xs font-medium text-white"
                style={{ backgroundColor: t.color }}
              >
                {t.name}
              </span>
            ))}
          </div>
        )}
```

- [ ] **Step 10: Lint + verify**

```bash
cd erp && npm run lint
```

Expected: 0 errors.

- [ ] **Step 11: Commit**

```bash
git add erp/src/lib/types.ts \
        erp/src/lib/repositories/support_repo.ts \
        erp/src/app/api/livechat/tags/ \
        erp/src/app/api/members/\[id\]/tags/ \
        erp/src/components/livechat/TagPicker.tsx \
        erp/src/components/livechat/MemberCard.tsx \
        erp/src/components/livechat/SessionCard.tsx
git commit -m "feat(livechat): customer tags — tag catalog, user assignment, display in member card + conversation list"
```

---

### Task 7: Reply Status Indicators

**Files:**
- Modify: `erp/src/components/livechat/ReplyBox.tsx`

**Interfaces:**
- No external interface changes. Status is internal UI state: `'idle' | 'sending' | 'sent' | 'failed'`

- [ ] **Step 1: Add send status state to `ReplyBox.tsx`**

Add state after existing `const [error, setError] = useState('');`:
```typescript
  type SendStatus = 'idle' | 'sending' | 'sent' | 'failed';
  const [sendStatus, setSendStatus] = useState<SendStatus>('idle');
  const lastBodyRef = useRef<{ message_type: string; content: string } | null>(null);
```

- [ ] **Step 2: Update `handleSend` to track status**

Replace the existing `setSending(true);` / `setSending(false);` pattern:

At the start of `handleSend`:
```typescript
    setSending(true);
    setSendStatus('sending');
    setError('');
```

On success (after `onMessageSent`):
```typescript
      setSendStatus('sent');
      setTimeout(() => setSendStatus('idle'), 2500);
```

On error (in the `!r.ok` branch):
```typescript
      setSendStatus('failed');
      lastBodyRef.current = body;  // save for retry
      setError(d.error ?? 'Send failed');
```

In the catch block:
```typescript
    } catch {
      setSendStatus('failed');
      setError('Network error');
    } finally {
```

- [ ] **Step 3: Add Retry button and status indicator to JSX**

Replace the existing error paragraph and send button area. After the existing `{error && <p ...>}` block, add:

```tsx
      {/* Send status */}
      {sendStatus !== 'idle' && (
        <div className="flex items-center gap-2 text-xs mb-1">
          {sendStatus === 'sending' && (
            <span className="text-gray-400">Sending…</span>
          )}
          {sendStatus === 'sent' && (
            <span className="text-green-600">Sent ✓</span>
          )}
          {sendStatus === 'failed' && (
            <div className="flex items-center gap-2">
              <span className="text-red-500">Failed ✕</span>
              <button
                className="text-blue-500 underline"
                onClick={() => {
                  if (lastBodyRef.current) {
                    setSendStatus('idle');
                    void handleSend();
                  }
                }}
              >
                Retry
              </button>
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 4: Lint + verify**

```bash
cd erp && npm run lint
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add erp/src/components/livechat/ReplyBox.tsx
git commit -m "feat(livechat): reply status indicators — Sending / Sent ✓ / Failed + Retry"
```

---

### Task 8: Image Lightbox

**Files:**
- Create: `erp/src/components/livechat/ImageLightbox.tsx`
- Modify: `erp/src/components/livechat/MessageBubble.tsx` — emit `onImageClick` callback
- Modify: `erp/src/components/livechat/ChatWindow.tsx` — lift lightbox state, collect PHOTO messages

**Interfaces:**
- `ImageLightbox` props: `{ images: string[]; currentIndex: number; onClose: () => void; onPrev: () => void; onNext: () => void }`
- `MessageBubble` gains optional prop: `onImageClick?: (fileId: string) => void`
- `ChatWindow` gains no new external props; lightbox state is internal

- [ ] **Step 1: Create `erp/src/components/livechat/ImageLightbox.tsx`**

```tsx
'use client';

import { useEffect } from 'react';

function mediaUrl(fileId: string): string {
  return `/api/livechat/media/${encodeURIComponent(fileId)}`;
}

export function ImageLightbox({
  images,
  currentIndex,
  onClose,
  onPrev,
  onNext,
}: {
  images: string[];
  currentIndex: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape')      onClose();
      if (e.key === 'ArrowLeft')   onPrev();
      if (e.key === 'ArrowRight')  onNext();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, onPrev, onNext]);

  const src = images[currentIndex];
  if (!src) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      {/* Counter */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white text-sm opacity-70">
        {currentIndex + 1} / {images.length}
      </div>

      {/* Close */}
      <button
        className="absolute top-4 right-4 text-white text-2xl opacity-70 hover:opacity-100"
        onClick={onClose}
        aria-label="Close"
      >
        ✕
      </button>

      {/* Prev */}
      {currentIndex > 0 && (
        <button
          className="absolute left-4 text-white text-3xl opacity-70 hover:opacity-100"
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          aria-label="Previous"
        >
          ‹
        </button>
      )}

      {/* Image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={mediaUrl(src)}
        alt="Full size"
        className="max-h-[90vh] max-w-[90vw] object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Next */}
      {currentIndex < images.length - 1 && (
        <button
          className="absolute right-4 text-white text-3xl opacity-70 hover:opacity-100"
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          aria-label="Next"
        >
          ›
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add `onImageClick` prop to `MessageBubble.tsx`**

Update the function signature:
```typescript
export function MessageBubble({
  msg,
  senderName,
  onImageClick,
}: {
  msg: SupportMessage;
  senderName?: string;
  onImageClick?: (fileId: string) => void;
}) {
```

Pass `onImageClick` to `MediaContent`:
```tsx
        <MediaContent msg={msg} onImageClick={onImageClick} />
```

Update `MediaContent` to accept and use it:
```typescript
function MediaContent({
  msg,
  onImageClick,
}: {
  msg: SupportMessage;
  onImageClick?: (fileId: string) => void;
}) {
```

In the PHOTO block, change the `<a>` to a clickable div:
```tsx
  if (message_type === 'PHOTO') {
    if (!content) return <span className="italic text-xs">[Photo]</span>;
    return (
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl(content)}
          alt="photo"
          className="max-h-64 max-w-xs rounded-lg object-contain cursor-pointer hover:opacity-90"
          loading="lazy"
          onClick={() => onImageClick?.(content)}
        />
        {caption && (
          <p className="mt-1 whitespace-pre-wrap break-words text-sm">{caption}</p>
        )}
      </div>
    );
  }
```

- [ ] **Step 3: Lift lightbox state into `ChatWindow.tsx`**

Add imports:
```typescript
import { ImageLightbox } from './ImageLightbox';
```

Add lightbox state after existing `const [loadingMore, setLoadingMore] = useState(false);`:
```typescript
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Collect ordered list of PHOTO file_ids from current messages
  const photoFileIds = messages
    .filter((m) => m.message_type === 'PHOTO' && m.content)
    .map((m) => m.content as string);
```

Add `onImageClick` handler passed to each `MessageBubble`:
```typescript
  const handleImageClick = useCallback((fileId: string) => {
    const idx = photoFileIds.indexOf(fileId);
    if (idx !== -1) setLightboxIndex(idx);
  }, [photoFileIds]);
```

Update the `<MessageBubble>` JSX call:
```tsx
              <MessageBubble
                key={m.id}
                msg={m}
                senderName={memberName}
                onImageClick={handleImageClick}
              />
```

Add lightbox after the scroll container closing tag:
```tsx
      {lightboxIndex !== null && (
        <ImageLightbox
          images={photoFileIds}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={() => setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i))}
          onNext={() => setLightboxIndex((i) => (i !== null && i < photoFileIds.length - 1 ? i + 1 : i))}
        />
      )}
```

- [ ] **Step 4: Lint + verify**

```bash
cd erp && npm run lint
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add erp/src/components/livechat/ImageLightbox.tsx \
        erp/src/components/livechat/MessageBubble.tsx \
        erp/src/components/livechat/ChatWindow.tsx
git commit -m "feat(livechat): image lightbox — fullscreen viewer with keyboard nav and prev/next"
```

---

### Task 9: Enhanced Member Card

**Files:**
- Modify: `erp/src/lib/types.ts` — extend `MemberCardData` with new fields
- Modify: `erp/src/lib/repositories/support_repo.ts` — extend `getSessionWithDetails`
- Modify: `erp/src/components/livechat/MemberCard.tsx` — display new fields

**Interfaces:**
- `MemberCardData` gains:
  ```typescript
  net_deposit: string;
  last_deposit_at: string | null;
  last_deposit_amount: string | null;
  last_withdrawal_at: string | null;
  last_withdrawal_amount: string | null;
  game_accounts: { provider: string; username: string }[];
  previous_sessions: { id: number; status: string; created_at: string }[];
  ```

- [ ] **Step 1: Extend `MemberCardData` in `erp/src/lib/types.ts`**

Replace the existing `MemberCardData` interface:
```typescript
export interface MemberCardData {
  id: number;
  first_name: string;
  telegram_id: string;
  telegram_username: string | null;
  phone: string;
  status: 'ACTIVE' | 'FROZEN';
  created_at: string;
  total_deposit: string;
  total_withdraw: string;
  total_bonus: string;
  net_deposit: string;
  bank_name: string;
  bank_account: string;
  bank_holder_name: string;
  tags: CustomerTag[];
  last_deposit_at: string | null;
  last_deposit_amount: string | null;
  last_withdrawal_at: string | null;
  last_withdrawal_amount: string | null;
  game_accounts: { provider: string; username: string }[];
  previous_sessions: { id: number; status: string; created_at: string }[];
}
```

- [ ] **Step 2: Extend `getSessionWithDetails` in `support_repo.ts`**

Find and replace the `Promise.all` call + result construction block. The existing call fetches `sessionRows` and `messageRows`. Extend it:

```typescript
  const [sessionRows, messageRows, tagRows, extRows] = await Promise.all([
    pool.query(/* existing session query */),
    pool.query<SupportMessage>(/* existing messages query */),
    // tags placeholder — we fetch after, since we need user_id
    Promise.resolve(null as null),
    // extended member data
    Promise.resolve(null as null),
  ]);
```

That's awkward. Better to do it sequentially after getting `row`:

```typescript
  const [sessionRows, messageRows] = await Promise.all([
    pool.query(
      `SELECT ss.*,
              u.first_name, u.phone, u.telegram_id, u.telegram_username,
              u.status AS member_status, u.created_at AS member_created_at,
              u.total_deposit, u.total_withdraw, u.total_bonus,
              u.net_deposit,
              u.bank_name, u.bank_account, u.bank_holder_name
       FROM support_sessions ss
       JOIN users u ON u.id = ss.user_id
       WHERE ss.id = $1`,
      [id]
    ),
    pool.query<SupportMessage>(
      `SELECT id, session_id, sender_type, message_type, content, caption,
              user_msg_id, group_msg_id, created_at
       FROM support_messages
       WHERE session_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [id]
    ),
  ]);

  if (!sessionRows.rows[0]) return null;
  const row = sessionRows.rows[0];

  // Parallel fetch of extended member data
  const [tagRows, lastDepRow, lastWithdrawRow, gameAccRows, prevSessionRows] = await Promise.all([
    getUserTags(row.user_id),
    pool.query(
      `SELECT MAX(created_at) AS last_at, MAX(deposit_amount::numeric)::text AS last_amount
       FROM deposit_requests
       WHERE user_id = $1 AND status = 'APPROVED'`,
      [row.user_id]
    ),
    pool.query(
      `SELECT MAX(created_at) AS last_at, MAX(withdraw_amount::numeric)::text AS last_amount
       FROM withdrawal_requests
       WHERE user_id = $1 AND status = 'PAID'`,
      [row.user_id]
    ),
    pool.query(
      `SELECT uga.provider, ap.username
       FROM user_game_accounts uga
       JOIN account_pool ap ON ap.id = uga.account_pool_id
       WHERE uga.user_id = $1
       ORDER BY uga.provider`,
      [row.user_id]
    ),
    pool.query(
      `SELECT id, status, created_at
       FROM support_sessions
       WHERE user_id = $1 AND id != $2
       ORDER BY created_at DESC LIMIT 5`,
      [row.user_id, id]
    ),
  ]);
```

Then update the `member` construction:
```typescript
  const member: MemberCardData = {
    id: row.user_id,
    first_name: row.first_name,
    telegram_id: row.telegram_id,
    telegram_username: row.telegram_username,
    phone: row.phone,
    status: row.member_status,
    created_at: row.member_created_at,
    total_deposit: row.total_deposit ?? '0',
    total_withdraw: row.total_withdraw ?? '0',
    total_bonus: row.total_bonus ?? '0',
    net_deposit: row.net_deposit ?? '0',
    bank_name: row.bank_name ?? '',
    bank_account: row.bank_account ?? '',
    bank_holder_name: row.bank_holder_name ?? '',
    tags: tagRows,
    last_deposit_at: lastDepRow.rows[0]?.last_at ?? null,
    last_deposit_amount: lastDepRow.rows[0]?.last_amount ?? null,
    last_withdrawal_at: lastWithdrawRow.rows[0]?.last_at ?? null,
    last_withdrawal_amount: lastWithdrawRow.rows[0]?.last_amount ?? null,
    game_accounts: gameAccRows.rows,
    previous_sessions: prevSessionRows.rows,
  };
```

- [ ] **Step 3: Update `MemberCard.tsx` to display new fields**

Extend the Financials section:
```tsx
      {/* Financials */}
      <div className="border-b p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Financials</p>
        <Row label="Total Deposit"    value={fmt(member.total_deposit)} />
        <Row label="Total Withdrawal" value={fmt(member.total_withdraw)} />
        <Row label="Total Bonus"      value={fmt(member.total_bonus)} />
        <Row label="Net Deposit"      value={fmt(member.net_deposit)} />
        {member.last_deposit_amount && (
          <Row
            label="Last Deposit"
            value={`${fmt(member.last_deposit_amount)} · ${
              member.last_deposit_at
                ? new Date(member.last_deposit_at).toLocaleDateString()
                : ''
            }`}
          />
        )}
        {member.last_withdrawal_amount && (
          <Row
            label="Last Withdrawal"
            value={`${fmt(member.last_withdrawal_amount)} · ${
              member.last_withdrawal_at
                ? new Date(member.last_withdrawal_at).toLocaleDateString()
                : ''
            }`}
          />
        )}
      </div>
```

Add Game Accounts section after Bank section:
```tsx
      {/* Game Accounts */}
      {member.game_accounts.length > 0 && (
        <div className="border-b p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Game Accounts</p>
          {member.game_accounts.map((ga) => (
            <Row key={ga.provider} label={ga.provider} value={ga.username} />
          ))}
        </div>
      )}
```

Add Previous Sessions section before Actions:
```tsx
      {/* Previous Sessions */}
      {member.previous_sessions.length > 0 && (
        <div className="border-b p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Previous Sessions</p>
          {member.previous_sessions.map((s) => (
            <a
              key={s.id}
              href={`/livechat?session=${s.id}`}
              className="flex items-center justify-between py-1 text-xs hover:underline"
            >
              <span className="text-blue-500">Session #{s.id}</span>
              <span className="text-gray-400">
                {s.status} · {new Date(s.created_at).toLocaleDateString()}
              </span>
            </a>
          ))}
        </div>
      )}
```

- [ ] **Step 4: Lint + verify**

```bash
cd erp && npm run lint
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add erp/src/lib/types.ts \
        erp/src/lib/repositories/support_repo.ts \
        erp/src/components/livechat/MemberCard.tsx
git commit -m "feat(livechat): enhanced member card — net deposit, last transactions, game accounts, previous sessions"
```

---

### Task 10: Conversation Actions Enhancement

**Files:**
- Modify: `erp/src/components/livechat/SessionActions.tsx` — Transfer + Copy Telegram ID

**Interfaces:**
- No new API routes. Transfer uses existing `PATCH { action: 'assign', username: string }`.
- `SessionActions` already receives `session` which has `telegram_id?: string`.

- [ ] **Step 1: Update `SessionActions.tsx`**

Add `transferUsername` state and `copied` state after existing `const [acting, setActing] = useState(false);`:

```typescript
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferUsername, setTransferUsername] = useState('');
  const [copied, setCopied] = useState(false);
```

Add `handleTransfer` function:
```typescript
  async function handleTransfer() {
    if (!transferUsername.trim()) return;
    if (acting) return;
    setActing(true);
    const r = await fetch(`/api/livechat/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'assign', username: transferUsername.trim() }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && (d as { session?: SupportSession }).session) {
      onUpdate((d as { session: SupportSession }).session);
      setShowTransfer(false);
      setTransferUsername('');
    } else {
      alert((d as { error?: string }).error ?? 'Transfer failed');
    }
    setActing(false);
  }
```

Add `handleCopyId` function:
```typescript
  function handleCopyId() {
    if (!session.telegram_id) return;
    navigator.clipboard.writeText(session.telegram_id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }
```

In the JSX, add "Copy Telegram ID" and "Transfer" buttons to the `ml-auto flex gap-1` div, before "Assign to me":

```tsx
        <Button
          size="sm"
          variant="outline"
          disabled={!session.telegram_id}
          onClick={handleCopyId}
          title="Copy Telegram ID"
        >
          {copied ? '✓ Copied' : '📋 Telegram ID'}
        </Button>

        {/* Transfer */}
        <div className="relative">
          <Button
            size="sm"
            variant="outline"
            disabled={acting}
            onClick={() => setShowTransfer((v) => !v)}
          >
            Transfer
          </Button>
          {showTransfer && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowTransfer(false)} />
              <div className="absolute right-0 top-8 z-20 w-52 rounded-lg border bg-white shadow-lg p-3 space-y-2">
                <p className="text-xs font-medium text-gray-600">Transfer to agent:</p>
                <input
                  className="w-full rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="agent_username"
                  value={transferUsername}
                  onChange={(e) => setTransferUsername(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleTransfer(); }}
                  autoFocus
                />
                <Button size="sm" className="w-full" onClick={handleTransfer} disabled={acting || !transferUsername.trim()}>
                  Confirm Transfer
                </Button>
              </div>
            </>
          )}
        </div>
```

Also add the `Input` import (already uses a plain `<input>` above — no import needed).

- [ ] **Step 2: Lint + verify**

```bash
cd erp && npm run lint
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add erp/src/components/livechat/SessionActions.tsx
git commit -m "feat(livechat): conversation actions — Transfer agent + Copy Telegram ID"
```

---

### Task 11: Chat Audit Logging

**Files:**
- Modify: `erp/src/app/api/livechat/sessions/[id]/route.ts` — log PATCH actions
- Modify: `erp/src/app/api/livechat/sessions/[id]/messages/route.ts` — log sent messages

**Interfaces:**
- Uses existing `logAudit()` from `@/lib/repositories/audit_repo`
- `target_type` values used: `'support_session'` (for session actions), `'support_message'` (for sent messages)

- [ ] **Step 1: Add audit logging to `sessions/[id]/route.ts`**

Add import at top:
```typescript
import { logAudit } from '@/lib/repositories/audit_repo';
```

In the PATCH handler, after `const session = await updateSessionAction(...)` and the `if (!session)` guard, add logging before the `notify_close` block:

```typescript
  // Audit log for session actions
  const auditAction: Record<string, string> = {
    close:        'livechat_session_closed',
    reopen:       'livechat_session_reopened',
    assign:       'livechat_session_assigned',
    pin:          'livechat_session_pinned',
    unpin:        'livechat_session_unpinned',
    mark_unread:  'livechat_session_marked_unread',
    reset_unread: 'livechat_session_unread_reset',
  };
  if (auditAction[action]) {
    logAudit({
      admin_id:    payload.sub,
      action:      auditAction[action],
      target_type: 'support_session',
      target_id:   parseInt(id, 10),
      new_value:   action === 'assign' ? { assigned_to: username } : null,
    }).catch(() => {}); // fire-and-forget; don't fail the request on audit error
  }
```

Note: the `PATCH reset_unread` is called on every session open — logging that would be too noisy. Update the map to exclude `reset_unread`:
```typescript
  const auditAction: Record<string, string> = {
    close:       'livechat_session_closed',
    reopen:      'livechat_session_reopened',
    assign:      'livechat_session_assigned',
    pin:         'livechat_session_pinned',
    unpin:       'livechat_session_unpinned',
    mark_unread: 'livechat_session_marked_unread',
  };
```

- [ ] **Step 2: Add audit logging to `sessions/[id]/messages/route.ts`**

Add import at top:
```typescript
import { logAudit } from '@/lib/repositories/audit_repo';
```

In the POST handler, after the `return NextResponse.json({ ok: true, message: ... })` line — add the fire-and-forget audit call BEFORE the return:

```typescript
  logAudit({
    admin_id:    payload.sub,
    action:      'livechat_message_sent',
    target_type: 'support_session',
    target_id:   parseInt(id, 10),
    new_value:   { message_type, content_length: content.length },
  }).catch(() => {});

  return NextResponse.json({ ... });
```

- [ ] **Step 3: Lint + verify**

```bash
cd erp && npm run lint
```

Expected: 0 errors.

- [ ] **Step 4: Verify audit logs appear in existing `/audit` ERP page**

The existing Audit Log page at `erp/src/app/(dashboard)/audit/page.tsx` lists from `audit_logs`. After performing a test close/assign action via the UI, the audit entries should appear there with `target_type = 'support_session'`.

- [ ] **Step 5: Commit**

```bash
git add erp/src/app/api/livechat/sessions/\[id\]/route.ts \
        erp/src/app/api/livechat/sessions/\[id\]/messages/route.ts
git commit -m "feat(livechat): chat audit logging — session actions and sent messages logged to audit_logs"
```

---

## Self-Review

### 1. Spec coverage check

| Spec Feature | Task | Status |
|---|---|---|
| #1 Desktop Notifications (sound + browser) | Task 3 | ✅ |
| #2 Unread Counter | Already in Phase 3 (SessionCard) | ✅ Pre-existing |
| #3 Quick Replies | Task 4 | ✅ |
| #4 Internal Notes | Task 5 | ✅ |
| #5 Conversation Search (name/phone/session ID) | Task 2 | ✅ (message text search deferred*) |
| #6 Filters (All/Waiting/Active/Closed/Assigned to me/Unassigned/Today/Last 7 days/Has unread) | Task 2 | ✅ |
| #7 Customer Tags | Task 6 | ✅ |
| #8 Reply Status (Sending/Sent/Failed/Retry) | Task 7 | ✅ ("Delivered" not implementable via Telegram Bot API) |
| #9 Typing Indicator | — | ⚠️ Deferred (requires bot-side relay changes) |
| #10 Chat History (previous sessions) | Task 9 | ✅ |
| #11 Member Summary Panel (financials, bank, game account, previous sessions) | Task 9 | ✅ |
| #12 Conversation Actions (Transfer, Copy Telegram ID, Freeze already present) | Task 10 | ✅ (Ban = Freeze, already exists) |
| #13 Media Viewer (image fullscreen/prev-next) | Task 8 | ✅ (voice waveform deferred*) |
| #14 Audit Log | Task 11 | ✅ |
| #15 Performance (10 admins, 5k sessions, 100k msgs) | — | ⚠️ Deferred (current architecture handles it; profile first) |

*Message text search requires a separate search endpoint + UI mode; planned as a follow-up.
*Voice waveform requires a canvas library; current `<audio controls>` is sufficient.

### 2. Placeholder scan
No TBDs, TODOs, or incomplete code blocks found.

### 3. Type consistency
- `CustomerTag` defined in Task 6 Step 1; used in `MemberCardData.tags` (Task 9), `SupportSession.tags` (Task 6 Step 9), `TagBadge`/`TagPicker` (Task 6 Step 7) — all consistent.
- `SessionNote` defined in Task 5 Step 1; used in `support_repo.ts` and `NotesPanel.tsx` — consistent.
- `QuickReply` defined in Task 4 Step 1; used in repo, routes, and `ReplyBox.tsx` — consistent.
- `MemberCardData` extended in Task 6 Step 1 (adds `tags`) and Task 9 Step 1 (adds extended fields). Task 9 replaces the entire interface so it includes the Task 6 `tags` field — consistent.
- `logAudit` called with `admin_id: payload.sub` — `JWTPayload.sub` is `number` — matches `logAudit` param type `admin_id: number` — consistent.
