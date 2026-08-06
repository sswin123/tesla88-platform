'use client';
import { useState, useEffect, useMemo } from 'react';

interface MegaH5Game {
  game_code:      string;
  display_name:   string;
  icon_url:       string | null;
  thumbnail_url:  string | null;
  category:       string | null;
  is_maintenance: boolean;
}

interface Props {
  open:       boolean;
  launching:  boolean;
  onClose:    () => void;
  onSelect:   (gameCode: string, displayName: string) => void;
}

// Display labels for each category value from the database
const CATEGORY_LABELS: Record<string, string> = {
  slot:    'Slot',
  arcade:  'Arcade',
  table:   '桌游',
  fishing: '捕鱼',
  live:    '真人',
};

// Preferred sort order for category tabs
const CATEGORY_ORDER = ['slot', 'arcade', 'table', 'fishing', 'live'];

// Game image from official ZIP (gameIcon_en/*.png).
// Mapping: gameCode.toLowerCase() → /megah5/icons/{lower}.png
// onError falls back to 🎮 emoji.
function GameImage({ gameCode, displayName }: { gameCode: string; displayName: string }) {
  const [err, setErr] = useState(false);

  if (err) {
    return (
      <div
        className="absolute inset-0 flex items-center justify-center text-3xl"
        style={{ background: 'var(--bg-surface2, #252640)' }}
      >🎮</div>
    );
  }

  return (
    <img
      src={`/megah5/icons/${gameCode.toLowerCase()}.png`}
      alt={displayName}
      loading="lazy"
      className="absolute inset-0 w-full h-full object-cover"
      onError={() => setErr(true)}
    />
  );
}

