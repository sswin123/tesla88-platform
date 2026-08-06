'use client';
import { useState, useEffect, useMemo } from 'react';
import { resolveIconStem, formatGameDisplayName } from '@/lib/megah5-icon-index';

interface MegaH5Game {
  game_code:      string;
  display_name:   string;
  icon_url:       string | null;
  thumbnail_url:  string | null;
  category:       string | null;
  is_maintenance: boolean;
}

interface Props {
  open:      boolean;
  launching: boolean;
  onClose:   () => void;
  onSelect:  (gameCode: string, displayName: string) => void;
}

// Category display labels (English, matching official MegaH5 lobby style)
const CATEGORY_LABELS: Record<string, string> = {
  slot:        'Slot',
  multiplier:  'Multiplier',
  fish_arcade: 'Fish Arcade',
  fishing:     'Fishing',
  arcade:      'Arcade',
  table:       'Table',
  live:        'Live',
  other:       'Others',
};

// Preferred tab order — only tabs with count > 0 are shown
const CATEGORY_ORDER = ['slot', 'multiplier', 'fish_arcade', 'fishing', 'arcade', 'table', 'live', 'other'];

// ── GameImage ──────────────────────────────────────────────────────────
// Resolves game_code → official icon via two-step index lookup (exact → startsWith).
// Shows 🎮 immediately when no icon found — no 404 request, no broken image.
function GameImage({ gameCode, displayName }: { gameCode: string; displayName: string }) {
  const stem = resolveIconStem(gameCode);
  const [err, setErr] = useState(false);

  if (!stem || err) {
    return (
      <div
        className="w-full h-full flex items-center justify-center text-4xl select-none"
        style={{ background: 'rgba(255,255,255,0.04)' }}
        aria-label={displayName}
      >🎮</div>
    );
  }

  return (
    <img
      src={`/megah5/icons/${stem}.png`}
      alt={displayName}
      loading="lazy"
      decoding="async"
      fetchPriority="low"
      className="w-full h-full"
      style={{ objectFit: 'contain' }}
      onError={() => setErr(true)}
    />
  );
}

// ── GameCard ───────────────────────────────────────────────────────────
function GameCard({
  game,
  launching,
  onSelect,
}: {
  game:      MegaH5Game;
  launching: boolean;
  onSelect:  (code: string, name: string) => void;
}) {
  const title = formatGameDisplayName(game.display_name || game.game_code);

  return (
    <button
      onClick={() => { if (!game.is_maintenance) onSelect(game.game_code, title); }}
      disabled={game.is_maintenance || launching}
      className="flex flex-col overflow-hidden disabled:opacity-50 text-left w-full"
      style={{
        background:   'var(--bg-surface2, #1e2035)',
        borderRadius: 12,
        boxShadow:    '0 2px 8px rgba(0,0,0,0.30)',
        transition:   'transform 0.12s, box-shadow 0.12s',
      }}
      onMouseEnter={e => {
        if (!game.is_maintenance && !launching) {
          (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
          (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 16px rgba(0,0,0,0.45)';
        }
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.transform = '';
        (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.30)';
      }}
    >
      {/* Image area — 3:4 portrait ratio, object-contain = full image visible */}
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: '3/4', borderRadius: '12px 12px 0 0' }}>
        <div className="absolute inset-0" style={{ background: 'var(--bg-surface2, #1e2035)' }}>
          <GameImage gameCode={game.game_code} displayName={title} />
        </div>
        {game.is_maintenance && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.60)' }}>
            <span className="text-xs font-semibold text-white px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(255,80,80,0.80)' }}>
              维护中
            </span>
          </div>
        )}
      </div>

      {/* Game name — below image, not overlay */}
      <div className="w-full px-1.5 py-2 text-center">
        <span
          className="text-xs font-medium leading-tight"
          style={{
            color:        'var(--text-base, #e8e8f0)',
            display:      'block',
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            whiteSpace:   'nowrap',
          }}
        >{title}</span>
      </div>
    </button>
  );
}

