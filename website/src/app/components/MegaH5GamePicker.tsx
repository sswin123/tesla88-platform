'use client';
import {
  useState, useEffect, useMemo, useCallback, useRef, memo,
} from 'react';
import { resolveIconStem, formatGameDisplayName } from '@/lib/megah5-icon-index';

// ── Types ─────────────────────────────────────────────────────────────
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

// Category labels — English, matching official MegaH5 lobby style
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
const CATEGORY_ORDER = ['slot', 'multiplier', 'fish_arcade', 'fishing', 'arcade', 'table', 'live', 'other'];

// ── Picker-scoped CSS (animations, skeletons, scrollbar hiding) ───────
const PICKER_CSS = `
  @keyframes mh5-shimmer {
    0%   { background-position: -200% 0; }
    100% { background-position:  200% 0; }
  }
  /* Shimmer skeleton */
  .mh5-skeleton {
    background: linear-gradient(
      90deg,
      rgba(255,255,255,0.04) 25%,
      rgba(255,255,255,0.09) 50%,
      rgba(255,255,255,0.04) 75%
    );
    background-size: 200% 100%;
    animation: mh5-shimmer 1.5s ease infinite;
    border-radius: 12px 12px 0 0;
  }
  /* Card hover/press */
  .mh5-card {
    transition: transform 200ms ease, box-shadow 200ms ease;
    will-change: transform;
  }
  @media (hover: hover) {
    .mh5-card:hover:not(:disabled) {
      transform: translateY(-4px) scale(1.02);
      box-shadow: 0 10px 28px rgba(0,0,0,0.50) !important;
    }
  }
  .mh5-card:active:not(:disabled) {
    transform: scale(0.97);
    transition-duration: 100ms;
    box-shadow: 0 2px 8px rgba(0,0,0,0.30) !important;
  }
  /* Category tab scrollbar */
  .mh5-tabs::-webkit-scrollbar { display: none; }
  /* Dialog open/close animation */
  .mh5-backdrop {
    transition: opacity 180ms ease;
  }
  .mh5-backdrop[data-vis="0"] { opacity: 0; pointer-events: none; }
  .mh5-backdrop[data-vis="1"] { opacity: 1; }
  .mh5-dialog {
    transition: opacity 180ms ease, transform 180ms ease;
  }
  .mh5-dialog[data-vis="0"] { opacity: 0; transform: translateY(24px) scale(0.96); }
  .mh5-dialog[data-vis="1"] { opacity: 1; transform: translateY(0)    scale(1); }
  @media (min-width: 640px) {
    .mh5-dialog[data-vis="0"] { transform: scale(0.95); }
    .mh5-dialog[data-vis="1"] { transform: scale(1); }
  }
  /* Sticky header shadow */
  .mh5-sticky-shadow {
    box-shadow: 0 6px 18px rgba(0,0,0,0.40);
    transition: box-shadow 200ms ease;
  }
  .mh5-sticky-noshadow {
    box-shadow: none;
    transition: box-shadow 200ms ease;
  }
  /* Image fade in */
  .mh5-img-hidden { opacity: 0; }
  .mh5-img-visible {
    opacity: 1;
    transition: opacity 180ms ease;
  }
`;

