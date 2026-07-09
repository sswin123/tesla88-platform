'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { ChatMessage, ChatSession } from '@/lib/types';

interface Props {
  brandName: string;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function AgentAvatar() {
  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold mt-0.5"
      style={{ background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))', color: '#fff' }}
      aria-hidden="true"
    >
      客
    </div>
  );
}

function UserBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div className="flex justify-end items-end gap-2">
      <div className="max-w-[72%]">
        <div
          className="px-3.5 py-2.5 rounded-2xl rounded-br-sm text-sm leading-relaxed"
          style={{
            background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))',
            color: '#fff',
          }}
        >
          {msg.content}
        </div>
        <p className="text-right text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
          {formatTime(msg.created_at)}
        </p>
      </div>
    </div>
  );
}

function AgentBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div className="flex justify-start items-end gap-2">
      <AgentAvatar />
      <div className="max-w-[72%]">
        <div
          className="px-3.5 py-2.5 rounded-2xl rounded-bl-sm text-sm leading-relaxed"
          style={{ background: 'var(--bg-surface2)', color: 'var(--text-base)', border: '1px solid var(--border-dim)' }}
        >
          {msg.content}
        </div>
        <p className="text-left text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
          {formatTime(msg.created_at)}
        </p>
      </div>
    </div>
  );
}

