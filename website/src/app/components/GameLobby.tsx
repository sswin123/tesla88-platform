'use client';
import { useState, useEffect, useCallback } from 'react';
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

const TAB_TO_CATEGORY: Record<Exclude<TabKey, 'HOT'>, PublicGameProvider['category']> = {
  SLOT:    'slot',
  LIVE:    'live',
  SPORTS:  'sport',
  FISHING: 'fishing',
};

interface CardItem {
  key: string;
  provider_code: string;
  name: string;
  logoUrl: string | null;
  is_hot: boolean;
  is_new: boolean;
  is_maintenance: boolean;
  launch_mode: string;
}

function toCards(providers: PublicGameProvider[], tab: TabKey): CardItem[] {
  const filtered = tab === 'HOT'
    ? providers.filter(p => p.is_hot)
    : providers.filter(p => p.category === TAB_TO_CATEGORY[tab]);

  return filtered.map(p => ({
    key:            `p-${p.provider_code}`,
    provider_code:  p.provider_code,
    name:           p.provider_name,
    logoUrl:        p.logo_url ?? (p.logo_media_id ? `/api/public/media/${p.logo_media_id}` : null),
    is_hot:         p.is_hot,
    is_new:         p.is_new,
    is_maintenance: p.is_maintenance,
    launch_mode:    p.launch_mode,
  }));
}

export default function GameLobby() {
  const [tab, setTab]             = useState<TabKey>('HOT');
  const [providers, setProviders] = useState<PublicGameProvider[] | null>(null);
  const [launching, setLaunching] = useState<string | null>(null); // provider_code being launched
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn]   = useState(false);

  useEffect(() => {
    fetch('/api/public/game-providers')
      .then(r => r.ok ? r.json() as Promise<PublicGameProvider[]> : Promise.resolve([]))
      .then(data => setProviders(data))
      .catch(() => setProviders([]));

    // Check auth status once on mount to show correct CTA
    fetch('/api/auth/me')
      .then(r => { setIsLoggedIn(r.ok); setAuthChecked(true); })
      .catch(() => { setIsLoggedIn(false); setAuthChecked(true); });
  }, []);

  const handleLaunch = useCallback(async (card: CardItem) => {
    if (launching) return;

    if (card.is_maintenance) {
      alert(`${card.name} 正在维护中，请稍后再试`);
      return;
    }

    // If not logged in, redirect to login page
    if (authChecked && !isLoggedIn) {
      window.location.href = '/login';
      return;
    }

    setLaunching(card.provider_code);
    try {
      const res = await fetch('/api/public/games/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_code: card.provider_code }),
      });

      const data = await res.json() as {
        launch_url?: string; launch_mode?: string;
        error?: string; code?: string;
      };

      if (res.status === 401 || data.code === 'UNAUTHENTICATED') {
        window.location.href = '/login';
        return;
      }

      if (!res.ok || !data.launch_url) {
        alert(data.error ?? '启动失败，请稍后再试');
        return;
      }

      // Redirect player into H5 Lobby / game
      window.location.href = data.launch_url;
    } catch {
      alert('网络错误，请稍后再试');
    } finally {
      setLaunching(null);
    }
  }, [launching, authChecked, isLoggedIn]);

  const cards: CardItem[] = providers === null ? [] : toCards(providers, tab);

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

      {/* Empty state */}
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

      {/* Provider grid */}
      {providers !== null && cards.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-6 gap-1.5">
          {cards.map(card => {
            const isThisLaunching = launching === card.provider_code;
            return (
              <button
                key={card.key}
                onClick={() => void handleLaunch(card)}
                disabled={!!launching}
                className="casino-card casino-card-hover relative flex flex-col items-center justify-center gap-1 p-2 text-center transition-all duration-200 disabled:opacity-70 w-full"
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

                {/* Maintenance overlay */}
                {card.is_maintenance && (
                  <div
                    className="absolute inset-0 rounded-xl flex items-center justify-center z-10"
                    style={{ background: 'rgba(0,0,0,0.55)' }}
                  >
                    <span className="text-xs font-semibold text-white">维护中</span>
                  </div>
                )}

                {/* Loading spinner overlay */}
                {isThisLaunching && (
                  <div
                    className="absolute inset-0 rounded-xl flex items-center justify-center z-10"
                    style={{ background: 'rgba(0,0,0,0.45)' }}
                  >
                    <svg className="w-6 h-6 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  </div>
                )}

                {/* Logo or emoji */}
                {card.logoUrl ? (
                  <Image
                    src={card.logoUrl}
                    alt={card.name}
                    width={48}
                    height={48}
                    className="object-contain"
                    unoptimized
                  />
                ) : (
                  <span className="text-2xl">🎮</span>
                )}

                <span
                  className="text-xs font-semibold leading-tight"
                  style={{ color: 'var(--text-base)' }}
                >
                  {card.name}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
