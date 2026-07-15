# Phase 5.2 — Live Chat UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the Phase 5.1 timeline into a production-quality chat experience — jump-to-latest button, per-customer scroll memory, skeleton loading, reply-to-message quoting (ERP + Telegram), and message status indicators — without redesigning or breaking anything.

**Architecture:** All changes are additive: new DB columns (nullable, defaulted), new optional props on existing components, and new small components. No existing API contracts change shape.

**Tech Stack:** Next.js 15 App Router; PostgreSQL via asyncpg (bot) and pg (ERP); React 18 hooks; Tailwind CSS; aiogram 3 (bot)

## Global Constraints

- `npx tsc --noEmit` must produce zero errors after every task
- `pytest tests/ -q` must pass (only pure-Python test suite; no ERP frontend tests)
- Phase 5.1 timeline, session markers, date separators, SSE, infinite scroll, quick replies, file upload, caption relay — all must keep working
- No new npm packages
- No redesign of the timeline layout
- `reply_to_message_id`, `reply_to_content`, `reply_to_sender_type`, and `status` DB columns are nullable / defaulted so no migration is needed on the bot side for existing rows
- **Already done — do NOT re-implement:**
  - Retry Failed Message: `ReplyBox` already has `sendStatus: 'failed'` + Retry button
  - ImageLightbox: already has zoom toggle, fullscreen, keyboard nav, prev/next

---

## File Map

### New files
| File | Purpose |
|------|---------|
| `erp/migrations/024_chat_improvements.sql` | `reply_to_*` columns + `status` column on support_messages |
| `erp/src/components/livechat/ChatSkeleton.tsx` | Shimmer loading placeholder for the chat area |

### Modified files
| File | Change |
|------|--------|
| `erp/src/lib/types.ts` | Extend `SupportMessage` with `reply_to_message_id`, `reply_to_content`, `reply_to_sender_type`, `status` |
| `erp/src/lib/repositories/support_repo.ts` | Add new columns to all `support_messages` SELECT queries |
| `erp/src/app/api/livechat/sessions/[id]/messages/route.ts` | Resolve `reply_to_message_id` → `telegram_reply_to_msg_id` + `reply_to_content`; include in relay body and response |
| `bot/api_server.py` | Accept `telegram_reply_to_msg_id` in relay body; add `reply_to_message_id=` to all `bot.send_*` calls; INSERT new columns |
| `erp/src/components/livechat/ChatWindow.tsx` | Jump-to-latest floating button; per-userId scroll position cache; read marker divider; `onReply` prop chain |
| `erp/src/components/livechat/MessageBubble.tsx` | Render `reply_to_content` quote block; hover Reply action; `status` checkmark (✓/✓✓/👁) |
| `erp/src/components/livechat/ReplyBox.tsx` | Accept `replyToMessage` + `onClearReply` props; show quote preview above input; include `reply_to_message_id` in POST |
| `erp/src/app/(dashboard)/livechat/LiveChatClient.tsx` | Wire skeleton; add `replyToMessage` state; pass `onReply`/`replyToMessage`/`unreadCount` props |
| `erp/src/components/livechat/ImageLightbox.tsx` | Add Download `<a>` button to toolbar |

---

## Task 1: DB migration + type extensions

**Files:**
- Create: `erp/migrations/024_chat_improvements.sql`
- Modify: `erp/src/lib/types.ts`
- Modify: `erp/src/lib/repositories/support_repo.ts`

**Interfaces:**
- Produces: `SupportMessage.reply_to_message_id?: number | null`, `reply_to_content?: string | null`, `reply_to_sender_type?: string | null`, `status?: string | null`
- Produces: all `getTimelineMessages`, `getMoreMessages`, and initial-load queries return the four new columns

- [ ] **Step 1: Create migration**

`erp/migrations/024_chat_improvements.sql`:
```sql
-- 024_chat_improvements.sql
ALTER TABLE support_messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id  INT         REFERENCES support_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reply_to_content     TEXT,
  ADD COLUMN IF NOT EXISTS reply_to_sender_type VARCHAR(10),
  ADD COLUMN IF NOT EXISTS status               VARCHAR(10) NOT NULL DEFAULT 'SENT'
    CHECK (status IN ('SENT', 'DELIVERED', 'SEEN'));
```

- [ ] **Step 2: Apply migration (if DB is accessible; otherwise note it for deployment)**

```bash
psql $DATABASE_URL -f erp/migrations/024_chat_improvements.sql
```
Expected: `ALTER TABLE`

- [ ] **Step 3: Extend SupportMessage in types.ts**