// ── GameImage ─────────────────────────────────────────────────────────
// Two-step icon lookup (exact → startsWith).
// Shows shimmer skeleton while loading; fades in on load.
// Shows 🎮 immediately (no HTTP request) if no icon match.
const GameImage = memo(function GameImage({
  gameCode, displayName,
}: { gameCode: string; displayName: string }) {
  const stem            = resolveIconStem(gameCode);
  const [err, setErr]   = useState(false);
  const [ok,  setOk]    = useState(false);

  // Reset when game changes (e.g., virtual list reuse)
  useEffect(() => { setErr(false); setOk(false); }, [gameCode]);

  if (!stem || err) {
    return (
      <div
        className="w-full h-full flex items-center justify-center text-4xl select-none"
        style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px 12px 0 0' }}
        aria-label={displayName}
      >🎮</div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {/* Skeleton — shown until image is loaded */}
      {!ok && <div className="mh5-skeleton absolute inset-0" aria-hidden="true" />}
      <img
        src={`/megah5/icons/${stem}.png`}
        alt={displayName}
        loading="lazy"
        decoding="async"
        fetchPriority="low"
        className={`absolute inset-0 w-full h-full ${ok ? 'mh5-img-visible' : 'mh5-img-hidden'}`}
        style={{ objectFit: 'contain' }}
        onLoad={() => setOk(true)}
        onError={() => setErr(true)}
      />
    </div>
  );
});

// ── GameCard ──────────────────────────────────────────────────────────
const GameCard = memo(function GameCard({
  game, launching, onSelect,
}: {
  game:      MegaH5Game;
  launching: boolean;
  onSelect:  (code: string, name: string) => void;
}) {
  const title = formatGameDisplayName(game.display_name || game.game_code);

  return (
    <button
      className="mh5-card flex flex-col overflow-hidden disabled:opacity-50 text-left w-full"
      style={{
        background:   'var(--bg-surface2, #1e2035)',
        borderRadius: 12,
        boxShadow:    '0 4px 14px rgba(0,0,0,0.32)',
      }}
      onClick={() => { if (!game.is_maintenance) onSelect(game.game_code, title); }}
      disabled={game.is_maintenance || launching}
      aria-label={game.is_maintenance ? `${title} — 维护中` : title}
    >
      {/* Image — 3:4 portrait, full image visible via object-contain */}
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: '3/4', borderRadius: '12px 12px 0 0' }}>
        <GameImage gameCode={game.game_code} displayName={title} />
        {game.is_maintenance && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.62)' }}>
            <span className="text-xs font-semibold text-white px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(220,40,40,0.82)' }}>维护中</span>
          </div>
        )}
      </div>

      {/* Name below image — 2-line max, no overlay */}
      <div className="w-full px-1.5 py-2 text-center"
           style={{ minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{
          color:             'var(--text-base, #e8e8f0)',
          fontSize:          12,
          fontWeight:        500,
          lineHeight:        '1.35',
          display:           '-webkit-box',
          WebkitLineClamp:   2,
          WebkitBoxOrient:   'vertical',
          overflow:          'hidden',
          textAlign:         'center',
          wordBreak:         'break-word',
        }}>{title}</span>
      </div>
    </button>
  );
});

