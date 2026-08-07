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

// ── GameImage ─────────────────────────────────────────────────────────
// Two-step icon lookup (exact → startsWith).
// Shimmer skeleton while loading; fade-in on load.
// 🎮 emoji immediately (no HTTP request) when no icon match.
const GameImage = memo(function GameImage({
  gameCode, displayName,
}: { gameCode: string; displayName: string }) {
  const stem          = resolveIconStem(gameCode);
  const [err, setErr] = useState(false);
  const [ok,  setOk]  = useState(false);

  useEffect(() => { setErr(false); setOk(false); }, [gameCode]);

  if (!stem || err) {
    return (
      <div className="gp-img-fallback" aria-label={displayName}>🎮</div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {!ok && <div className="gp-skeleton" aria-hidden="true" />}
      <img
        src={`/megah5/icons/${stem}.png`}
        alt={displayName}
        loading="lazy"
        decoding="async"
        fetchPriority="low"
        className={ok ? 'gp-img-visible' : 'gp-img-hidden'}
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
      className="gp-card"
      onClick={() => { if (!game.is_maintenance) onSelect(game.game_code, title); }}
      disabled={game.is_maintenance || launching}
      aria-label={game.is_maintenance ? `${title} — 维护中` : title}
    >
      {/* Image — 3:4 portrait, full image visible via object-contain */}
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: '3/4' }}>
        <GameImage gameCode={game.game_code} displayName={title} />
        {game.is_maintenance && (
          <div className="gp-maintenance-overlay">
            <span className="gp-maintenance-badge">维护中</span>
          </div>
        )}
      </div>

      {/* Game name below image — 2-line clamp, no overlay */}
      <div className="w-full px-1.5 py-2 flex items-center justify-center" style={{ minHeight: 40 }}>
        <span style={{
          color:           'var(--text-base)',
          fontSize:        12,
          fontWeight:      500,
          lineHeight:      '1.35',
          display:         '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow:        'hidden',
          textAlign:       'center',
          wordBreak:       'break-word',
        }}>{title}</span>
      </div>
    </button>
  );
});

// ── MegaH5GamePicker ─────────────────────────────────────────────────
export function MegaH5GamePicker({ open, launching, onClose, onSelect }: Props) {
  // ─ Dialog mount + animation ─
  const [mounted,  setMounted] = useState(false);
  const [visible,  setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Double-rAF so CSS transition fires after paint
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
  const [inputValue,      setInputValue]      = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(inputValue), 200);
    return () => clearTimeout(t);
  }, [inputValue]);

  // ─ Sticky shadow ─
  const gridRef          = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const handleGridScroll = useCallback(() => {
    setScrolled((gridRef.current?.scrollTop ?? 0) > 4);
  }, []);

  // ─ Category tab auto-scroll ─
  const tabRefs   = useRef<Map<string, HTMLButtonElement>>(new Map());
  const setTabRef = useCallback((key: string, el: HTMLButtonElement | null) => {
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
    if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, []);

  const handleSelect = useCallback((code: string, name: string) => {
    onSelect(code, name);
  }, [onSelect]);

  if (!mounted) return null;

  const vis = visible ? '1' : '0';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="选择游戏"
    >
      {/* Backdrop */}
      <div
        className="gp-backdrop absolute inset-0"
        data-vis={vis}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog — all visual styling via gp-modal CSS class */}
      <div
        className="gp-modal relative w-full sm:max-w-2xl flex flex-col"
        data-vis={vis}
        style={{ maxHeight: '80vh' }}
      >
        {/* ── Header ── */}
        <div className="gp-header flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-base)' }}>
            选择游戏
            {games !== null && (
              <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
                {filtered.length} 款
              </span>
            )}
          </h3>
          <button
            onClick={onClose}
            className="gp-close-btn flex items-center justify-center w-8 h-8"
            aria-label="关闭游戏选择器"
          >✕</button>
        </div>

        {/* ── Sticky search + category block ── */}
        <div className={`flex-shrink-0 ${scrolled ? 'gp-sticky-shadow' : 'gp-sticky-noshadow'}`}>
          {/* Search */}
          <div className="px-4 pt-3 pb-2">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                style={{ color: 'var(--text-muted)' }}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                placeholder="搜索游戏…"
                className="gp-search"
                aria-label="搜索游戏"
              />
            </div>
          </div>

          {/* Category tabs */}
          <div
            className="gp-tabs px-4 pb-3"
            style={{
              display:                 'flex',
              gap:                     8,
              overflowX:               'auto',
              scrollbarWidth:          'none',
              WebkitOverflowScrolling: 'touch',
            } as React.CSSProperties}
          >
            <button
              ref={el => setTabRef('all', el)}
              onClick={() => handleTabChange('all')}
              className={`gp-tab${tab === 'all' ? ' gp-tab-active' : ''}`}
              aria-label="全部游戏"
              aria-pressed={tab === 'all'}
            >
              全部{games !== null ? ` (${tabCounts['all'] ?? 0})` : ''}
            </button>

            {availableTabs.map(cat => {
              const count  = tabCounts[cat] ?? 0;
              if (count === 0) return null;
              const active = tab === cat;
              return (
                <button
                  key={cat}
                  ref={el => setTabRef(cat, el)}
                  onClick={() => handleTabChange(cat)}
                  className={`gp-tab${active ? ' gp-tab-active' : ''}`}
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
          className="flex-1 overflow-y-auto px-4 pb-4 pt-1 min-h-0"
          onScroll={handleGridScroll}
        >
          {loading && (
            <div className="flex items-center justify-center py-16">
              <svg
                className="w-9 h-9 animate-spin"
                style={{ color: 'var(--brand-primary)' }}
                fill="none" viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
              <div className="text-4xl">🎮</div>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
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
  );
}
