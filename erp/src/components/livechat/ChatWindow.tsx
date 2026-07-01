'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { MessageBubble } from './MessageBubble';
import { ImageLightbox } from './ImageLightbox';
import type { SupportMessage, SessionSummary } from '@/lib/types';

// Module-level scroll position cache — persists across user switches
const scrollPositionCache = new Map<number, number>();

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
      className="flex items-center gap-2 my-5"
      style={{ transition: 'background-color 0.7s' }}
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
  | { kind: 'session_end'; session: SessionSummary; key: string; timestamp: number }
  | { kind: 'unread_marker'; key: string; timestamp: number };

function buildTimeline(
  messages: SupportMessage[],
  sessions: SessionSummary[],
  firstUnreadId: number | null,
): TimelineItem[] {
  // Only show session markers for sessions that have at least one message in view
  const sessionIdsWithMessages = new Set(messages.map((m) => m.session_id));
  const visibleSessions = sessions.filter((s) => sessionIdsWithMessages.has(s.id));

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

  // Sort ascending by timestamp
  events.sort((a, b) => a.timestamp - b.timestamp);

  // Insert date separators
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

  // Insert unread marker before the first unread message
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
  unreadCount?: number;        // count of unread messages on initial load
  onReply?: (msg: SupportMessage) => void;  // for reply-to-message feature
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
  unreadCount,
  onReply,
}: ChatWindowProps) {
  const [loadingMore, setLoadingMore] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [pendingNewCount, setPendingNewCount] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isFirstLoad = useRef(true);
  const lastIdRef = useRef(0);
  const isNearBottomRef = useRef(true);

  useEffect(() => {
    lastIdRef.current = messages[messages.length - 1]?.id ?? 0;
  }, [messages]);

  // Reset first-load flag and pending count when user changes
  useEffect(() => {
    isFirstLoad.current = true;
    setLoadingMore(false);
    setPendingNewCount(0);
    isNearBottomRef.current = true;
  }, [userId]);

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

  // Scroll to session marker when session history is clicked
  useEffect(() => {
    if (scrollToSessionId == null) return;
    const el = document.querySelector<HTMLElement>(`[data-session-id="${scrollToSessionId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.backgroundColor = 'rgba(59,130,246,0.08)';
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
          (evt.user_id === userId || evt.session_id === sessionId)
        ) {
          const lastId = lastIdRef.current;
          fetch(`/api/livechat/users/${userId}/messages?before_id=2147483647`)
            .then((r) => r.json())
            .then((d) => {
              const allMsgs: SupportMessage[] = (d as { messages?: SupportMessage[] }).messages ?? [];
              const newMsgs = lastId === 0
                ? allMsgs
                : allMsgs.filter((m) => m.id > lastId);
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

  // Snap the initial unread count into a ref — only reset on userId change
  const unreadSnapRef = useRef(unreadCount ?? 0);
  useEffect(() => {
    // Only reset the snap when switching users (not when erp_unread_count clears to 0 on same user)
    unreadSnapRef.current = unreadCount ?? 0;
  }, [userId]); // intentionally NOT depending on unreadCount after first load

  const firstUnreadId = useMemo(() => {
    const snap = unreadSnapRef.current;
    if (snap <= 0 || messages.length === 0) return null;
    const idx = Math.max(0, messages.length - snap);
    return messages[idx]?.id ?? null;
  }, [messages]);

  const photoMessages = messages.filter((m) => m.message_type === 'PHOTO' && m.content);
  const photoIndexMap = new Map<string, number>(photoMessages.map((m, i) => [m.content!, i]));
  const lightboxPhotos = photoMessages.map((m) => ({
    src: mediaUrl(m.content!),
    caption: m.caption ?? undefined,
  }));

  const timeline = buildTimeline(messages, sessions, firstUnreadId);

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
          if (item.kind === 'unread_marker') {
            return (
              <div key={item.key} className="flex items-center gap-3 my-3">
                <div className="flex-1 h-px bg-blue-200" />
                <span className="text-xs text-blue-400 font-medium">Unread Messages</span>
                <div className="flex-1 h-px bg-blue-200" />
              </div>
            );
          }
          return (
            <MessageBubble
              key={item.key}
              msg={item.msg}
              senderName={memberName}
              onReply={onReply}
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