// ── MegaH5GamePicker ───────────────────────────────────────────────────
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

  // Count per category from actual game data
  const tabCounts = useMemo(() => {
    if (!games) return {} as Record<string, number>;
    const counts: Record<string, number> = { all: games.length };
    for (const g of games) {
      const c = g.category ?? 'other';
      counts[c] = (counts[c] ?? 0) + 1;
    }
    return counts;
  }, [games]);

  // Available tabs: derived from actual games, sorted by CATEGORY_ORDER, hide if count=0
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
      list = list.filter(g => {
        const title = formatGameDisplayName(g.display_name || g.game_code).toLowerCase();
        return title.includes(q) || g.game_code.toLowerCase().includes(q);
      });
    }
    return list;
  }, [games, tab, search]);

  if (!open) return null;

  // Tab button base style
  const tabBase: React.CSSProperties = {
    flexShrink:   0,
    whiteSpace:   'nowrap',
    minWidth:     90,
    height:       42,
    padding:      '0 18px',
    borderRadius: 12,
    fontSize:     14,
    fontWeight:   600,
    border:       'none',
    cursor:       'pointer',
    transition:   'background 0.15s, color 0.15s',
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
        style={{ background: 'rgba(0,0,0,0.82)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog — fixed 80vh, flex-col so only grid scrolls */}
      <div
        className="relative w-full sm:max-w-2xl flex flex-col rounded-t-2xl sm:rounded-2xl"
        style={{
          background: 'var(--bg-surface, #14152a)',
          maxHeight:  '80vh',
        }}
      >
        {/* ── Header ── */}
        <div
          className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
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
            className="flex items-center justify-center w-8 h-8 rounded-full text-sm"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted, #aaa)' }}
            aria-label="关闭"
          >✕</button>
        </div>

        {/* ── Search (sticky) ── */}
        <div className="px-4 pt-3 pb-2 flex-shrink-0">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: 'var(--text-muted, #666)' }}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索游戏…"
              className="w-full rounded-xl text-sm pl-9 pr-4 py-2.5 outline-none"
              style={{
                background: 'rgba(255,255,255,0.07)',
                color:      'var(--text-base, #fff)',
                border:     '1px solid rgba(255,255,255,0.09)',
              }}
            />
          </div>
        </div>

        {/* ── Category Tabs (sticky, horizontal scroll, no scrollbar) ── */}
        <style>{`
          .mh5-tabs::-webkit-scrollbar { display: none; }
        `}</style>
        <div
          className="mh5-tabs flex-shrink-0 px-4 pb-3"
          style={{
            display:                 'flex',
            gap:                     8,
            overflowX:               'auto',
            scrollbarWidth:          'none',
            WebkitOverflowScrolling: 'touch',
          } as React.CSSProperties}
        >
          {/* All */}
          <button
            onClick={() => setTab('all')}
            style={{
              ...tabBase,
              background: tab === 'all' ? 'var(--brand-primary, #6c5ce7)' : 'rgba(255,255,255,0.08)',
              color:      tab === 'all' ? '#fff' : 'var(--text-muted, #aaa)',
            }}
          >
            全部{games !== null ? ` (${tabCounts['all'] ?? 0})` : ''}
          </button>

          {/* Dynamic category tabs — only if count > 0 */}
          {availableTabs.map(cat => {
            const count  = tabCounts[cat] ?? 0;
            if (count === 0) return null;
            const active = tab === cat;
            return (
              <button
                key={cat}
                onClick={() => setTab(cat)}
                style={{
                  ...tabBase,
                  background: active ? 'var(--brand-primary, #6c5ce7)' : 'rgba(255,255,255,0.08)',
                  color:      active ? '#fff' : 'var(--text-muted, #aaa)',
                }}
              >
                {CATEGORY_LABELS[cat] ?? cat} ({count})
              </button>
            );
          })}
        </div>

        {/* ── Game Grid (only this section scrolls) ── */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <svg className="w-9 h-9 animate-spin" style={{ color: 'var(--brand-primary, #6c5ce7)' }} fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
              <div className="text-4xl">🎮</div>
              <p className="text-sm" style={{ color: 'var(--text-muted, #888)' }}>
                {search ? `未找到「${search}」相关游戏` : '暂无游戏，请稍后再试'}
              </p>
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3.5">
              {filtered.map(game => (
                <GameCard
                  key={game.game_code}
                  game={game}
                  launching={launching}
                  onSelect={onSelect}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
