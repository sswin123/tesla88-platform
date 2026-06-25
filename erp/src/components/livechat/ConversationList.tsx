'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { SessionCard } from './SessionCard';
import type { SupportSession, LiveChatSSEEvent } from '@/lib/types';

const TABS = [
  { label: 'All', value: '' },
  { label: 'Waiting', value: 'OPEN' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Closed', value: 'CLOSED' },
];

export function ConversationList({
  selectedId,
  onSelect,
}: {
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const [sessions, setSessions] = useState<SupportSession[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ open: 0, active: 0, closed_today: 0 });
  const [tab, setTab] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const load = useCallback(async (status: string, q: string) => {
    setLoading(true);
    const params = new URLSearchParams({ page: '1' });
    if (status) params.set('status', status);
    if (q) params.set('search', q);
    const r = await fetch(`/api/livechat/sessions?${params}`);
    const d = await r.json();
    setSessions(d.sessions);
    setTotal(d.total);
    setStats(d.stats);
    setLoading(false);
  }, []);

  // Initial load + tab/search changes
  useEffect(() => {
    load(tab, search);
  }, [tab, search, load]);

  // SSE for real-time updates
  useEffect(() => {
    const es = new EventSource('/api/livechat/stream');
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const evt: LiveChatSSEEvent = JSON.parse(e.data);
        // Re-fetch to get updated unread, last message, status
        load(tab, search);
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects; no action needed
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [tab, search, load]);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(val), 300);
  }

  return (
    <div className="flex h-full flex-col border-r bg-white w-80 flex-shrink-0">
      {/* Header */}
      <div className="border-b p-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-sm">Live Chat</h2>
          <span className="text-xs text-gray-400">{total} sessions</span>
        </div>
        <Input
          placeholder="Search name, @username, UID..."
          onChange={handleSearchChange}
          className="h-8 text-sm"
        />
      </div>

      {/* Stats row */}
      <div className="flex border-b px-3 py-1.5 gap-3 text-xs text-gray-500">
        <span className="font-medium text-orange-500">{stats.open} waiting</span>
        <span className="font-medium text-green-600">{stats.active} active</span>
        <span>{stats.closed_today} closed today</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              tab === t.value
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto divide-y">
        {loading && (
          <div className="p-4 text-center text-xs text-gray-400">Loading...</div>
        )}
        {!loading && sessions.length === 0 && (
          <div className="p-4 text-center text-xs text-gray-400">No conversations.</div>
        )}
        {sessions.map((s) => (
          <SessionCard
            key={s.id}
            session={s}
            isActive={s.id === selectedId}
            onClick={() => onSelect(s.id)}
          />
        ))}
      </div>
    </div>
  );
}
