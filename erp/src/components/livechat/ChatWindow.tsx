'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { MessageBubble } from './MessageBubble';
import type { SupportMessage } from '@/lib/types';

function DateDivider({ date }: { date: string }) {
  return (
    <div className="flex items-center gap-3 my-3">
      <div className="flex-1 h-px bg-gray-100" />
      <span className="text-xs text-gray-400">{date}</span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  );
}

function groupByDate(
  messages: SupportMessage[],
): Array<{ date: string; msgs: SupportMessage[] }> {
  const groups: Array<{ date: string; msgs: SupportMessage[] }> = [];
  for (const m of messages) {
    const d = new Date(m.created_at).toLocaleDateString();
    const last = groups[groups.length - 1];
    if (last && last.date === d) last.msgs.push(m);
    else groups.push({ date: d, msgs: [m] });
  }
  return groups;
}

export interface ChatWindowProps {
  sessionId: number;
  messages: SupportMessage[];
  setMessages: React.Dispatch<React.SetStateAction<SupportMessage[]>>;
  memberName: string;
}

export function ChatWindow({
  sessionId,
  messages,
  setMessages,
  memberName,
}: ChatWindowProps) {
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isFirstLoad = useRef(true);
  // Ref to track last message id without adding to SSE effect deps
  const lastIdRef = useRef(0);

  // Keep lastIdRef in sync with messages
  useEffect(() => {
    lastIdRef.current = messages[messages.length - 1]?.id ?? 0;
  }, [messages]);

  // Initial load when sessionId changes
  useEffect(() => {
    setLoading(true);
    setHasMore(true);
    isFirstLoad.current = true;

    fetch(`/api/livechat/sessions/${sessionId}`)
      .then((r) => r.json())
      .then((d) => {
        setMessages(d.messages ?? []);
        setHasMore((d.messages?.length ?? 0) >= 50);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [sessionId, setMessages]);

  // Scroll to bottom on first load
  useEffect(() => {
    if (!loading && isFirstLoad.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
      isFirstLoad.current = false;
    }
  }, [loading]);

  // SSE: subscribe to new_message events for this session (USER messages only)
  useEffect(() => {
    const es = new EventSource('/api/livechat/stream');
    es.onmessage = (e: MessageEvent) => {
      try {
        const evt = JSON.parse(e.data as string) as {
          type: string;
          session_id: number;
          sender_type?: string;
        };
        if (
          evt.type === 'new_message' &&
          evt.session_id === sessionId &&
          evt.sender_type === 'USER'
        ) {
          const lastId = lastIdRef.current;
          if (lastId === 0) return;
          fetch(`/api/livechat/sessions/${sessionId}/messages?before_id=2147483647`)
            .then((r) => r.json())
            .then((d) => {
              const newMsgs = (d.messages ?? []).filter(
                (m: SupportMessage) => m.id > lastId,
              );
              if (newMsgs.length > 0) {
                setMessages((prev) => {
                  const ids = new Set(prev.map((m) => m.id));
                  return [...prev, ...newMsgs.filter((m: SupportMessage) => !ids.has(m.id))];
                });
                setTimeout(
                  () => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }),
                  50,
                );
              }
            })
            .catch(() => {});
        }
      } catch {
        // ignore parse errors
      }
    };
    return () => es.close();
  }, [sessionId, setMessages]);

  // Infinite scroll: load older messages when scrolled to top
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || loadingMore || !hasMore) return;
    if (el.scrollTop < 80) {
      const firstId = messages[0]?.id;
      if (!firstId) return;
      const prevScrollHeight = el.scrollHeight;
      setLoadingMore(true);
      fetch(`/api/livechat/sessions/${sessionId}/messages?before_id=${firstId}`)
        .then((r) => r.json())
        .then((d) => {
          const older: SupportMessage[] = d.messages ?? [];
          setMessages((prev) => [...older, ...prev]);
          setHasMore(older.length >= 50);
          setLoadingMore(false);
          requestAnimationFrame(() => {
            if (el) el.scrollTop = el.scrollHeight - prevScrollHeight;
          });
        })
        .catch(() => setLoadingMore(false));
    }
  }, [sessionId, messages, loadingMore, hasMore, setMessages]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-gray-400 text-sm">
        Loading…
      </div>
    );
  }

  const groups = groupByDate(messages);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto bg-gray-50 px-4 py-3 space-y-1"
    >
      {loadingMore && (
        <div className="text-center text-xs text-gray-400 py-2">Loading older…</div>
      )}
      {!hasMore && messages.length > 0 && (
        <div className="text-center text-xs text-gray-400 py-2">
          Beginning of conversation
        </div>
      )}
      {groups.map((g) => (
        <div key={g.date}>
          <DateDivider date={g.date} />
          <div className="space-y-2">
            {g.msgs.map((m) => (
              <MessageBubble key={m.id} msg={m} senderName={memberName} />
            ))}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