export default function ChatWindow({ brandName }: Props) {
  const [session, setSession]     = useState<ChatSession | null>(null);
  const [messages, setMessages]   = useState<ChatMessage[]>([]);
  const [input, setInput]         = useState('');
  const [sending, setSending]     = useState(false);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  /* Auto-scroll on new messages */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /* Bootstrap: get/create session, load history, connect SSE */
  useEffect(() => {
    let es: EventSource | null = null;

    fetch('/api/livechat/session')
      .then(r => r.ok ? r.json() as Promise<ChatSession> : Promise.reject())
      .then(async (s) => {
        setSession(s);
        setLoading(false);

        const msgs = await fetch(`/api/livechat/messages?session_id=${s.id}`)
          .then(r => r.ok ? r.json() as Promise<ChatMessage[]> : Promise.resolve([]));
        setMessages(msgs);

        if (s.status === 'CLOSED') return;

        const lastId = msgs.length > 0 ? msgs[msgs.length - 1].id : 0;
        es = new EventSource(`/api/livechat/stream?session_id=${s.id}&last_id=${lastId}`);
        es.onmessage = (e) => {
          const data = JSON.parse(e.data as string) as { type: string } & ChatMessage;
          if (data.type === 'message') {
            setMessages(prev => {
              /* Ignore duplicates (client-side optimistic inserts have Date.now() as id) */
              if (prev.some(m => m.id === data.id && m.id < 1e13)) return prev;
              return [...prev, data];
            });
          }
          if (data.type === 'session_closed') {
            es?.close();
            setSession(prev => prev ? { ...prev, status: 'CLOSED' } : prev);
          }
        };
        es.onerror = () => { /* SSE will auto-reconnect */ };
      })
      .catch(() => {
        setError('无法连接客服，请刷新页面重试');
        setLoading(false);
      });

    return () => { es?.close(); };
  }, []);

  const sendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !session || sending || session.status === 'CLOSED') return;
    const content = input.trim();
    setSending(true);
    setInput('');

    /* Optimistic insert with temp id */
    const tempMsg: ChatMessage = {
      id: Date.now(),
      sender_type: 'USER',
      message_type: 'TEXT',
      content,
      caption: null,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempMsg]);

    const res = await fetch('/api/livechat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: session.id, content }),
    });
    setSending(false);
    if (!res.ok) {
      /* Remove optimistic message on failure */
      setMessages(prev => prev.filter(m => m.id !== tempMsg.id));
      setError('消息发送失败，请重试');
    }
  }, [input, session, sending]);

  const isActive = session?.status === 'ACTIVE';
  const isClosed = session?.status === 'CLOSED';

  /* ── Error ─────────────────────────────────────────────────── */
  if (error && !session) {
    return (
      <div className="casino-card p-8 text-center">
        <p className="text-2xl mb-3">⚠️</p>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{error}</p>
        <button
          onClick={() => { setError(''); setLoading(true); window.location.reload(); }}
          className="mt-4 casino-btn-primary px-5 py-2 text-sm"
        >
          重新连接
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-dim)',
        height: 'calc(100dvh - var(--header-h) - var(--bottomnav-h) - 50px)',
        minHeight: '400px',
        maxHeight: '720px',
      }}
    >
      {/* ── Header ───────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-4 py-3 shrink-0"
        style={{
          background: 'linear-gradient(90deg, color-mix(in srgb, var(--brand-primary) 15%, var(--bg-surface2)), var(--bg-surface2))',
          borderBottom: '1px solid var(--border-dim)',
        }}
      >
        {/* Status dot */}
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{
            background: loading ? 'var(--text-faint)' : isActive ? '#22c55e' : isClosed ? '#6b7280' : '#fbbf24',
            boxShadow: isActive ? '0 0 6px #22c55e' : undefined,
          }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: 'var(--text-base)' }}>
            {brandName} 客服
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {loading ? '连接中…' : isActive ? '客服在线' : isClosed ? '会话已结束' : '等待客服接入…'}
          </p>
        </div>
        {/* Support icon */}
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" aria-hidden="true">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
        </div>
      </div>

      {/* ── Messages area ────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-4 animate-pulse">
            <div className="flex gap-2 items-end">
              <div className="w-7 h-7 rounded-full" style={{ background: 'var(--bg-surface3)' }} />
              <div className="h-10 w-48 rounded-2xl rounded-bl-sm" style={{ background: 'var(--bg-surface3)' }} />
            </div>
            <div className="flex justify-end">
              <div className="h-10 w-36 rounded-2xl rounded-br-sm" style={{ background: 'var(--bg-surface3)' }} />
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && messages.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
              style={{ background: 'color-mix(in srgb, var(--brand-primary) 15%, transparent)' }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--brand-primary)" strokeWidth="2" aria-hidden="true">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
            </div>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-base)' }}>您好，有什么可以帮您？</p>
            <p className="text-xs" style={{ color: 'var(--text-faint)' }}>客服团队将在工作时间内尽快回复</p>
          </div>
        )}

        {/* Message list */}
        {messages.map(m =>
          m.sender_type === 'USER'
            ? <UserBubble key={m.id} msg={m} />
            : <AgentBubble key={m.id} msg={m} />
        )}

        {/* Session closed notice */}
        {isClosed && (
          <div className="text-center py-2">
            <span
              className="inline-block text-xs px-3 py-1 rounded-full"
              style={{ background: 'var(--bg-surface3)', color: 'var(--text-faint)' }}
            >
              会话已结束
            </span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Send error ───────────────────────────────────────── */}
      {error && session && (
        <div
          className="px-4 py-2 text-xs"
          style={{ background: 'rgba(239,68,68,0.10)', color: '#f87171', borderTop: '1px solid rgba(239,68,68,0.2)' }}
        >
          {error}
        </div>
      )}

      {/* ── Input area ───────────────────────────────────────── */}
      <form
        onSubmit={sendMessage}
        className="flex items-center gap-2 px-3 py-3 shrink-0"
        style={{ borderTop: '1px solid var(--border-dim)' }}
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={isClosed ? '会话已结束' : '输入消息…'}
          disabled={loading || isClosed || !session}
          maxLength={1000}
          className="flex-1 px-3.5 py-2.5 rounded-xl text-sm"
          style={{
            background: 'var(--bg-surface3)',
            border: '1px solid var(--border-mid)',
            color: 'var(--text-base)',
            outline: 'none',
          }}
          onFocus={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--brand-primary)'; }}
          onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--border-mid)'; }}
        />
        <button
          type="submit"
          disabled={!input.trim() || loading || isClosed || !session || sending}
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-opacity disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))' }}
          aria-label="发送"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" fill="white" stroke="none" />
          </svg>
        </button>
      </form>
    </div>
  );
}
