'use client';
import { useState, useEffect, useCallback } from 'react';
import type { PublicGameProvider } from '@/app/api/public/game-providers/route';
import { MegaAppDialog } from './MegaAppDialog';
import { MegaH5GamePicker } from './MegaH5GamePicker';

interface MegaAppDialogState {
  loginId:            string | null;  // null while loading
  password:           string | null;  // null while loading
  launchUrl:          string | null;  // null while loading
  downloadUrlAndroid: string | null;
  downloadUrlIos:     string | null;
}

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
  bannerUrl: string | null;
  is_hot: boolean;
  is_new: boolean;
  is_maintenance: boolean;
  launch_mode: string;
}

function proxied(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return `/api/public/image-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

function toCards(providers: PublicGameProvider[], tab: TabKey): CardItem[] {
  const filtered = tab === 'HOT'
    ? providers.filter(p => p.is_hot)
    : providers.filter(p => p.category === TAB_TO_CATEGORY[tab]);

  return filtered.map(p => ({
    key:            `p-${p.provider_code}`,
    provider_code:  p.provider_code,
    name:           p.provider_name,
    logoUrl:        proxied(p.logo_url) ?? (p.logo_media_id ? `/api/public/media/${p.logo_media_id}` : null),
    bannerUrl:      proxied(p.banner_url) ?? (p.banner_media_id ? `/api/public/media/${p.banner_media_id}` : null),
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
  const [authChecked, setAuthChecked]   = useState(false);
  const [isLoggedIn, setIsLoggedIn]     = useState(false);
  const [megaAppDialog,    setMegaAppDialog]    = useState<MegaAppDialogState | null>(null);
  const [megaAppError,     setMegaAppError]     = useState<string | null>(null);
  const [megaH5PickerOpen, setMegaH5PickerOpen] = useState(false);
  const [megaH5Ready,      setMegaH5Ready]      = useState<{ name: string; url: string } | null>(null);

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

    // MEGAH5: show game picker — player selects a specific game, then we launch with game_code.
    // No apiLobby; CallGame is the only supported launch method.
    if (card.provider_code === 'MEGAH5') {
      setMegaH5PickerOpen(true);
      return;
    }

    setLaunching(card.provider_code);

    // For MEGA888: open dialog immediately with loading state so the user sees
    // instant feedback while the server processes the launch request.
    if (card.provider_code === 'MEGAAPP') {
      setMegaAppDialog({ loginId: null, password: null, launchUrl: null, downloadUrlAndroid: null, downloadUrlIos: null });
    }

    try {
      const res = await fetch('/api/public/games/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_code: card.provider_code }),
      });

      const data = await res.json() as {
        launch_url?: string; launch_mode?: string;
        session_token?: string | null;
        error?: string; code?: string;
      };

      if (res.status === 401 || data.code === 'UNAUTHENTICATED') {
        setMegaAppDialog(null);
        window.location.href = '/login';
        return;
      }

      if (!res.ok || !data.launch_url) {
        if (card.provider_code === 'MEGAAPP') {
          setMegaAppDialog(null);
          setMegaAppError(data.error ?? 'Unable to launch MEGA888. Please try again later.');
        } else {
          alert(data.error ?? '启动失败，请稍后再试');
        }
        return;
      }

      // MEGA888 App: populate credential dialog instead of navigating.
      // Detection is by provider_code, not launch_mode, because the DB schema only
      // supports LOBBY/DIRECT and ERP returns launch_mode='LOBBY' for MEGAAPP.
      if (card.provider_code === 'MEGAAPP') {
        let loginId = '';
        let password = '';
        let downloadUrlAndroid: string | null = null;
        let downloadUrlIos: string | null = null;

        // Primary: parse session_token JSON
        if (data.session_token) {
          try {
            const tok = JSON.parse(data.session_token) as Record<string, unknown>;
            loginId            = String(tok['login_id']             ?? '');
            password           = String(tok['password']             ?? '');
            downloadUrlAndroid = tok['download_url_android'] ? String(tok['download_url_android']) : null;
            downloadUrlIos     = tok['download_url_ios']     ? String(tok['download_url_ios'])     : null;
          } catch { /* fall through to URL parse */ }
        }

        // Fallback: parse loginId + password from deeplink URL params
        if ((!loginId || !password) && data.launch_url) {
          try {
            const qs = data.launch_url.replace(/^[^?]*\?/, '');
            const p  = new URLSearchParams(qs);
            loginId  = p.get('account')  ?? '';
            password = p.get('password') ?? '';
          } catch { /* ignore */ }
        }

        if (loginId && password) {
          // Update the already-open dialog with real credentials
          setMegaAppDialog({
            loginId,
            password,
            launchUrl:          data.launch_url ?? '',
            downloadUrlAndroid,
            downloadUrlIos,
          });
        } else {
          setMegaAppDialog(null);
          setMegaAppError('Unable to parse MEGA888 credentials. Please try again later.');
        }
        return;
      }

      // Default: redirect into H5 Lobby / game
      window.location.href = data.launch_url;
    } catch {
      if (card.provider_code === 'MEGAAPP') {
        setMegaAppDialog(null);
        setMegaAppError('Unable to launch MEGA888. Please try again later.');
      } else {
        alert('网络错误，请稍后再试');
      }
    } finally {
      setLaunching(null);
    }
  }, [launching, authChecked, isLoggedIn]);

  // Fetch the launch URL in the background, then surface a "Masuk Game" dialog.
  // window.open is intentionally NOT called here — it is called synchronously
  // inside the dialog button's onClick, which is a fresh user-gesture and is
  // therefore never blocked by the browser's popup policy.
  const handleMegaH5GameLaunch = useCallback(async (gameCode: string, displayName: string) => {
    setMegaH5PickerOpen(false);
    setLaunching('MEGAH5');
    try {
      const res = await fetch('/api/public/games/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_code: 'MEGAH5', game_code: gameCode }),
      });
      const data = await res.json() as { launch_url?: string; error?: string; code?: string };
      if (res.status === 401 || data.code === 'UNAUTHENTICATED') {
        window.location.href = '/login';
        return;
      }
      if (!res.ok || !data.launch_url) {
        alert(data.error ?? '启动失败，请稍后再试');
        return;
      }
      setMegaH5Ready({ name: displayName, url: data.launch_url });
    } catch {
      alert('网络错误，请稍后再试');
    } finally {
      setLaunching(null);
    }
  }, []);

  const cards: CardItem[] = providers === null ? [] : toCards(providers, tab);

  return (
    <>
    {megaAppDialog && (
      <MegaAppDialog
        loginId={megaAppDialog.loginId}
        password={megaAppDialog.password}
        launchUrl={megaAppDialog.launchUrl}
        downloadUrlAndroid={megaAppDialog.downloadUrlAndroid}
        downloadUrlIos={megaAppDialog.downloadUrlIos}
        onClose={() => setMegaAppDialog(null)}
      />
    )}
    <MegaH5GamePicker
      open={megaH5PickerOpen}
      launching={!!launching}
      onClose={() => setMegaH5PickerOpen(false)}
      onSelect={(gameCode, displayName) => void handleMegaH5GameLaunch(gameCode, displayName)}
    />

    {megaH5Ready && (
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4" role="dialog" aria-modal="true">
        <div
          className="absolute inset-0"
          style={{ background: 'rgba(0,0,0,0.80)' }}
          onClick={() => setMegaH5Ready(null)}
          aria-hidden="true"
        />
        <div
          className="relative w-full max-w-xs rounded-2xl px-6 py-7 text-center flex flex-col gap-4"
          style={{ background: 'var(--bg-card, var(--bg-surface, #1a1b2e))' }}
        >
          <div className="text-4xl">🎮</div>
          <div>
            <p className="text-xs mb-1" style={{ color: 'var(--text-muted, #888)' }}>即将进入</p>
            <h4 className="text-base font-bold" style={{ color: 'var(--text-base, #fff)' }}>{megaH5Ready.name}</h4>
          </div>
          <a
            href={megaH5Ready.url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full rounded-xl py-3 text-sm font-bold text-white text-center block"
            style={{ background: 'var(--brand-primary, #6c5ce7)' }}
            onClick={() => setMegaH5Ready(null)}
          >Masuk Game</a>
          <button
            className="text-xs"
            style={{ color: 'var(--text-muted, #888)' }}
            onClick={() => setMegaH5Ready(null)}
          >取消</button>
        </div>
      </div>
    )}

    {megaAppError && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center px-4"
        role="dialog"
        aria-modal="true"
      >
        <div
          className="absolute inset-0"
          style={{ background: 'rgba(0,0,0,0.72)' }}
          onClick={() => setMegaAppError(null)}
          aria-hidden="true"
        />
        <div
          className="relative w-full max-w-xs rounded-2xl px-6 py-7 text-center"
          style={{ background: 'var(--bg-card, var(--bg-surface, #1a1b2e))' }}
        >
          <div className="text-3xl mb-3">⚠️</div>
          <h4 className="text-base font-bold mb-2" style={{ color: 'var(--text-base, #fff)' }}>
            Unable to launch MEGA888.
          </h4>
          <p className="text-sm mb-5" style={{ color: 'var(--text-muted, #aaa)', lineHeight: 1.6 }}>
            Please try again later.
          </p>
          <button
            onClick={() => setMegaAppError(null)}
            className="px-6 py-2.5 rounded-xl text-sm font-bold"
            style={{ background: 'var(--brand-primary)', color: '#fff' }}
          >
            OK
          </button>
        </div>
      </div>
    )}
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
                className="casino-card casino-card-hover relative overflow-hidden transition-all duration-200 disabled:opacity-70 w-full"
                style={{ textDecoration: 'none', aspectRatio: '3/4', minHeight: '120px' }}
              >
                {/* Full-bleed background: banner → logo → emoji */}
                {(card.bannerUrl ?? card.logoUrl) ? (
                  <img
                    src={(card.bannerUrl ?? card.logoUrl)!}
                    alt={card.name}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div
                    className="absolute inset-0 flex items-center justify-center text-4xl"
                    style={{ background: 'var(--bg-surface2)' }}
                  >
                    🎮
                  </div>
                )}

                {/* Gradient overlay so text is readable */}
                <div
                  className="absolute inset-0"
                  style={{
                    background: 'linear-gradient(to top, color-mix(in srgb, var(--bg-base) 95%, transparent) 0%, color-mix(in srgb, var(--bg-base) 15%, transparent) 55%, transparent 100%)',
                  }}
                />

                {/* HOT badge */}
                {card.is_hot && (
                  <span
                    className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-xs font-bold leading-none z-10"
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
                    className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-xs font-bold leading-none z-10"
                    style={{ background: 'var(--brand-primary)', color: '#fff' }}
                  >
                    NEW
                  </span>
                )}

                {/* Maintenance overlay */}
                {card.is_maintenance && (
                  <div
                    className="absolute inset-0 flex items-center justify-center z-10"
                    style={{ background: 'rgba(0,0,0,0.55)' }}
                  >
                    <span className="text-xs font-semibold text-white">维护中</span>
                  </div>
                )}

                {/* Loading spinner overlay */}
                {isThisLaunching && (
                  <div
                    className="absolute inset-0 flex items-center justify-center z-10"
                    style={{ background: 'rgba(0,0,0,0.45)' }}
                  >
                    <svg className="w-6 h-6 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  </div>
                )}

                {/* Provider name at bottom */}
                <span
                  className="absolute bottom-0 inset-x-0 p-2 text-xs font-semibold leading-tight text-center z-10"
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
    </>
  );
}
