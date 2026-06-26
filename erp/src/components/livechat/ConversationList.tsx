'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { SessionCard } from './SessionCard';
import type { SupportSession, LiveChatSSEEvent } from '@/lib/types';
import { useNotifications, loadNotifSettings, type NotifSettings } from '@/hooks/useNotifications';
import { NotificationSettings } from './NotificationSettings';

const TABS = [
  { label: 'All', value: '' },
  { label: 'Waiting', value: 'OPEN' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Closed', value: 'CLOSED' },
];

type FilterKey = 'assignedToMe' | 'unassigned' | 'unread' | 'today' | 'lastWeek' | 'vip';

interface SessionsResponse {
  sessions: SupportSession[];
  total: number;
  stats: { open: number; active: number; closed_today: number };
}

export function ConversationList({
  selectedId,
  onSelect,
  currentUsername,
}: {
  selectedId: number | null;
  onSelect: (id: number) => void;
  currentUsername: string | null;
}) {
  const [sessions, setSessions] = useState<SupportSession[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ open: 0, active: 0, closed_today: 0 });
  const [tab, setTab] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(new Set());
  const [notifSettings, setNotifSettings] = useState<NotifSettings>(() => ({ sound: true, browser: true, titleFlash: true }));
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const esRef = useRef<EventSource | null>(null);

  // Load persisted notification settings on mount
  useEffect(() => { setNotifSettings(loadNotifSettings()); }, []);

  // Desktop notifications hook
  useNotifications(notifSettings);

  function buildParams(status: string, q: string, filters: Set<FilterKey>): URLSearchParams {
    const p = new URLSearchParams({ page: '1' });
    if (status) p.set('status', status);
    if (q) p.set('search', q);
    if (filters.has('assignedToMe') && currentUsername) p.set('assigned_to_me', currentUsername);
    if (filters.has('unassigned')) p.set('unassigned', '1');
    if (filters.has('unread')) p.set('unread', '1');
    if (filters.has('today')) p.set('today', '1');
    if (filters.has('lastWeek')) p.set('last_week', '1');
    if (filters.has('vip')) p.set('vip', '1');
    return p;
  }

  const load = useCallback(async (params: URLSearchParams) => {
    setLoading(true);
    const r = await fetch(`/api/livechat/sessions?${params}`);
    const d = await r.json() as SessionsResponse;
    setSessions(d.sessions);
    setTotal(d.total);
    setStats(d.stats);
    setLoading(false);
  }, []);

  function toggleFilter(key: FilterKey) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Initial load + tab/search/filter changes
  useEffect(() => {
    load(buildParams(tab, search, activeFilters));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, search, activeFilters, load, currentUsername]);

  // SSE for real-time updates
  useEffect(() => {
    const es = new EventSource('/api/livechat/stream');
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const evt: LiveChatSSEEvent = JSON.parse(e.data);
        // Re-fetch to get updated unread, last message, status
        load(buildParams(tab, search, activeFilters));
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, search, activeFilters, load, currentUsername]);

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
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">{total} sessions</span>
            <NotificationSettings settings={notifSettings} onChange={setNotifSettings} />
          </div>
        </div>
        <Input
          placeholder="Search name, @username, phone, UID, session..."
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

      {/* Filter pills */}
      <div className="flex flex-wrap gap-1 border-b px-3 py-2">
        {([
          { key: 'assignedToMe' as FilterKey, label: 'Mine',        hide: !currentUsername },
          { key: 'unassigned'   as FilterKey, label: 'Unassigned' },
          { key: 'unread'       as FilterKey, label: 'Unread' },
          { key: 'today'        as FilterKey, label: 'Today' },
          { key: 'lastWeek'     as FilterKey, label: 'Last 7 Days' },
          { key: 'vip'          as FilterKey, label: 'VIP' },
        ] as Array<{ key: FilterKey; label: string; hide?: boolean }>)
          .filter((f) => !f.hide)
          .map((f) => (
            <button
              key={f.key}
              onClick={() => toggleFilter(f.key)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                activeFilters.has(f.key)
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
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