Find the `SupportMessage` interface (currently ends with `created_at: string`). Add four new optional fields:
```typescript
export interface SupportMessage {
  id: number;
  session_id: number;
  sender_type: MessageSenderType;
  message_type: MessageType;
  content: string | null;
  caption: string | null;
  file_name: string | null;
  file_size: number | null;
  user_msg_id: number | null;
  group_msg_id: number | null;
  created_at: string;
  // Phase 5.2 additions
  reply_to_message_id: number | null;
  reply_to_content: string | null;
  reply_to_sender_type: string | null;
  status: string;
}
```

- [ ] **Step 4: Update all support_messages SELECT queries in support_repo.ts**

There are three queries that SELECT from `support_messages` (search for `SELECT id, session_id, sender_type`):

1. **`getTimelineMessages`** — add the four new columns:
```sql
SELECT id, session_id, sender_type, message_type, content, caption,
       file_name, file_size, user_msg_id, group_msg_id, created_at,
       reply_to_message_id, reply_to_content, reply_to_sender_type, status
FROM support_messages
WHERE session_id IN (SELECT id FROM support_sessions WHERE user_id = $1)
  AND id < $2
ORDER BY created_at DESC, id DESC
LIMIT $3
```

2. **`getMoreMessages`** — same addition to SELECT list.

3. **`getSessionWithDetails`** inline cross-session query (the 7th item in the Promise.all) — same addition to SELECT list.

- [ ] **Step 5: TypeScript check**

```bash
cd erp && npx tsc --noEmit 2>&1
```
Expected: zero errors (new fields are nullable, no callers break).

- [ ] **Step 6: Commit**

```bash
git add erp/migrations/024_chat_improvements.sql erp/src/lib/types.ts erp/src/lib/repositories/support_repo.ts
git commit -m "feat: migration 024 — reply_to fields + message status on support_messages"
```

---

## Task 2: Jump To Latest + Restore Scroll + Read Marker

**Files:**
- Modify: `erp/src/components/livechat/ChatWindow.tsx`

**Interfaces:**
- Consumes: new props `unreadCount: number`, `onReply?: (msg: SupportMessage) => void`
- Produces:
  - Floating "↓ N New" button when scrolled up and new messages have arrived
  - Per-userId scroll position restored on switch-back (module-level Map cache)
  - "Unread Messages" divider in timeline (before the last `unreadCount` messages on initial load)
  - `onReply` threaded to each `MessageBubble`

- [ ] **Step 1: Add module-level scroll cache**

At the top of `ChatWindow.tsx`, outside the component function, add:
```typescript
const scrollPositionCache = new Map<number, number>();
```

- [ ] **Step 2: Update ChatWindowProps**

Add two new props:
```typescript
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
  unreadCount?: number;        // NEW — count of unread messages on initial load
  onReply?: (msg: SupportMessage) => void;  // NEW — for reply-to-message feature
}
```

- [ ] **Step 3: Add jump-to-latest state**

Inside the component, add:
```typescript
const [pendingNewCount, setPendingNewCount] = useState(0);
const isNearBottomRef = useRef(true);
```

- [ ] **Step 4: Track "near bottom" in handleScroll**

Update the `handleScroll` callback to also track whether the user is near bottom:
```typescript
const handleScroll = useCallback(() => {
  const el = scrollRef.current;
  if (!el) return;

  // Track near-bottom state
  const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  isNearBottomRef.current = distFromBottom < 150;

  // Clear pending count when user scrolls to bottom
  if (isNearBottomRef.current && pendingNewCount > 0) {
    setPendingNewCount(0);
  }

  // Existing infinite scroll logic
  if (!loadingMore && hasMore && el.scrollTop < 80) {
    const firstId = messages[0]?.id;
    if (!firstId) return;
    const prevScrollHeight = el.scrollHeight;
    setLoadingMore(true);
    fetch(`/api/livechat/users/${userId}/messages?before_id=${firstId}`)
      .then((r) => r.json())
      .then((d) => {
        const older: SupportMessage[] = (d as { messages?: SupportMessage[]; hasMore?: boolean }).messages ?? [];
        setMessages((prev) => {
          const ids = new Set(prev.map((m) => m.id));
          return [...older.filter((m) => !ids.has(m.id)), ...prev];
        });
        setHasMore((d as { hasMore?: boolean }).hasMore ?? false);
        setLoadingMore(false);
        requestAnimationFrame(() => {
          if (el) el.scrollTop = el.scrollHeight - prevScrollHeight;
        });
      })
      .catch(() => setLoadingMore(false));
  }
}, [userId, messages, loadingMore, hasMore, setMessages, setHasMore, pendingNewCount]);
```

- [ ] **Step 5: Suppress auto-scroll + increment pending count in SSE handler**

