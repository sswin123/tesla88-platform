'use client';
import { useState, useEffect } from 'react';

interface MegaH5Game {
  game_code:      string;
  display_name:   string;
  icon_url:       string | null;
  thumbnail_url:  string | null;
  is_maintenance: boolean;
}

interface Props {
  open:       boolean;
  launching:  boolean;
  onClose:    () => void;
  onSelect:   (gameCode: string) => void;
}

export function MegaH5GamePicker({ open, launching, onClose, onSelect }: Props) {
  const [games,   setGames]   = useState<MegaH5Game[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setGames(null);
    fetch('/api/public/games?provider=MEGAH5&limit=200')
      .then(r => r.ok ? r.json() as Promise<MegaH5Game[]> : Promise.resolve([]))
      .then(data => { setGames(data); setLoading(false); })
      .catch(() => { setGames([]); setLoading(false); });
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="选择游戏"
    >
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.80)' }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative w-full max-w-lg rounded-t-2xl sm:rounded-2xl flex flex-col"
        style={{ background: 'var(--bg-card, var(--bg-surface, #1a1b2e))', maxHeight: '80vh' }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-base, #fff)' }}>选择游戏</h3>
          <button
            onClick={onClose}
            className="text-lg leading-none px-1"
            style={{ color: 'var(--text-muted, #888)' }}
            aria-label="关闭"
          >✕</button>
        </div>

        <div className="overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <svg className="w-8 h-8 animate-spin" style={{ color: 'var(--brand-primary)' }} fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            </div>
          )}
          {!loading && games !== null && games.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="text-3xl mb-2">🎮</div>
              <p className="text-sm" style={{ color: 'var(--text-muted, #888)' }}>暂无游戏，请稍后再试</p>
            </div>
          )}
          {!loading && games && games.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {games.map(game => (
                <button
                  key={game.game_code}
                  onClick={() => { if (!game.is_maintenance) onSelect(game.game_code); }}
                  disabled={game.is_maintenance || launching}
                  className="relative overflow-hidden rounded-xl text-left disabled:opacity-60"
                  style={{ aspectRatio: '3/4' }}
                >
                  {(game.thumbnail_url ?? game.icon_url) ? (
                    <img
                      src={(game.thumbnail_url ?? game.icon_url)!}
                      alt={game.display_name}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="absolute inset-0 flex items-center justify-center text-2xl"
                      style={{ background: 'var(--bg-surface2)' }}
                    >🎮</div>
                  )}
                  <div
                    className="absolute inset-0"
                    style={{ background: 'linear-gradient(to top, rgba(10,11,20,0.92) 0%, transparent 55%)' }}
                  />
                  {game.is_maintenance && (
                    <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }}>
                      <span className="text-xs font-semibold text-white">维护中</span>
                    </div>
                  )}
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