// ── MegaH5GamePicker ─────────────────────────────────────────────────
export function MegaH5GamePicker({ open, launching, onClose, onSelect }: Props) {
  // ─ Dialog mount + animation ─
  const [mounted,  setMounted]  = useState(false);
  const [visible,  setVisible]  = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Double-rAF so transition triggers after paint
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      return () => cancelAnimationFrame(id);
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  // ─ Data ─
  const [games,   setGames]   = useState<MegaH5Game[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab,     setTab]     = useState<string>('all');

  // ─ Search debounce (200ms) ─
  const [inputValue,     setInputValue]     = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(inputValue), 200);
    return () => clearTimeout(t);
  }, [inputValue]);

  // ─ Sticky shadow state ─
  const gridRef         = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const handleGridScroll = useCallback(() => {
    setScrolled((gridRef.current?.scrollTop ?? 0) > 4);
  }, []);

  // ─ Category tab refs (for auto-scroll) ─
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const tabRefs          = useRef<Map<string, HTMLButtonElement>>(new Map());
  const setTabRef        = useCallback((key: string, el: HTMLButtonElement | null) => {
    if (el) tabRefs.current.set(key, el);
    else    tabRefs.current.delete(key);
  }, []);

  // Load games when picker opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setGames(null);
    setTab('all');
    setInputValue('');
    setDebouncedSearch('');
    setScrolled(false);
    fetch('/api/public/games?provider=MEGAH5&limit=200')
      .then(r => r.ok ? r.json() as Promise<MegaH5Game[]> : Promise.resolve([]))
      .then(data => { setGames(data); setLoading(false); })
      .catch(() => { setGames([]); setLoading(false); });
  }, [open]);

  // Keyboard: Esc closes
  useEffect(() => {
    if (!mounted) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [mounted, onClose]);

  // ─ Derived data ─
  const tabCounts = useMemo(() => {
    if (!games) return {} as Record<string, number>;
    const counts: Record<string, number> = { all: games.length };
    for (const g of games) {
      const c = g.category ?? 'other';
      counts[c] = (counts[c] ?? 0) + 1;
    }
    return counts;
  }, [games]);

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
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase();
      list = list.filter(g => {
        const title = formatGameDisplayName(g.display_name || g.game_code).toLowerCase();
        return title.includes(q) || g.game_code.toLowerCase().includes(q);
      });
    }
    return list;
  }, [games, tab, debouncedSearch]);

  // ─ Tab change with auto-scroll ─
  const handleTabChange = useCallback((key: string) => {
    setTab(key);
    const el = tabRefs.current.get(key);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, []);

  // ─ onSelect (stable ref to avoid GameCard re-renders) ─
  const handleSelect = useCallback((code: string, name: string) => {
    onSelect(code, name);
  }, [onSelect]);

  if (!mounted) return null;

  const vis = visible ? '1' : '0';

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
    <>
      <style>{PICKER_CSS}</style>

      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
        role="dialog"
        aria-modal="true"
        aria-label="选择游戏"
      >
        {/* Backdrop */}
        <div
          className="mh5-backdrop absolute inset-0"
          data-vis={vis}
          style={{ background: 'rgba(0,0,0,0.82)' }}
          onClick={onClose}
          aria-hidden="true"
        />

        {/* Dialog */}
        <div
          className="mh5-dialog relative w-full sm:max-w-2xl flex flex-col rounded-t-2xl sm:rounded-2xl"
          data-vis={vis}
          style={{
            background: 'var(--bg-surface, #14152a)',
            maxHeight:  '80vh',
          }}
        >
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0"
               style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
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
              aria-label="关闭游戏选择器"
            >✕</button>
          </div>

          {/* ── Sticky search + category block ── */}
          <div className={`flex-shrink-0 ${scrolled ? 'mh5-sticky-shadow' : 'mh5-sticky-noshadow'}`}>
            {/* Search */}
            <div className="px-4 pt-3 pb-2">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                     style={{ color: 'var(--text-muted, #666)' }}
                     fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                </svg>
                <input
                  type="text"
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  placeholder="搜索游戏…"
                  className="w-full rounded-xl text-sm pl-9 pr-4 py-2.5 outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.07)',
                    color:      'var(--text-base, #fff)',
                    border:     '1px solid rgba(255,255,255,0.09)',
                  }}
                  aria-label="搜索游戏"
                />
              </div>
            </div>

            {/* Category Tabs */}
            <div
              ref={tabsContainerRef}
              className="mh5-tabs flex-shrink-0 px-4 pb-3"
              style={{
                display:                 'flex',
                gap:                     8,
                overflowX:               'auto',
                scrollbarWidth:          'none',
                WebkitOverflowScrolling: 'touch',
              } as React.CSSProperties}
            >
              {/* All tab */}
              <button
                ref={el => setTabRef('all', el)}
                onClick={() => handleTabChange('all')}
                style={{
                  ...tabBase,
                  background: tab === 'all' ? 'var(--brand-primary, #6c5ce7)' : 'rgba(255,255,255,0.08)',
                  color:      tab === 'all' ? '#fff' : 'var(--text-muted, #aaa)',
                }}
                aria-label="全部游戏"
                aria-pressed={tab === 'all'}
              >
                全部{games !== null ? ` (${tabCounts['all'] ?? 0})` : ''}
              </button>

              {/* Dynamic category tabs — hidden if count=0 */}
              {availableTabs.map(cat => {
                const count  = tabCounts[cat] ?? 0;
                if (count === 0) return null;
                const active = tab === cat;
                return (
                  <button
                    key={cat}
                    ref={el => setTabRef(cat, el)}
                    onClick={() => handleTabChange(cat)}
                    style={{
                      ...tabBase,
                      background: active ? 'var(--brand-primary, #6c5ce7)' : 'rgba(255,255,255,0.08)',
                      color:      active ? '#fff' : 'var(--text-muted, #aaa)',
                    }}
                    aria-label={`${CATEGORY_LABELS[cat] ?? cat} ${count}款`}
                    aria-pressed={active}
                  >
                    {CATEGORY_LABELS[cat] ?? cat} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Game Grid (only this scrolls) ── */}
          <div
            ref={gridRef}
            className="flex-1 overflow-y-auto px-4 pb-4 min-h-0"
            onScroll={handleGridScroll}
          >
            {loading && (
              <div className="flex items-center justify-center py-16">
                <svg className="w-9 h-9 animate-spin" style={{ color: 'var(--brand-primary, #6c5ce7)' }}
                     fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              </div>
            )}

            {!loading && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
                <div className="text-4xl">🎮</div>
                <p className="text-sm" style={{ color: 'var(--text-muted, #888)' }}>
                  {debouncedSearch ? `未找到「${debouncedSearch}」` : '暂无游戏，请稍后再试'}
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
                    onSelect={handleSelect}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