In the SSE `useEffect`, change the auto-scroll logic:
```typescript
if (newMsgs.length > 0) {
  setMessages((prev) => {
    const ids = new Set(prev.map((m) => m.id));
    return [...prev, ...newMsgs.filter((m) => !ids.has(m.id))];
  });
  if (isNearBottomRef.current) {
    // User is at bottom — auto-scroll as before
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  } else {
    // User is scrolled up — show floating button instead
    setPendingNewCount((n) => n + newMsgs.length);
  }
}
```

- [ ] **Step 6: Restore scroll position per userId**

Replace the current "scroll to bottom on first load" useEffect with this pair:

```typescript
// Save scroll position when userId changes (cleanup runs before next effect)
useEffect(() => {
  return () => {
    if (scrollRef.current) {
      scrollPositionCache.set(userId, scrollRef.current.scrollTop);
    }
  };
}, [userId]);

// On initial load: restore saved position OR scroll to bottom
useEffect(() => {
  if (messages.length > 0 && isFirstLoad.current) {
    isFirstLoad.current = false;
    const saved = scrollPositionCache.get(userId);
    if (saved !== undefined) {
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = saved;
      });
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    }
  }
}, [messages.length, userId]);
```

- [ ] **Step 7: Add unread_marker to TimelineItem and buildTimeline**

Extend the type:
```typescript
type TimelineItem =
  | { kind: 'message'; msg: SupportMessage; key: string; timestamp: number }
  | { kind: 'date'; label: string; key: string; timestamp: number }
  | { kind: 'session_start'; session: SessionSummary; key: string; timestamp: number }
  | { kind: 'session_end'; session: SessionSummary; key: string; timestamp: number }
  | { kind: 'unread_marker'; key: string; timestamp: number };
```

Update `buildTimeline` signature and body:
```typescript
function buildTimeline(
  messages: SupportMessage[],
  sessions: SessionSummary[],
  firstUnreadId: number | null,
): TimelineItem[] {
  // ... (existing events array, sort, date separator loop unchanged) ...

  // After building result, insert unread marker
  if (firstUnreadId != null) {
    const idx = result.findIndex(
      (item) => item.kind === 'message' && item.msg.id === firstUnreadId
    );
    if (idx !== -1) {
      result.splice(idx, 0, {
        kind: 'unread_marker',
        key: 'unread-marker',
        timestamp: result[idx].timestamp - 1,
      });
    }
  }

  return result;
}
```

- [ ] **Step 8: Compute firstUnreadId and pass to buildTimeline**

Inside the component, snap the initial unread count into a ref:
```typescript
const unreadSnapRef = useRef(unreadCount ?? 0);
useEffect(() => {
  // Only reset the snap when switching users (not when erp_unread_count clears to 0 on same user)
  unreadSnapRef.current = unreadCount ?? 0;
}, [userId]);  // intentionally NOT depending on unreadCount after first load

const firstUnreadId = useMemo(() => {
  const snap = unreadSnapRef.current;
  if (snap <= 0 || messages.length === 0) return null;
  const idx = Math.max(0, messages.length - snap);
  return messages[idx]?.id ?? null;
}, [messages]);
```

Update the `buildTimeline` call:
```typescript
const timeline = buildTimeline(messages, sessions, firstUnreadId);
```

- [ ] **Step 9: Render unread_marker and jump-to-latest button**

In the JSX, add the "Unread Messages" divider render case:
```tsx
if (item.kind === 'unread_marker') {
  return (
    <div key={item.key} className="flex items-center gap-3 my-3">
      <div className="flex-1 h-px bg-blue-200" />
      <span className="text-xs text-blue-400 font-medium">Unread Messages</span>
      <div className="flex-1 h-px bg-blue-200" />
    </div>
  );
}
```

Add the floating jump-to-latest button INSIDE the scrollable div, after the timeline:
```tsx
{pendingNewCount > 0 && (
  <button
    onClick={() => {
      setPendingNewCount(0);
      isNearBottomRef.current = true;
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }}
    className="fixed bottom-24 right-80 z-20 flex items-center gap-1.5 rounded-full bg-blue-500 px-3 py-1.5 text-xs font-medium text-white shadow-lg hover:bg-blue-600 transition-colors"
  >
    ↓ {pendingNewCount} new
  </button>
)}
```

Note: `right-80` positions it to the left of the 320px right panel (Member Card). Adjust if the right panel width differs.

- [ ] **Step 10: Thread `onReply` to MessageBubble (prep for Task 5)**

Add `onReply={onReply}` to the `<MessageBubble>` call in the timeline render:
```tsx
<MessageBubble
  key={item.key}
  msg={item.msg}
  senderName={memberName}
  onReply={onReply}
  onPhotoClick={...}
/>
```

