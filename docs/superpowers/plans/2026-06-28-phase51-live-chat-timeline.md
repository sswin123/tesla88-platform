# Phase 5.1 — Live Chat Conversation Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-session message view with a WhatsApp/Telegram-style continuous timeline that shows ALL of a customer's messages across all sessions in a single scrollable view with date separators and session boundary markers.

**Architecture:** New `getTimelineMessages(userId)` cross-session query in `support_repo.ts`; updated `getSessionWithDetails` returns messages across all sessions; new pagination endpoint `/api/livechat/users/[userId]/messages`; trigger updated to include `user_id` in SSE payload; `ChatWindow` rebuilt to render a flat timeline with session markers and date labels; `LiveChatClient` passes new props through; MemberCard session-history clicks scroll to session instead of navigating.

**Tech Stack:** Next.js 15 App Router; PostgreSQL (pg pool); React 18 with `useRef`/`useEffect`/`useCallback`; TypeScript strict; Tailwind CSS

## Global Constraints

- `npx tsc --noEmit` must pass after every task — no TypeScript errors
- No changes to: deposit/withdrawal flows, session routing, relay, audit logs, Notes/Tags/Assignment, notifications
- `getSessionWithDetails` return type must remain backward-compatible: callers that use `session`, `member` still work
- SSE channel name `livechat_updates` stays the same; only payload shape extended (additive)
- Python bot tests (`pytest tests/ -q`) must still pass after any DB migration
- No new npm packages
- No changes to URL structure — URL stays `?session=X`; active session for sending is always `selectedId`
- MemberCard's `onSessionSelect` prop changes behavior (scroll-to instead of navigate) — no signature change, only the handler passed from `LiveChatClient` changes
- The 50-message initial load in `getSessionWithDetails` increases to 100; pagination keeps `hasMore = returned.length >= 100`

---

## File Map

### New files
| File | Purpose |
|------|---------|
| `erp/migrations/023_timeline_notify.sql` | Update pg_notify trigger to include user_id in SSE payload |
| `erp/src/app/api/livechat/users/[userId]/messages/route.ts` | Timeline pagination — GET older messages across all sessions for a user |

### Modified files
| File | Change |
|------|--------|
| `erp/src/lib/types.ts` | Add `SessionSummary` interface; extend `LiveChatSSEEvent` with `user_id?`; change `MemberCardData.previous_sessions` type |
| `erp/src/lib/repositories/support_repo.ts` | Add `getTimelineMessages()`; update `getSessionWithDetails` to return cross-session messages + full sessions list |
| `erp/src/app/api/livechat/sessions/[id]/route.ts` | Pass `hasMore` from updated `getSessionWithDetails` |
| `erp/src/components/livechat/ChatWindow.tsx` | Complete rewrite: timeline items, Today/Yesterday date labels, session markers, cross-session SSE filter, user-scoped pagination, `scrollToSessionId` |
| `erp/src/app/(dashboard)/livechat/LiveChatClient.tsx` | Add `scrollToSessionId` state; pass `userId`, `sessions` (from member.previous_sessions), `scrollToSessionId` to ChatWindow; change MemberCard `onSessionSelect` handler |
| `erp/src/components/livechat/MemberCard.tsx` | Minor: update `SessionSummary` type usage; change session history buttons from `disabled={isCurrent}` to always-clickable |

---

## Task A: DB migration + type extensions

**Files:**
- Create: `erp/migrations/023_timeline_notify.sql`
- Modify: `erp/src/lib/types.ts`

**Interfaces:**
- Produces:
  - `LiveChatSSEEvent.user_id?: number` — new optional field in SSE payload
  - `SessionSummary { id, status, created_at, closed_at, assigned_to_username }` — new interface
  - `MemberCardData.previous_sessions: SessionSummary[]` — replaces `{ id; status; created_at }[]`

- [ ] **Step 1: Create migration file**

