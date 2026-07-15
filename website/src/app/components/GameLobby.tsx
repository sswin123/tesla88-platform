'use client';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import type { PublicGameProvider } from '@/app/api/public/game-providers/route';


const TABS = [
  { key: 'HOT',     label: '🔥 热门' },
  { key: 'SLOT',    label: '老虎机' },
  { key: 'LIVE',    label: '真人' },
  { key: 'SPORTS',  label: '体育' },
  { key: 'FISHING', label: '捕鱼' },
] as const;

type TabKey = typeof TABS[number]['key'];

/* Maps tab key → DB category value */
const TAB_TO_CATEGORY: Record<Exclude<TabKey, 'HOT'>, PublicGameProvider['category']> = {
  SLOT:    'slot',
  LIVE:    'live',
  SPORTS:  'sport',
  FISHING: 'fishing',
};

/* ── Unified card shape for both ERP and fallback ── */
interface CardItem {
  key: string;
  name: string;
  emoji: string | null;
  logoUrl: string | null;
  is_hot: boolean;
  is_new: boolean;
}

function toCards(providers: PublicGameProvider[], tab: TabKey): CardItem[] {
  const filtered = tab === 'HOT'
    ? providers.filter(p => p.is_hot)
    : providers.filter(p => p.category === TAB_TO_CATEGORY[tab]);

  return filtered.map(p => ({
    key:     `erp-${p.id}`,
    name:    p.provider_name,
    emoji:   null,
    logoUrl: p.logo_media_id ? `/api/public/media/${p.logo_media_id}` : null,
    is_hot:  p.is_hot,
    is_new:  p.is_new,
  }));
}


export default function GameLobby() {
  const [tab, setTab]             = useState<TabKey>('HOT');
  const [providers, setProviders] = useState<PublicGameProvider[] | null>(null);

  useEffect(() => {
    fetch('/api/public/game-providers')
      .then(r => r.ok ? r.json() as Promise<PublicGameProvider[]> : Promise.resolve([]))
      .then(data => setProviders(data))
      .catch(() => setProviders([]));
  }, []);

  const cards: CardItem[] = providers === null
    ? []  /* loading — show nothing */
    : toCards(providers, tab);

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-base)' }}>
          游戏大厅
        </h2>
        <a href="/download" className="text-xs font-medium" style={{ color: 'var(--brand-primary)' }}>
          查看全部 →
        </a>
      </div>

      {/* Tab bar */}
      <div
        className="flex gap-1 mb-2 p-1 rounded-xl overflow-x-auto"
        style={{ background: 'var(--bg-surface2)' }}
      >
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="shrink-0 px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200"
            style={
              tab === t.key
                ? {
                    background: 'var(--brand-primary)',
                    color: '#fff',
                    boxShadow: '0 0 10px color-mix(in srgb, var(--brand-primary) 40%, transparent)',
                  }
                : { color: 'var(--text-muted)', background: 'transparent' }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Loading skeleton */}
      {providers === null && (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-6 gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl animate-pulse"
              style={{ minHeight: '72px', background: 'var(--bg-surface2)' }}
            />
          ))}
        </div>
      )}

      {/* Provider grid */}
      {providers !== null && cards.length === 0 && (
        <div
          className="flex flex-col items-center justify-center py-12 rounded-2xl"
          style={{ background: 'var(--bg-surface2)' }}
        >
          <div className="text-4xl mb-3">🎮</div>
          <p className="text-base font-semibold mb-1" style={{ color: 'var(--text-base)' }}>
            Coming Soon
          </p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            暂无游戏，敬请期待
          </p>
        </div>
      )}
      {providers !== null && cards.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-6 gap-1.5">
          {cards.map(card => (
            <a
              key={card.key}
              href="/download"
              className="casino-card casino-card-hover relative flex flex-col items-center justify-center gap-1 p-2 text-center transition-all duration-200"
              style={{ textDecoration: 'none', minHeight: '72px' }}
            >
              {/* HOT badge */}
              {card.is_hot && (
                <span
                  className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-xs font-bold leading-none"
                  style={{
                    background: 'var(--brand-primary)',
                    color: '#fff',
                    boxShadow: '0 0 6px color-mix(in srgb, var(--brand-primary) 50%, transparent)',
                  }}
                >
                  HOT
                </span>
              )}
              {/* NEW badge */}
              {card.is_new && !card.is_hot && (
                <span
                  className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-xs font-bold leading-none"
                  style={{ background: 'var(--brand-primary)', color: '#fff' }}
                >
                  NEW
                </span>
              )}

              {/* Logo or emoji */}
              {card.logoUrl ? (
                <Image
                  src={card.logoUrl}
                  alt={card.name}
                  width={48}
                  height={48}
                  className="object-contain"
                />
              ) : (
                <span className="text-2xl">{card.emoji ?? '🎮'}</span>
              )}

              <span
                className="text-xs font-semibold leading-tight"
                style={{ color: 'var(--text-base)' }}
              >
                {card.name}
              </span>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