- [ ] **Step 11: TypeScript check**

```bash
cd erp && npx tsc --noEmit 2>&1
```
Expected: errors in `LiveChatClient.tsx` (missing `unreadCount` and `onReply` props on `<ChatWindow>`). No errors in `ChatWindow.tsx` itself.

- [ ] **Step 12: Commit**

```bash
git add erp/src/components/livechat/ChatWindow.tsx
git commit -m "feat: jump-to-latest button, per-user scroll restore, unread marker in timeline"
```

---

## Task 3: Loading Skeleton + ImageLightbox Download + MessageBubble Status

**Files:**
- Create: `erp/src/components/livechat/ChatSkeleton.tsx`
- Modify: `erp/src/app/(dashboard)/livechat/LiveChatClient.tsx`
- Modify: `erp/src/components/livechat/ImageLightbox.tsx`
- Modify: `erp/src/components/livechat/MessageBubble.tsx`

**Interfaces:**
- Produces: `ChatSkeleton` component used by `LiveChatClient` during session load
- Produces: ImageLightbox toolbar gains a Download button
- Produces: MessageBubble ✓/✓✓/👁 reflects `msg.status` field

- [ ] **Step 1: Create ChatSkeleton.tsx**

`erp/src/components/livechat/ChatSkeleton.tsx`:
```typescript
export function ChatSkeleton() {
  const bubbles: Array<{ isAgent: boolean; width: string }> = [
    { isAgent: false, width: 'w-48' },
    { isAgent: true,  width: 'w-44' },
    { isAgent: false, width: 'w-56' },
    { isAgent: false, width: 'w-36' },
    { isAgent: true,  width: 'w-52' },
    { isAgent: true,  width: 'w-40' },
    { isAgent: false, width: 'w-48' },
  ];

  return (
    <div className="flex-1 overflow-hidden bg-gray-50 px-4 py-4 space-y-3">
      {bubbles.map((b, i) => (
        <div key={i} className={`flex gap-2 ${b.isAgent ? 'flex-row-reverse' : 'flex-row'}`}>
          <div
            className={`h-10 rounded-2xl animate-pulse ${b.width} ${
              b.isAgent ? 'bg-blue-200 rounded-tr-none' : 'bg-gray-200 rounded-tl-none'
            }`}
          />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Wire ChatSkeleton into LiveChatClient.tsx**

In `LiveChatClient.tsx`:
1. Import `ChatSkeleton`:
   ```typescript
   import { ChatSkeleton } from '@/components/livechat/ChatSkeleton';
   ```

2. Find the `loadingSession` branch (currently shows `"Loading…"` text):
   ```tsx
   // Replace:
   <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
     Loading…
   </div>
   // With:
   <div className="flex flex-1 flex-col overflow-hidden">
     <div className="flex flex-shrink-0 items-center gap-3 border-b bg-white px-4 py-2">
       <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
     </div>
     <ChatSkeleton />
   </div>
   ```

   This shows a skeleton header + skeleton chat bubbles instead of a blank loading screen.

- [ ] **Step 3: Wire new ChatWindow props in LiveChatClient.tsx**

Add `replyToMessage` state and wire all new props:

```typescript
const [replyToMessage, setReplyToMessage] = useState<SupportMessage | null>(null);
```

Clear reply when selected session changes:
```typescript
useEffect(() => {
  setReplyToMessage(null);
}, [selectedId]);
```

Update `<ChatWindow>` JSX (both the open and the conditional branch if any):
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
  unreadCount={session.erp_unread_count}
  onReply={setReplyToMessage}
/>
```

Update `<ReplyBox>` JSX:
```tsx
<ReplyBox
  sessionId={selectedId}
  onMessageSent={handleMessageSent}
  externalFile={droppedFile}
  onExternalFileConsumed={() => setDroppedFile(null)}
  replyToMessage={replyToMessage}
  onClearReply={() => setReplyToMessage(null)}
/>
```

Needed imports: `SupportMessage` (likely already imported via `@/lib/types`).

- [ ] **Step 4: Add Download button to ImageLightbox.tsx**

Find the toolbar `<div className="flex gap-3">` containing the fullscreen button, zoom button, and close button. Add a download link BETWEEN the zoom button and close button:

```tsx
<a
  href={photo.src}
  download
  onClick={(e) => e.stopPropagation()}
  className="text-white opacity-70 hover:opacity-100 text-sm"
  title="Download"
>
  ⬇
</a>
```

- [ ] **Step 5: Update MessageBubble to render status checkmark from msg.status**