`erp/migrations/023_timeline_notify.sql`:
```sql
-- 023_timeline_notify.sql
-- Add user_id to the livechat SSE notification so the ERP timeline can filter
-- new messages by user rather than by session.

CREATE OR REPLACE FUNCTION notify_livechat_message() RETURNS trigger AS $$
DECLARE
  v_user_id INT;
BEGIN
  SELECT user_id INTO v_user_id FROM support_sessions WHERE id = NEW.session_id;
  PERFORM pg_notify('livechat_updates', json_build_object(
    'type',        'new_message',
    'session_id',  NEW.session_id,
    'user_id',     v_user_id,
    'message_id',  NEW.id,
    'sender_type', NEW.sender_type
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

No trigger DDL needed — the existing `livechat_msg_notify` trigger already references this function.

- [ ] **Step 2: Apply migration**

```bash
psql $DATABASE_URL -f erp/migrations/023_timeline_notify.sql
```
Expected: `CREATE FUNCTION`

- [ ] **Step 3: Add SessionSummary and extend LiveChatSSEEvent in types.ts**

In `erp/src/lib/types.ts`, find the `LiveChatSSEEvent` interface (currently line ~216) and the `MemberCardData` interface (currently line ~224).

Add `SessionSummary` BEFORE `LiveChatSSEEvent`:
```typescript
export interface SessionSummary {
  id: number;
  status: SessionStatus;
  created_at: string;
  closed_at: string | null;
  assigned_to_username: string | null;
}
```

Extend `LiveChatSSEEvent` with `user_id?`:
```typescript
export interface LiveChatSSEEvent {
  type: 'new_message' | 'session_update';
  session_id: number;
  user_id?: number;          // NEW — present on new_message events after migration 023
  message_id?: number;
  sender_type?: MessageSenderType;
  status?: SessionStatus;
}
```

Change `MemberCardData.previous_sessions` from:
```typescript
previous_sessions: { id: number; status: string; created_at: string }[];
```
to:
```typescript
previous_sessions: SessionSummary[];
```

- [ ] **Step 4: TypeScript check**

```bash
cd erp && npx tsc --noEmit 2>&1
```
Expected: errors only in files that USE `previous_sessions` (they need updating in later tasks). No new errors in types.ts itself.

- [ ] **Step 5: Commit**

```bash
git add erp/migrations/023_timeline_notify.sql erp/src/lib/types.ts
git commit -m "feat: add SessionSummary type; extend SSE event with user_id; migration 023"
```

---

## Task B: Repository + API routes

**Files:**
- Modify: `erp/src/lib/repositories/support_repo.ts`
- Modify: `erp/src/app/api/livechat/sessions/[id]/route.ts`
- Create: `erp/src/app/api/livechat/users/[userId]/messages/route.ts`

**Interfaces:**
- Consumes: `SessionSummary` from Task A
- Produces:
  - `getTimelineMessages(userId: number, beforeId?: number, limit?: number): Promise<SupportMessage[]>` — cross-session message query, results in ASC order
  - Updated `getSessionWithDetails` returns `{ session, messages, member, hasMore }` where `messages` is cross-session (100 newest) and `member.previous_sessions` is `SessionSummary[]`
  - `GET /api/livechat/sessions/[id]` response now includes `hasMore: boolean`
  - `GET /api/livechat/users/[userId]/messages` — pagination endpoint

- [ ] **Step 1: Add getTimelineMessages to support_repo.ts**

Insert this function after the existing `getMoreMessages` function:

```typescript
export async function getTimelineMessages(
  userId: number,
  beforeId: number = 2147483647,
  limit: number = 100
): Promise<SupportMessage[]> {
  const { rows } = await pool.query<SupportMessage>(
    `SELECT id, session_id, sender_type, message_type, content, caption,
            file_name, file_size, user_msg_id, group_msg_id, created_at
     FROM support_messages
     WHERE session_id IN (SELECT id FROM support_sessions WHERE user_id = $1)
       AND id < $2
     ORDER BY created_at DESC, id DESC
     LIMIT $3`,
    [userId, beforeId, limit]
  );
  return rows.reverse();  // Return oldest-first for display
}
```

- [ ] **Step 2: Update getSessionWithDetails in support_repo.ts**

Find the function `getSessionWithDetails`. Change:
1. The messages query from session-scoped to user-scoped (using `getTimelineMessages`)
2. The `prevSessionRows` query to return `SessionSummary` fields including `closed_at` and `assigned_to_username`
3. The return type to include `hasMore: boolean`

Complete updated function signature and changes:

```typescript
export async function getSessionWithDetails(id: number): Promise<{
  session: SupportSession;
  messages: SupportMessage[];
  member: MemberCardData;
  hasMore: boolean;
} | null> {
```

Inside the function:
- Keep the session JOIN query as-is to get the session row
- After getting `userId` from `row.user_id`:
  - Replace the `messageRows` parallel query with a call to `getTimelineMessages(userId, 2147483647, 100)`
  - Replace the `prevSessionRows` query with:
    ```typescript
    pool.query(
      `SELECT id, status, created_at, closed_at, assigned_to_username
       FROM support_sessions
       WHERE user_id = $1
       ORDER BY created_at ASC`,
      [userId]
    ),
    ```

Change the destructuring of parallel queries accordingly (remove `messageRows`, add `allSessionRows`).

Change member's `previous_sessions` from:
```typescript
previous_sessions: prevSessionRows.rows,
```
to:
```typescript
previous_sessions: allSessionRows.rows as SessionSummary[],
```

Add at the end of the function, before return:
```typescript
const messages = await getTimelineMessages(userId);
const hasMore = messages.length >= 100;
return { session, messages, member, hasMore };
```

Wait — this approach calls `getTimelineMessages` AFTER the parallel Promise.all. Better to include it in the parallel block. Here's the rewrite of the parallel section:

```typescript
const userId = row.user_id as number;

const [gameRows, lastDepRow, lastWithdrawRow, promoRow, allSessionRows, tagsResult, messageRows] = await Promise.all([
  pool.query(
    `SELECT ap.provider, ap.username
     FROM user_game_accounts uga
     JOIN account_pool ap ON ap.id = uga.account_pool_id
     WHERE uga.user_id = $1
     ORDER BY ap.provider`,
    [userId]
  ),
  pool.query(
    `SELECT created_at::text AS last_at, deposit_amount::text AS last_amount
     FROM deposit_requests
     WHERE user_id = $1 AND status = 'APPROVED'
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  ),
  pool.query(
    `SELECT created_at::text AS last_at, withdraw_amount::text AS last_amount
     FROM withdrawal_requests
     WHERE user_id = $1 AND status = 'PAID'
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  ),
  pool.query(
    `SELECT p.name, bc.bonus_amount::text, bc.status
     FROM bonus_claims bc
     JOIN promotions p ON p.id = bc.promotion_id
     WHERE bc.user_id = $1 AND bc.status = 'ACTIVE'
     ORDER BY bc.claimed_at DESC LIMIT 1`,
    [userId]
  ),
  pool.query(
    `SELECT id, status, created_at, closed_at, assigned_to_username
     FROM support_sessions
     WHERE user_id = $1
     ORDER BY created_at ASC`,
    [userId]
  ),
  getTagsForUser(userId),
  pool.query<SupportMessage>(
    `SELECT id, session_id, sender_type, message_type, content, caption,
            file_name, file_size, user_msg_id, group_msg_id, created_at
     FROM support_messages
     WHERE session_id IN (SELECT id FROM support_sessions WHERE user_id = $1)
     ORDER BY created_at DESC, id DESC
     LIMIT 100`,
    [userId]
  ),
]);
```

Then after building `session` and `member` objects:
```typescript
// sessions for member card history (already in ASC order from query)
member.previous_sessions = allSessionRows.rows as SessionSummary[];

// messages returned oldest-first
const messages = (messageRows.rows as SupportMessage[]).reverse();
const hasMore = messages.length >= 100;

return { session, messages, member, hasMore };
```

Note: Remove the old `prevSessionRows` from the parallel array and all references to it.

- [ ] **Step 3: Update GET /api/livechat/sessions/[id]/route.ts**

Find the GET handler. Currently it calls `getSessionWithDetails(id)` and returns `{ session, messages, member, hasMore }`. 

The `hasMore` is currently computed inside the route. Update to use the `hasMore` returned by the repo:

```typescript
const data = await getSessionWithDetails(sessionId);
if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

return NextResponse.json({
  session:  data.session,
  messages: data.messages,
  member:   data.member,
  hasMore:  data.hasMore,
});
```

If the route currently computes `hasMore` itself (e.g., `messages.length >= 50`), remove that computation and use `data.hasMore`.

- [ ] **Step 4: Create GET /api/livechat/users/[userId]/messages/route.ts**

Create directory: `erp/src/app/api/livechat/users/[userId]/messages/`

File `route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getTimelineMessages } from '@/lib/repositories/support_repo';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const beforeId = parseInt(req.nextUrl.searchParams.get('before_id') ?? '2147483647', 10);
  const messages = await getTimelineMessages(parseInt(userId, 10), beforeId);
  return NextResponse.json({
    messages,
    hasMore: messages.length >= 100,
  });
}
```

- [ ] **Step 5: TypeScript check**

```bash
cd erp && npx tsc --noEmit 2>&1
```
Expected: errors in ChatWindow.tsx and LiveChatClient.tsx (they reference old props). No new errors in the files just modified.

- [ ] **Step 6: Commit**

```bash
git add erp/src/lib/repositories/support_repo.ts \
        erp/src/app/api/livechat/sessions/\[id\]/route.ts \
        erp/src/app/api/livechat/users/
