'use client';
import { useState } from 'react';

interface Provider {
  name: string;
  emoji: string;
  hot?: boolean;
}

const PROVIDERS: Record<string, Provider[]> = {
  HOT: [
    { name: 'Mega888',        emoji: '🎰', hot: true },
    { name: '918Kiss',        emoji: '💎', hot: true },
    { name: 'JILI',           emoji: '⚡', hot: true },
    { name: 'Pragmatic Play', emoji: '🎲', hot: true },
    { name: 'Evo888',         emoji: '🃏', hot: true },
    { name: 'Playtech',       emoji: '🎮' },
  ],
  SLOT: [
    { name: 'Mega888',        emoji: '🎰', hot: true },
    { name: '918Kiss',        emoji: '💎' },
    { name: 'Pussy888',       emoji: '🐱' },
    { name: 'JILI',           emoji: '⚡' },
    { name: 'JDB',            emoji: '🐉' },
    { name: 'Pragmatic Play', emoji: '🎲' },
  ],
  LIVE: [
    { name: 'Playtech',       emoji: '🎮' },
    { name: 'Pragmatic Play', emoji: '🎲', hot: true },
    { name: 'Evo888',         emoji: '🃏', hot: true },
  ],
  SPORTS: [
    { name: 'Playtech',       emoji: '🎮' },
  ],
  FISHING: [
    { name: 'JILI',           emoji: '⚡', hot: true },
    { name: 'JDB',            emoji: '🐉' },
    { name: 'Mega888',        emoji: '🎰' },
  ],
};

const TABS = [
  { key: 'HOT',    label: '🔥 热门' },
  { key: 'SLOT',   label: '老虎机' },
  { key: 'LIVE',   label: '真人' },
  { key: 'SPORTS', label: '体育' },
  { key: 'FISHING',label: '捕鱼' },
];

export default function GameLobby() {
  const [tab, setTab] = useState<keyof typeof PROVIDERS>('HOT');
  const providers = PROVIDERS[tab];

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-base)' }}>
          游戏大厅
        </h2>
        <a href="/download" className="text-xs font-medium" style={{ color: 'var(--brand-primary)' }}>
          查看全部 →
        </a>
      </div>

      {/* Tab bar */}
      <div
        className="flex gap-1 mb-4 p-1 rounded-xl overflow-x-auto"
        style={{ background: 'var(--bg-surface2)' }}
      >
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as keyof typeof PROVIDERS)}
            className="shrink-0 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200"
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

      {/* Provider grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {providers.map(p => (
          <a
            key={p.name}
            href="/download"
            className="casino-card casino-card-hover relative flex flex-col items-center justify-center gap-2 p-4 text-center transition-all duration-200"
            style={{ textDecoration: 'none', minHeight: '100px' }}
          >
            {(p.hot || tab === 'HOT') && (
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
            <span className="text-3xl">{p.emoji}</span>
            <span
              className="text-xs font-semibold leading-tight"
              style={{ color: 'var(--text-base)' }}
            >
              {p.name}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