Find the existing checkmark line (line ~192):
```tsx
{isAgent && <span className="ml-1">✓</span>}
```

Replace with:
```tsx
{isAgent && (
  <span className="ml-1">
    {msg.status === 'SEEN'
      ? '👁'
      : msg.status === 'DELIVERED'
        ? '✓✓'
        : '✓'}
  </span>
)}
```

Since all existing messages have `status = 'SENT'` (DB default), the visual result is identical to before — still shows ✓. Future upgrade to DELIVERED/SEEN will just work.

- [ ] **Step 6: TypeScript check**

```bash
cd erp && npx tsc --noEmit 2>&1
```
Expected: errors in `MessageBubble.tsx` (missing `onReply` prop) and `ReplyBox.tsx` (missing `replyToMessage`/`onClearReply` props). No errors in the files just changed.

- [ ] **Step 7: Commit**

```bash
git add erp/src/components/livechat/ChatSkeleton.tsx \
        "erp/src/app/(dashboard)/livechat/LiveChatClient.tsx" \
        erp/src/components/livechat/ImageLightbox.tsx \
        erp/src/components/livechat/MessageBubble.tsx
git commit -m "feat: chat skeleton, image download button, message status checkmark"
```

---

## Task 4: Reply To Message — UI (MessageBubble hover + ReplyBox quote preview)

**Files:**
- Modify: `erp/src/components/livechat/MessageBubble.tsx`
- Modify: `erp/src/components/livechat/ReplyBox.tsx`

**Interfaces:**
- Consumes: `SupportMessage.reply_to_content`, `reply_to_sender_type` (from Task 1)
- Produces:
  - `MessageBubble` accepts `onReply?: (msg: SupportMessage) => void` — shows hover Reply button; renders `reply_to_content` quote block when present
  - `ReplyBox` accepts `replyToMessage?: SupportMessage | null` and `onClearReply?: () => void` — shows quote preview, sends `reply_to_message_id` in POST

- [ ] **Step 1: Update MessageBubble props and add helper**

Add `onReply` to `MessageBubble` props:
```typescript
export function MessageBubble({
  msg,
  senderName,
  onPhotoClick,
  onReply,
}: {
  msg: SupportMessage;
  senderName?: string;
  onPhotoClick?: () => void;
  onReply?: (msg: SupportMessage) => void;
}) {
```

Add helper function near the top of the file (after existing helpers):
```typescript
function getPreviewText(msg: SupportMessage): string {
  if (msg.message_type === 'TEXT') return (msg.content ?? '').slice(0, 120);
  if (msg.message_type === 'PHOTO') return '📷 Photo';
  if (msg.message_type === 'VIDEO') return '🎥 Video';
  if (msg.message_type === 'AUDIO') return '🎵 Audio';
  if (msg.message_type === 'DOCUMENT') return msg.file_name ?? '📎 Document';
  return `[${msg.message_type}]`;
}
```

- [ ] **Step 2: Add quote block rendering inside MediaContent (or just in MessageBubble)**

Add a `QuoteBlock` sub-component (inline at top of file, no separate file needed):
```typescript
function QuoteBlock({
  content,
  senderType,
  isAgentBubble,
}: {
  content: string;
  senderType: string | null;
  isAgentBubble: boolean;
}) {
  return (
    <div
      className={cn(
        'border-l-2 rounded-r px-2 py-1 mb-2 text-xs',
        isAgentBubble
          ? 'border-white/40 bg-white/10 text-white/75'
          : 'border-blue-400 bg-blue-50 text-gray-600'
      )}
    >
      <p className={cn('font-semibold text-[10px] mb-0.5', isAgentBubble ? 'text-white/60' : 'text-blue-500')}>
        {senderType === 'AGENT' ? 'Agent' : 'Customer'}
      </p>
      <p className="line-clamp-2 leading-tight">{content}</p>
    </div>
  );
}
```

- [ ] **Step 3: Update MessageBubble JSX to show quote block and hover Reply button**

Wrap the entire bubble in a `group` div and add the Reply hover button:

```tsx
export function MessageBubble({ msg, senderName, onPhotoClick, onReply }) {
  const isAgent = msg.sender_type === 'AGENT';

  return (
    <div className={cn('flex gap-1 group', isAgent ? 'flex-row-reverse' : 'flex-row')}>
      {/* Hover reply button — appears on the outer side of the bubble */}
      {onReply && (
        <button
          onClick={(e) => { e.stopPropagation(); onReply(msg); }}
          className="self-center opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-blue-400 text-base px-1 flex-shrink-0"
          title="Reply"
        >
          ↩
        </button>
      )}

      <div
        className={cn(
          'max-w-sm rounded-2xl px-4 py-2 text-sm shadow-sm',
          isAgent
            ? 'bg-blue-500 text-white rounded-tr-none'
            : 'bg-white text-gray-800 rounded-tl-none border',
        )}
      >
        {/* Quote block — shown when this message is a reply */}
        {msg.reply_to_content && (
          <QuoteBlock
            content={msg.reply_to_content}
            senderType={msg.reply_to_sender_type ?? null}
            isAgentBubble={isAgent}
          />
        )}

        {!isAgent && senderName && (
          <p className="mb-1 text-xs font-semibold text-gray-500">{senderName}</p>
        )}
        <MediaContent msg={msg} onPhotoClick={onPhotoClick} />
        <p className={cn('mt-1 text-right text-xs opacity-70')}>
          {formatTime(msg.created_at)}
          {isAgent && (
            <span className="ml-1">
              {msg.status === 'SEEN' ? '👁' : msg.status === 'DELIVERED' ? '✓✓' : '✓'}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
```

Note: Remove the duplicate status checkmark from Step 5 of Task 3 — this replaces it.

- [ ] **Step 4: Update ReplyBox to accept and display replyToMessage**

Add new props to the `ReplyBox` component:

```typescript
export interface ReplyBoxProps {
  sessionId: number;
  onMessageSent: (msg: SupportMessage) => void;
  externalFile?: File | null;
  onExternalFileConsumed?: () => void;
  replyToMessage?: SupportMessage | null;   // NEW
  onClearReply?: () => void;                // NEW
}
```

At the TOP of the returned JSX (before the drag overlay or as the first item), add the reply preview bar:

```tsx
{replyToMessage && (
  <div className="flex items-start gap-2 border-t border-b bg-blue-50/60 px-3 py-2">
    <div className="flex-1 border-l-2 border-blue-400 pl-2 min-w-0">
      <p className="text-[10px] font-semibold text-blue-500 mb-0.5">
        {replyToMessage.sender_type === 'AGENT' ? 'Agent' : 'Customer'}
      </p>
      <p className="text-xs text-gray-500 truncate">{getPreviewText(replyToMessage)}</p>
    </div>
    <button
      type="button"
      onClick={onClearReply}
      className="flex-shrink-0 text-gray-400 hover:text-gray-600 text-sm px-1"
      title="Cancel reply"
    >
      ×
    </button>
  </div>
)}
```

Where `getPreviewText` is either imported or duplicated:
```typescript
function getPreviewText(msg: SupportMessage): string {
  if (msg.message_type === 'TEXT') return (msg.content ?? '').slice(0, 120);
  if (msg.message_type === 'PHOTO') return '📷 Photo';
  if (msg.message_type === 'VIDEO') return '🎥 Video';
  if (msg.message_type === 'AUDIO') return '🎵 Audio';
  if (msg.message_type === 'DOCUMENT') return msg.file_name ?? '📎 Document';
  return `[${msg.message_type}]`;
}
```

- [ ] **Step 5: Include reply_to_message_id in the dispatchSend payload**

In `ReplyBox`, find `dispatchSend` (the `useCallback` that POSTs to the messages route). Add `reply_to_message_id` to the request body:

```typescript
const dispatchSend = useCallback(async (payload: {
  message_type: string;
  content: string;
  caption?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  quick_reply_id?: number;
  quick_reply_used?: boolean;
  reply_to_message_id?: number | null;  // NEW
}): Promise<boolean> => {
  // ...existing code...
  body: JSON.stringify({
    ...payload,
    reply_to_message_id: replyToMessage?.id ?? null,  // ADD THIS
  }),
  // ...
```

Also clear the reply after a successful send. After the existing draft clear:
```typescript
// On success, after clearing draft:
onClearReply?.();
```

- [ ] **Step 6: TypeScript check**