git commit -m "feat: cross-session timeline queries + pagination endpoint for user messages"
```

---

## Task C: ChatWindow — timeline rendering

**Files:**
- Rewrite: `erp/src/components/livechat/ChatWindow.tsx`

**Interfaces:**
- Consumes: `SessionSummary` from Task A; `getTimelineMessages` API at `/api/livechat/users/[userId]/messages`
- Produces:
  - Updated `ChatWindowProps`: adds `userId: number`, `sessions: SessionSummary[]`, `scrollToSessionId?: number | null`, `onScrollConsumed?: () => void`
  - Timeline renders: date separators (Today/Yesterday/DD Mon YYYY), session start markers, session close markers, messages
  - SSE filters on `user_id === userId` instead of `session_id === sessionId`
  - Infinite scroll fetches from `/api/livechat/users/[userId]/messages?before_id=X`
  - Session markers have `data-session-id` attributes for `scrollToSessionId` to target

- [ ] **Step 1: Write the new ChatWindow.tsx**

Complete file content:

```typescript
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { MessageBubble } from './MessageBubble';
import { ImageLightbox } from './ImageLightbox';
import type { SupportMessage, SessionSummary } from '@/lib/types';

function mediaUrl(fileId: string): string {
  return `/api/livechat/media/${encodeURIComponent(fileId)}`;
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (msgDay.getTime() === today.getTime()) return 'Today';
  if (msgDay.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function DateDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-gray-100" />
      <span className="text-xs text-gray-400 font-medium">{label}</span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  );
}