export function MegaH5GamePicker({ open, launching, onClose, onSelect }: Props) {
  const [games,   setGames]   = useState<MegaH5Game[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab,     setTab]     = useState<string>('all');
  const [search,  setSearch]  = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setGames(null);
    setTab('all');
    setSearch('');
    fetch('/api/public/games?provider=MEGAH5&limit=200')
      .then(r => r.ok ? r.json() as Promise<MegaH5Game[]> : Promise.resolve([]))
      .then(data => { setGames(data); setLoading(false); })
      .catch(() => { setGames([]); setLoading(false); });
  }, [open]);

  // Count per category
  const tabCounts = useMemo(() => {
    if (!games) return {} as Record<string, number>;
    const counts: Record<string, number> = { all: games.length };
    for (const g of games) {
      const c = g.category ?? 'other';
      counts[c] = (counts[c] ?? 0) + 1;
    }
    return counts;
  }, [games]);

  // Categories derived dynamically from game data — sorted by CATEGORY_ORDER
  const availableTabs = useMemo(() => {
    if (!games) return [] as string[];
    const seen = new Set<string>();
    for (const g of games) {
      if (g.category && g.category !== 'other') seen.add(g.category);
    }
    return Array.from(seen).sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a);
      const bi = CATEGORY_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [games]);

  const filtered = useMemo(() => {
    if (!games) return [];
    let list = tab === 'all' ? games : games.filter(g => g.category === tab);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(g => g.display_name.toLowerCase().includes(q));
    }
    return list;
  }, [games, tab, search]);

  if (!open) return null;

  const tabBtnBase: React.CSSProperties = {
    flexShrink:    0,
    whiteSpace:    'nowrap',
    minWidth:      80,
    height:        40,
    padding:       '0 16px',
    borderRadius:  999,
    fontSize:      13,
    fontWeight:    500,
    border:        'none',
    cursor:        'pointer',
    transition:    'background 0.18s, color 0.18s',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="选择游戏"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.80)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        className="relative w-full max-w-lg rounded-t-2xl sm:rounded-2xl flex flex-col"
        style={{ background: 'var(--bg-card, var(--bg-surface, #1a1b2e))', maxHeight: '85vh' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-base, #fff)' }}>
            选择游戏
            {games !== null && (
              <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-muted, #888)' }}>
                {filtered.length} 款
              </span>
            )}
          </h3>
          <button
            onClick={onClose}
            className="text-lg leading-none px-1"
            style={{ color: 'var(--text-muted, #888)' }}
            aria-label="关闭"
          >✕</button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3 pb-1">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: 'var(--text-muted, #888)' }}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索游戏…"
              className="w-full rounded-lg text-sm pl-9 pr-4 py-2 outline-none"
              style={{
                background: 'rgba(255,255,255,0.07)',
                color:      'var(--text-base, #fff)',
                border:     '1px solid rgba(255,255,255,0.10)',
              }}
            />
          </div>
        </div>

        {/* Category Tabs — horizontal scroll, dynamic, no hardcoded categories */}
        <div
          className="picker-tabs px-4 py-2"
          style={{
            display:         'flex',
            gap:             10,
            overflowX:       'auto',
            scrollbarWidth:  'none',       /* Firefox */
            msOverflowStyle: 'none',       /* IE */
            WebkitOverflowScrolling: 'touch',
          } as React.CSSProperties}
        >
          {/* 全部 — always visible */}
          <button
            onClick={() => setTab('all')}
            style={{
              ...tabBtnBase,
              background: tab === 'all' ? 'var(--brand-primary, #6c5ce7)' : 'rgba(255,255,255,0.08)',
              color:      tab === 'all' ? '#fff' : 'var(--text-muted, #aaa)',
            }}
          >
            全部{games !== null ? ` (${tabCounts['all'] ?? 0})` : ''}
          </button>

          {/* Category tabs — only those with > 0 games */}
          {availableTabs.map(cat => {
            const count = tabCounts[cat] ?? 0;
            if (count === 0) return null;
            const active = tab === cat;
            return (
              <button
                key={cat}
                onClick={() => setTab(cat)}
                style={{
                  ...tabBtnBase,
                  background: active ? 'var(--brand-primary, #6c5ce7)' : 'rgba(255,255,255,0.08)',
                  color:      active ? '#fff' : 'var(--text-muted, #aaa)',
                }}
              >
                {CATEGORY_LABELS[cat] ?? cat} ({count})
              </button>
            );
          })}
        </div>
        {/* Hide webkit scrollbar */}
        <style>{`.picker-tabs::-webkit-scrollbar{display:none}`}</style>

        {/* Game grid */}
        <div className="overflow-y-auto px-4 pb-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <svg className="w-8 h-8 animate-spin" style={{ color: 'var(--brand-primary)' }} fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="text-3xl mb-2">🎮</div>
              <p className="text-sm" style={{ color: 'var(--text-muted, #888)' }}>
                {search ? '未找到相关游戏' : '暂无游戏，请稍后再试'}
              </p>
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {filtered.map(game => (
                <button
                  key={game.game_code}
                  onClick={() => { if (!game.is_maintenance) onSelect(game.game_code, game.display_name); }}
                  disabled={game.is_maintenance || launching}
                  className="relative overflow-hidden rounded-xl text-left disabled:opacity-60"
                  style={{ aspectRatio: '3/4' }}
                >
                  {/* Official game image — falls back to 🎮 on error */}
                  <GameImage gameCode={game.game_code} displayName={game.display_name} />

                  {/* Bottom gradient for text legibility */}
                  <div
                    className="absolute inset-0"
                    style={{ background: 'linear-gradient(to top, rgba(10,11,20,0.92) 0%, transparent 55%)' }}
                  />

                  {/* Maintenance overlay */}
                  {game.is_maintenance && (
                    <div
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ background: 'rgba(0,0,0,0.55)' }}
                    >
                      <span className="text-xs font-semibold text-white">维护中</span>
                    </div>
                  )}

                  {/* Game name */}
                  <span
                    className="absolute bottom-0 inset-x-0 px-1.5 py-1.5 text-xs font-medium leading-tight text-center"
                    style={{ color: 'var(--text-base, #fff)' }}
                  >{game.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