```bash
cd erp && npx tsc --noEmit 2>&1
```
Expected: errors only in `messages/route.ts` or `api_server.py`-related TypeScript (the backend route hasn't been updated yet to handle `reply_to_message_id`). But if `reply_to_message_id` is already typed correctly in `SupportMessage` (Task 1), the client-side code should be clean.

Actually: zero errors expected here since `reply_to_message_id` is already in `SupportMessage` from Task 1. The route.ts still handles the post body correctly (it will just ignore `reply_to_message_id` until Task 5).

- [ ] **Step 7: Commit**

```bash
git add erp/src/components/livechat/MessageBubble.tsx \
        erp/src/components/livechat/ReplyBox.tsx
git commit -m "feat: reply-to-message UI — hover reply button, quote block, reply preview in ReplyBox"
```

---

## Task 5: Reply To Message — Backend (route + relay)

**Files:**
- Modify: `erp/src/app/api/livechat/sessions/[id]/messages/route.ts`
- Modify: `bot/api_server.py`

**Interfaces:**
- Consumes: `reply_to_message_id` from POST body
- Produces:
  - Route looks up original message, computes `reply_to_content` + `reply_to_sender_type` + `telegram_reply_to_msg_id`
  - Relay accepts and stores `reply_to_*` fields in DB INSERT
  - Relay uses `reply_to_message_id=telegram_reply_to_msg_id` on all `bot.send_*` calls
  - Response message object includes the four reply fields so the chat window updates immediately

- [ ] **Step 1: Update messages/route.ts to handle reply_to_message_id**

First, add `pool` import if not already present (the route uses `BOT_RELAY_URL` and `fetch`; it may or may not already import `pool` from `@/lib/db`). Add if missing:
```typescript
import pool from '@/lib/db';
```

In the POST handler, after parsing `body`, add reply-to lookup:

```typescript
// After the existing quick_reply and content validation, before the relay fetch:
let replyToMsgId: number | null = (body.reply_to_message_id as number) ?? null;
let telegramReplyToMsgId: number | null = null;
let replyToContent: string | null = null;
let replyToSenderType: string | null = null;

if (replyToMsgId) {
  const { rows } = await pool.query<{
    content: string | null;
    message_type: string;
    file_name: string | null;
    user_msg_id: number | null;
    sender_type: string;
  }>(
    `SELECT content, message_type, file_name, user_msg_id, sender_type
     FROM support_messages WHERE id = $1`,
    [replyToMsgId]
  );
  const orig = rows[0];
  if (orig) {
    telegramReplyToMsgId = orig.user_msg_id;
    replyToSenderType = orig.sender_type;
    if (orig.message_type === 'TEXT') {
      replyToContent = (orig.content ?? '').slice(0, 200);
    } else if (orig.message_type === 'PHOTO') {
      replyToContent = '📷 Photo';
    } else if (orig.message_type === 'VIDEO') {
      replyToContent = '🎥 Video';
    } else if (orig.message_type === 'AUDIO') {
      replyToContent = '🎵 Audio';
    } else {
      replyToContent = orig.file_name ?? `[${orig.message_type}]`;
    }
  }
}
```

Add the four reply fields to the relay request body (find the `body: JSON.stringify({...})` block):
```typescript
body: JSON.stringify({
  session_id:              sessionId,
  message_type:            messageType,
  content,
  caption,
  file_name:               fileName,
  file_size:               fileSize,
  agent_username:          payload.username ?? null,
  // NEW:
  reply_to_message_id:     replyToMsgId,
  reply_to_content:        replyToContent,
  reply_to_sender_type:    replyToSenderType,
  telegram_reply_to_msg_id: telegramReplyToMsgId,
}),
```

Update the response `message` object to include reply fields (find the `return NextResponse.json({ok:true, message: {...}})` at the end):
```typescript
return NextResponse.json({
  ok: true,
  message: {
    id:                   (relayData as { message_id?: number }).message_id,
    session_id:           sessionId,
    sender_type:          'AGENT',
    message_type:         (relayData as { message_type?: string }).message_type ?? messageType,
    content:              (relayData as { content?: string }).content ?? content,
    caption,
    file_name:            fileName,
    file_size:            fileSize,
    reply_to_message_id:  replyToMsgId,
    reply_to_content:     replyToContent,
    reply_to_sender_type: replyToSenderType,
    status:               'SENT',
    created_at:           (relayData as { created_at?: string }).created_at,
    user_msg_id:          null,
    group_msg_id:         null,
  },
});
```

- [ ] **Step 2: Update bot/api_server.py relay handler**

Find the relay handler function (the `async def relay_handler(request)` or similar). After parsing `data`, add:

```python
reply_to_msg_id = data.get("reply_to_message_id")        # our DB id
reply_to_content = data.get("reply_to_content")
reply_to_sender_type = data.get("reply_to_sender_type")
telegram_reply_to_msg_id = data.get("telegram_reply_to_msg_id")  # Telegram msg id
```

Build a `reply_kwargs` dict to pass to all send methods:
```python
reply_kwargs: dict = {}
if telegram_reply_to_msg_id:
    reply_kwargs["reply_to_message_id"] = int(telegram_reply_to_msg_id)
```

Add `**reply_kwargs` to every `bot.send_*` call. The send calls are:
- `bot.send_message(telegram_id, content)` → `bot.send_message(telegram_id, content, **reply_kwargs)`
- `bot.send_photo(telegram_id, photo=..., caption=caption)` → add `, **reply_kwargs`
- `bot.send_video(...)` → add `, **reply_kwargs`
- `bot.send_animation(...)` → add `, **reply_kwargs`
- `bot.send_audio(...)` → add `, **reply_kwargs`
- `bot.send_voice(...)` → add `, **reply_kwargs`
- `bot.send_document(...)` → add `, **reply_kwargs`
- `bot.send_sticker(...)` → add `, **reply_kwargs`
- `bot.send_video_note(...)` → add `, **reply_kwargs`
- `bot.send_location(...)` → add `, **reply_kwargs`

Note: `reply_kwargs` will be empty `{}` for most messages (no reply), so this is safe.

Find the INSERT statement (currently):
```python
row = await pool.fetchrow(
    """INSERT INTO support_messages
           (session_id, sender_type, message_type, content, user_msg_id, caption, file_name, file_size)
       VALUES ($1, 'AGENT', $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at""",
    session_id, stored_type, stored_content, tg_msg_id, caption, file_name, file_size,
)
```

Replace with:
```python
row = await pool.fetchrow(
    """INSERT INTO support_messages
           (session_id, sender_type, message_type, content, user_msg_id, caption,
            file_name, file_size, reply_to_message_id, reply_to_content, reply_to_sender_type)
       VALUES ($1, 'AGENT', $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, created_at""",
    session_id, stored_type, stored_content, tg_msg_id, caption,
    file_name, file_size, reply_to_msg_id, reply_to_content, reply_to_sender_type,
)
```

Update the return JSON to include reply fields:
```python
return web.json_response({
    "ok": True,
    "message_id":            row["id"],
    "message_type":          stored_type,
    "content":               stored_content,
    "created_at":            row["created_at"].isoformat(),
    "reply_to_message_id":   reply_to_msg_id,
    "reply_to_content":      reply_to_content,
    "reply_to_sender_type":  reply_to_sender_type,
})
```

- [ ] **Step 3: TypeScript check**

```bash
cd erp && npx tsc --noEmit 2>&1
```
Expected: **zero errors** — this is the final task, TypeScript must be fully clean.

- [ ] **Step 4: Run Python tests**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot && pytest tests/ -q 2>&1 | tail -10
```
Expected: same results as before — only pre-existing failures (no Python logic changed, just added parameters).

- [ ] **Step 5: Commit**

```bash
git add "erp/src/app/api/livechat/sessions/[id]/messages/route.ts" \
        bot/api_server.py
git commit -m "feat: reply-to-message backend — route resolves reply context, relay stores+sends with Telegram reply"
```

---

## Self-Review

### Spec coverage

| Spec item | Priority | Covered? |
|-----------|----------|---------|
| Jump To Latest | A | ✅ Task 2 — floating button, pending count, suppresses auto-scroll when scrolled up |
| Restore Scroll Position | A | ✅ Task 2 — module-level Map per userId |
| Loading Skeleton | A | ✅ Task 3 — ChatSkeleton with shimmer bubbles |
| Better Media Viewer — image zoom/fullscreen/prev/next | A | ✅ Already done in Phase 5.1 ImageLightbox |
| Better Media Viewer — download | A | ✅ Task 3 — download `<a>` added to lightbox toolbar |
| Retry Failed Message | A | ✅ Already done — ReplyBox has `sendStatus='failed'` + Retry button |
| Reply To Message | B | ✅ Tasks 4+5 — full stack: hover, quote preview, route, relay, Telegram, DB |
| Message Status ✓ | C | ✅ Task 1 (DB) + Task 3 (render from msg.status) |
| Read Marker | C | ✅ Task 2 — "Unread Messages" divider, snapped on initial load |
| Better Media Preview (review only) | D | ✅ No rewrite — existing implementation sufficient |
| Search Highlight (review only) | D | ✅ No-op — noted for future; no full-text search built |

### No placeholders

All steps contain complete code. No TBD or "implement later."

### Type consistency

- `SupportMessage.reply_to_message_id: number | null` added in Task 1, used in Tasks 4 and 5
- `ChatWindowProps.unreadCount?: number` added in Task 2; passed as `session.erp_unread_count` in Task 3
- `ChatWindowProps.onReply?: (msg: SupportMessage) => void` added in Task 2; set as `setReplyToMessage` in Task 3; called in Task 4 MessageBubble
- `ReplyBoxProps.replyToMessage?: SupportMessage | null` added in Task 4; wired in Task 3
- `getPreviewText` appears in both Task 4 (MessageBubble) and Task 4 (ReplyBox) — duplicate intentional (no shared file created to stay minimal)
- `QuoteBlock` component in MessageBubble uses `msg.reply_to_sender_type: string | null` — type matches Task 1 definition