function SessionMarker({
  session,
  kind,
}: {
  session: SessionSummary;
  kind: 'start' | 'end';
}) {
  let label: string;
  if (kind === 'start') {
    label = 'New Session';
  } else if (session.assigned_to_username) {
    label = `Session Closed · Handled by: ${session.assigned_to_username}`;
  } else {
    label = 'Session Closed';
  }
  return (
    <div
      data-session-id={session.id}
      className="flex items-center gap-2 my-5 transition-colors duration-700"
    >
      <div className="flex-1 h-px bg-gray-200" />
      <div className="text-center">
        <p className="text-xs text-gray-400 font-medium">{label}</p>
        <p className="text-[10px] text-gray-300">#{session.id}</p>
      </div>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}

type TimelineItem =
  | { kind: 'message'; msg: SupportMessage; key: string; timestamp: number }
  | { kind: 'date'; label: string; key: string; timestamp: number }
  | { kind: 'session_start'; session: SessionSummary; key: string; timestamp: number }
  | { kind: 'session_end'; session: SessionSummary; key: string; timestamp: number };

function buildTimeline(
  messages: SupportMessage[],
  sessions: SessionSummary[],
): TimelineItem[] {
  // Only show session markers for sessions that have at least one message in view
  const sessionIdsWithMessages = new Set(messages.map((m) => m.session_id));
  const visibleSessions = sessions.filter((s) => sessionIdsWithMessages.has(s.id));

  // Collect all timed events
  const events: TimelineItem[] = [];

  for (const msg of messages) {
    events.push({ kind: 'message', msg, key: `m-${msg.id}`, timestamp: new Date(msg.created_at).getTime() });
  }
  for (const s of visibleSessions) {
    events.push({ kind: 'session_start', session: s, key: `ss-${s.id}`, timestamp: new Date(s.created_at).getTime() });
    if (s.closed_at) {
      events.push({ kind: 'session_end', session: s, key: `se-${s.id}`, timestamp: new Date(s.closed_at).getTime() });
    }
  }

  // Sort by timestamp ascending
  events.sort((a, b) => a.timestamp - b.timestamp);

  // Insert date separators before first item of each calendar day
  const result: TimelineItem[] = [];
  let lastDate = '';
  for (const evt of events) {
    const d = new Date(evt.timestamp);
    const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (dateKey !== lastDate) {
      result.push({
        kind: 'date',
        label: formatDateLabel(new Date(evt.timestamp).toISOString()),
        key: `date-${dateKey}`,
        timestamp: evt.timestamp,
      });
      lastDate = dateKey;
    }
    result.push(evt);
  }

  return result;
}

export interface ChatWindowProps {
  userId: number;
  sessionId: number;
  sessions: SessionSummary[];
  messages: SupportMessage[];
  setMessages: React.Dispatch<React.SetStateAction<SupportMessage[]>>;
  hasMore: boolean;
  setHasMore: React.Dispatch<React.SetStateAction<boolean>>;
  memberName: string;
  scrollToSessionId?: number | null;
  onScrollConsumed?: () => void;
}

export function ChatWindow({
  userId,
  sessionId,
  sessions,
  messages,
  setMessages,
  hasMore,
  setHasMore,
  memberName,
  scrollToSessionId,
  onScrollConsumed,
}: ChatWindowProps) {
  const [loadingMore, setLoadingMore] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isFirstLoad = useRef(true);
  const lastIdRef = useRef(0);

  useEffect(() => {
    lastIdRef.current = messages[messages.length - 1]?.id ?? 0;
  }, [messages]);

  useEffect(() => {
    isFirstLoad.current = true;
    setLoadingMore(false);
  }, [userId]);

  useEffect(() => {
    if (messages.length > 0 && isFirstLoad.current) {
      isFirstLoad.current = false;
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    }
  }, [messages.length]);

  // Scroll-to-session: triggered from session history clicks
  useEffect(() => {
    if (scrollToSessionId == null) return;
    const el = document.querySelector<HTMLElement>(`[data-session-id="${scrollToSessionId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Brief highlight flash
      el.style.backgroundColor = 'rgba(59,130,246,0.1)';
      const t = setTimeout(() => { el.style.backgroundColor = ''; }, 1500);
      onScrollConsumed?.();
      return () => clearTimeout(t);
    }
    onScrollConsumed?.();
  }, [scrollToSessionId, onScrollConsumed]);

  // SSE: new messages for this user (any session)
  useEffect(() => {
    const es = new EventSource('/api/livechat/stream');
    es.onmessage = (e: MessageEvent) => {
      try {
        const evt = JSON.parse(e.data as string) as {
          type: string;
          session_id: number;
          user_id?: number;
          sender_type?: string;
        };
        if (
          evt.type === 'new_message' &&
          evt.sender_type === 'USER' &&
          // Accept if user_id matches (new trigger) OR session_id matches (fallback)
          (evt.user_id === userId || evt.session_id === sessionId)
        ) {
          const lastId = lastIdRef.current;
          fetch(`/api/livechat/users/${userId}/messages?before_id=2147483647`)
            .then((r) => r.json())
            .then((d) => {
              const allMsgs: SupportMessage[] = d.messages ?? [];
              const newMsgs = lastId === 0
                ? allMsgs
                : allMsgs.filter((m: SupportMessage) => m.id > lastId);
              if (newMsgs.length > 0) {
                setMessages((prev) => {
                  const ids = new Set(prev.map((m) => m.id));
                  return [...prev, ...newMsgs.filter((m: SupportMessage) => !ids.has(m.id))];
                });
                setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
              }
            })
            .catch(() => {});
        }
      } catch {
        // ignore parse errors
      }
    };
    return () => es.close();
  }, [userId, sessionId, setMessages]);

  // Infinite scroll: load older messages by user
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || loadingMore || !hasMore) return;
    if (el.scrollTop < 80) {
      const firstId = messages[0]?.id;
      if (!firstId) return;
      const prevScrollHeight = el.scrollHeight;
      setLoadingMore(true);
      fetch(`/api/livechat/users/${userId}/messages?before_id=${firstId}`)
        .then((r) => r.json())
        .then((d) => {
          const older: SupportMessage[] = d.messages ?? [];
          setMessages((prev) => {
            const ids = new Set(prev.map((m) => m.id));
            return [...older.filter((m) => !ids.has(m.id)), ...prev];
          });
          setHasMore(d.hasMore ?? false);
          setLoadingMore(false);
          requestAnimationFrame(() => {
            if (el) el.scrollTop = el.scrollHeight - prevScrollHeight;
          });
        })
        .catch(() => setLoadingMore(false));
    }
  }, [userId, messages, loadingMore, hasMore, setMessages, setHasMore]);

  const photoMessages = messages.filter((m) => m.message_type === 'PHOTO' && m.content);
  const photoIndexMap = new Map<string, number>(photoMessages.map((m, i) => [m.content!, i]));
  const lightboxPhotos = photoMessages.map((m) => ({
    src: mediaUrl(m.content!),
    caption: m.caption ?? undefined,
  }));

  const timeline = buildTimeline(messages, sessions);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto bg-gray-50 px-4 py-3"
    >
      {loadingMore && (
        <div className="text-center text-xs text-gray-400 py-2">Loading older messages…</div>
      )}
      {!hasMore && messages.length > 0 && (
        <div className="text-center text-xs text-gray-400 py-2">Beginning of conversation</div>
      )}

      <div className="space-y-1">
        {timeline.map((item) => {
          if (item.kind === 'date') {
            return <DateDivider key={item.key} label={item.label} />;
          }
          if (item.kind === 'session_start') {
            return <SessionMarker key={item.key} session={item.session} kind="start" />;
          }
          if (item.kind === 'session_end') {
            return <SessionMarker key={item.key} session={item.session} kind="end" />;
          }
          return (
            <MessageBubble
              key={item.key}
              msg={item.msg}
              senderName={memberName}
              onPhotoClick={
                item.msg.message_type === 'PHOTO' && item.msg.content
                  ? () => setLightboxIndex(photoIndexMap.get(item.msg.content!) ?? null)
                  : undefined
              }
            />
          );
        })}
      </div>

      <div ref={bottomRef} />
      {lightboxIndex !== null && (
        <ImageLightbox
          photos={lightboxPhotos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd erp && npx tsc --noEmit 2>&1
```
Expected: errors only in LiveChatClient.tsx (missing new required props). No errors in ChatWindow.tsx itself.

- [ ] **Step 3: Commit**

```bash
git add erp/src/components/livechat/ChatWindow.tsx
git commit -m "feat: ChatWindow rebuilt as cross-session timeline with date+session markers"
```

---

## Task D: LiveChatClient wiring + MemberCard update

**Files:**
- Modify: `erp/src/app/(dashboard)/livechat/LiveChatClient.tsx`
- Modify: `erp/src/components/livechat/MemberCard.tsx`

**Interfaces:**
- Consumes: `ChatWindowProps` from Task C (new props: `userId`, `sessions`, `scrollToSessionId`, `onScrollConsumed`)
- Produces:
  - `LiveChatClient` passes `member.id` as `userId`, `member.previous_sessions` as `sessions`, `scrollToSessionId` state and `onScrollConsumed` to `ChatWindow`
  - MemberCard `onSessionSelect` changed from `handleSelect` to `setScrollToSessionId`
  - MemberCard session history buttons no longer disabled on current session

- [ ] **Step 1: Update LiveChatClient.tsx**

Add `scrollToSessionId` state and wire new ChatWindow props.

Locate the `useState` block near the top of the component. Add:
```typescript
const [scrollToSessionId, setScrollToSessionId] = useState<number | null>(null);
```

Reset `scrollToSessionId` when selected user changes:
```typescript
useEffect(() => {
  setScrollToSessionId(null);
}, [selectedId]);
```

Change the `<ChatWindow>` JSX from:
```tsx
<ChatWindow
  sessionId={selectedId}
  messages={messages}
  setMessages={setMessages}
  hasMore={hasMore}
  setHasMore={setHasMore}
  memberName={member?.first_name ?? 'User'}
/>
```
to:
```tsx
<ChatWindow
  userId={member.id}
  sessionId={selectedId}
  sessions={member.previous_sessions}
  messages={messages}
  setMessages={setMessages}
  hasMore={hasMore}
  setHasMore={setHasMore}
  memberName={member.first_name ?? 'User'}
  scrollToSessionId={scrollToSessionId}
  onScrollConsumed={() => setScrollToSessionId(null)}
/>
```

Change the `<MemberCard>` `onSessionSelect` prop from:
```tsx
onSessionSelect={handleSelect}
```
to:
```tsx
onSessionSelect={setScrollToSessionId}
```

- [ ] **Step 2: Update MemberCard.tsx**

Find the `previous_sessions.map` block (around line 232). The `isCurrent` check and `disabled` behavior:

Change:
```tsx
const isCurrent = s.id === sessionId;
```
to use session's active status for the indicator instead:
```tsx
const isActiveForSending = s.id === sessionId;
```

Change `disabled={isCurrent}` to `disabled={false}` (allow clicking any session to scroll to it — even the current one scrolls to its start).

Update the label inside the button:
```tsx
{isActiveForSending && (
  <span className="ml-1 rounded bg-blue-100 px-1 py-0.5 text-[10px] font-medium text-blue-600">
    active
  </span>
)}
```

The `SessionSummary` type is already imported via `MemberCardData` — no import change needed. The `s.closed_at` and `s.assigned_to_username` fields are now available but not needed to render here (they're used by ChatWindow for timeline markers).

- [ ] **Step 3: TypeScript check — must be clean**

```bash
cd erp && npx tsc --noEmit 2>&1
```
Expected: **no errors**. This is the final task, TypeScript must be fully clean.

- [ ] **Step 4: Run Python tests to confirm no regression**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot && pytest tests/ -q
```
Expected: all tests pass (no Python code changed).

- [ ] **Step 5: Commit**

```bash
git add erp/src/app/\(dashboard\)/livechat/LiveChatClient.tsx \
        erp/src/components/livechat/MemberCard.tsx
git commit -m "feat: wire timeline props in LiveChatClient; session history scrolls to session"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Covered? |
|-----------------|---------|
| One continuous conversation timeline | ✅ `buildTimeline` interleaves all sessions |
| Messages grouped by date | ✅ `DateDivider` with Today/Yesterday/DD Mon YYYY |
| Full history scrollable (infinite scroll upward) | ✅ `handleScroll` + pagination endpoint |
| Timestamps on every message | ✅ Already in `MessageBubble` (unchanged) |
| Session boundaries as system events | ✅ `SessionMarker` with start/end |
| Assigned agent name in "Session Closed" marker | ✅ `session.assigned_to_username` in marker text |
| Session History in Member Card stays | ✅ `MemberCard.previous_sessions` preserved |
| Clicking session history → jump to session | ✅ `scrollToSessionId` → `data-session-id` DOM scroll |
| No duplicate rows in sidebar | ✅ Not changed — already DISTINCT ON |
| Load 100 messages initially | ✅ `getTimelineMessages` LIMIT 100 |
| Load 100 more on scroll | ✅ pagination endpoint returns 100 |
| No page buttons | ✅ Infinite scroll only |
| No breaking regressions | ✅ All listed systems unchanged |

### No placeholders — confirmed

All steps contain actual code. No TBD or "implement later."

### Type consistency

- `SessionSummary` added in Task A, used in Task B (repo), Task C (ChatWindow props), Task D (LiveChatClient)
- `ChatWindowProps.userId: number` matches `member.id: number` passed in Task D
- `ChatWindowProps.sessions: SessionSummary[]` matches `member.previous_sessions: SessionSummary[]`
- `scrollToSessionId: number | null` passed from state → ChatWindow; `onScrollConsumed: () => void` clears it
- `getTimelineMessages(userId, beforeId)` signature matches both call sites: initial repo query and pagination route
- `hasMore` now comes from `getSessionWithDetails` return (not computed in route separately)
