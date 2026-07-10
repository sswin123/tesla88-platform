'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { SessionCard } from './SessionCard';
import type { SupportSession, LiveChatSSEEvent } from '@/lib/types';
import { loadNotifSettings, type NotifSettings } from '@/hooks/useNotifications';
import { NotificationSettings } from './NotificationSettings';

// ── Notification helpers (inlined so ConversationList owns its single SSE) ──────
function _playBeep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880; osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
    osc.onended = () => { ctx.close(); };
  } catch { /* ignore */ }
}
function _showBrowserNotif() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try { new Notification('Live Chat', { body: 'New message from customer' }); } catch { /* ignore */ }
}

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

  // Refs to current values for stable SSE closure
  const tabRef           = useRef(tab);
  const searchRef        = useRef(search);
  const activeFiltersRef = useRef(activeFilters);
  const sessionsRef      = useRef<SupportSession[]>([]);
  const notifRef         = useRef(notifSettings);

  useEffect(() => { tabRef.current = tab; },                   [tab]);
  useEffect(() => { searchRef.current = search; },             [search]);
  useEffect(() => { activeFiltersRef.current = activeFilters; }, [activeFilters]);
  useEffect(() => { sessionsRef.current = sessions; },         [sessions]);
  useEffect(() => { notifRef.current = notifSettings; },       [notifSettings]);

  // Load persisted notification settings on mount
  useEffect(() => { setNotifSettings(loadNotifSettings()); }, []);

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

  // Single stable SSE connection — lives for the full mount lifetime of ConversationList.
  // Uses refs to read current filter/session state without recreating on every change.
  useEffect(() => {
    let flashInterval: ReturnType<typeof setInterval> | null = null;
    let originalTitle = document.title;
    let flashing = false;

    function stopFlash() {
      if (flashInterval !== null) { clearInterval(flashInterval); flashInterval = null; }
      document.title = originalTitle;
      flashing = false;
    }
    function startFlash() {
      if (flashing || !document.hidden) return;
      flashing = true;
      originalTitle = document.title;
      let toggle = false;
      flashInterval = setInterval(() => {
        document.title = toggle ? 'Live Chat' : '🔴 New message — Live Chat';
        toggle = !toggle;
      }, 1000);
    }
    function handleVisibilityChange() { if (!document.hidden) stopFlash(); }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const es = new EventSource('/api/livechat/stream');

    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data as string) as LiveChatSSEEvent;

        if (evt.type === 'new_message') {
          // Check if the session is already in our list
          const inView = sessionsRef.current.some(s => s.id === evt.session_id);

          if (inView) {
            // Targeted update — no API call needed
            setSessions(prev => {
              const idx = prev.findIndex(s => s.id === evt.session_id);
              if (idx < 0) return prev;
              const s = prev[idx];
              const updated: SupportSession = {
                ...s,
                last_message_at: new Date().toISOString(),
                erp_unread_count:
                  evt.sender_type === 'USER' ? (s.erp_unread_count ?? 0) + 1 : s.erp_unread_count,
              };
              const rest = prev.filter((_, i) => i !== idx);
              if (updated.pinned_at) return [updated, ...rest];
              const insertAt = rest.findIndex(x => !x.pinned_at);
              if (insertAt === -1) return [...rest, updated];
              return [...rest.slice(0, insertAt), updated, ...rest.slice(insertAt)];
            });
          } else {
            // New session not yet in view — full reload
            load(buildParams(tabRef.current, searchRef.current, activeFiltersRef.current));
          }

          // Notifications for customer messages
          if (evt.sender_type === 'USER') {
            const s = notifRef.current;
            if (s.sound) _playBeep();
            if (s.browser) _showBrowserNotif();
            if (s.titleFlash) startFlash();
          }
        } else {
          // session_update (status change, close, etc.) → full reload for fresh stats
          load(buildParams(tabRef.current, searchRef.current, activeFiltersRef.current));
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects; no action needed
    };

    return () => {
      es.close();
      stopFlash();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  // load is a stable useCallback — this effect runs once on mount, cleans up on unmount
  }, [load]);

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
            <span className="text-xs text-gray-400">{total} {total === 1 ? 'customer' : 'customers'}</span>
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
