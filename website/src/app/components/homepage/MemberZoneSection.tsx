'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';

interface ButtonConfig {
  media_id: number | null;
  media_url: string;
  media_type: string;
  text: string;
  url: string;
  enabled: boolean;
}

interface MemberZoneConfig {
  login_button: ButtonConfig;
  register_button: ButtonConfig;
  bg_media_id: number | null;
  bg_media_url: string;
  bg_media_type: string;
  bg_gradient: string;
  border_color: string;
  border_radius: string;
  deposit_button: { text: string; media_id: number | null; media_url: string; enabled: boolean };
  withdraw_button: { text: string; media_id: number | null; media_url: string; enabled: boolean };
  auto_refresh?: number; // 0 = off, else seconds
}

interface WebsiteSettings {
  deposit_min_amount?: string;
  withdraw_min_amount?: string;
  deposit_max_amount?: string;
  withdraw_max_amount?: string;
  website_currency?: string;
  max_withdrawals_per_day?: string;
}

interface MemberProfile {
  first_name: string;
  phone: string;
  total_deposit: string;
  total_withdraw: string;
  balance?: string | number;
  // Active bonus (from bonus_claims)
  active_bonus_id?:           number;
  active_promo_name?:         string;
  active_bonus_amount?:       string;
  active_turnover_required?:  string;
  active_turnover_completed?: string;
}

function fmt(n: string | number, currency = 'RM') {
  const v = parseFloat(String(n));
  return `${currency} ${isNaN(v) ? '0.00' : v.toFixed(2)}`;
}

// ─── Card Background ─────────────────────────────────────────────────────────
// Priority: image/gif/video → gradient overlay → fallback gradient

function CardBackground({ config }: { config: MemberZoneConfig }) {
  const hasMedia    = !!config.bg_media_url;
  const isVideo     = config.bg_media_type === 'VIDEO';
  const hasGradient = !!config.bg_gradient;

  return (
    <>
      {/* 1. Primary: image / gif / video — fills entire card, full opacity */}
      {hasMedia && (
        <div className="absolute inset-0 z-0">
          {isVideo ? (
            <video
              src={config.bg_media_url}
              autoPlay muted loop playsInline
              className="w-full h-full object-cover"
              style={{ display: 'block' }}
            />
          ) : (
            <img
              src={config.bg_media_url}
              alt=""
              className="w-full h-full object-cover object-center"
              style={{ display: 'block' }}
            />
          )}
        </div>
      )}

      {/* 2. Gradient overlay (optional) — when image exists use it as overlay for readability */}
      {hasGradient && (
        <div
          className="absolute inset-0 z-10"
          style={{
            background: config.bg_gradient,
            opacity: hasMedia ? 0.55 : 1,
          }}
        />
      )}

      {/* 3. Dark overlay when image exists but no gradient — ensures text readability */}
      {hasMedia && !hasGradient && (
        <div
          className="absolute inset-0 z-10"
          style={{ background: 'linear-gradient(135deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.25) 100%)' }}
        />
      )}
    </>
  );
}

// ─── Auth Buttons ─────────────────────────────────────────────────────────────
// Guest state: always shows Wallet summary (Balance RM 0.00 + Min Deposit + Min Withdraw)
// + Login / Register buttons. Same content on Desktop / Tablet / Mobile.

function AuthButtons({ config, settings }: { config: MemberZoneConfig; settings: WebsiteSettings }) {
  const loginEnabled    = config.login_button?.enabled !== false;
  const registerEnabled = config.register_button?.enabled !== false;
  const hasMedia        = !!config.bg_media_url;
  const hasGradient     = !!config.bg_gradient;

  const currency    = settings.website_currency    || 'RM';
  const minDeposit  = settings.deposit_min_amount  ?? '—';
  const minWithdraw = settings.withdraw_min_amount ?? '—';

  return (
    <div
      className="rounded-2xl p-3.5"
      style={{
        background: hasMedia || hasGradient ? (hasGradient && !hasMedia ? config.bg_gradient : 'var(--bg-card)') : 'var(--bg-card)',
        border: config.border_color ? `1px solid ${config.border_color}` : '1px solid rgba(255,255,255,0.06)',
        borderRadius: config.border_radius || '16px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <CardBackground config={config} />

      <div className="relative z-20">
        <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Member Portal</p>

        {/* Wallet summary — always visible, identical to logged-in MemberPanel */}
        <div className="rounded-xl p-2.5 mb-3" style={{ background: 'rgba(0,0,0,0.25)' }}>
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Available Balance</p>
          <p className="text-xl font-bold" style={{ color: 'var(--brand-primary)' }}>
            {currency} 0.00
          </p>
          <div className="flex gap-4 mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>Min Deposit: <strong style={{ color: 'var(--text-base)' }}>{currency} {minDeposit}</strong></span>
            <span>Min Withdraw: <strong style={{ color: 'var(--text-base)' }}>{currency} {minWithdraw}</strong></span>
          </div>
        </div>

        <div className="flex gap-3">
          {loginEnabled && (
            config.login_button?.media_url ? (
              <Link href={config.login_button.url || '/login'} className="flex-1">
                <img src={config.login_button.media_url} alt={config.login_button.text || 'Login'} className="w-full h-10 object-cover rounded-xl" />
              </Link>
            ) : (
              <Link href={config.login_button?.url || '/login'} className="flex-1 text-center py-2 text-sm font-semibold rounded-xl transition-colors" style={{ background: 'var(--brand-primary)', color: '#fff' }}>
                {config.login_button?.text || 'Login'}
              </Link>
            )
          )}

          {registerEnabled && (
            config.register_button?.media_url ? (
              <Link href={config.register_button.url || '/register'} className="flex-1">
                <img src={config.register_button.media_url} alt={config.register_button.text || 'Register'} className="w-full h-10 object-cover rounded-xl" />
              </Link>
            ) : (
              <Link href={config.register_button?.url || '/register'} className="flex-1 text-center py-2 text-sm font-semibold rounded-xl border transition-colors" style={{ borderColor: 'var(--brand-primary)', color: 'var(--brand-primary)' }}>
                {config.register_button?.text || 'Register'}
              </Link>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Wallet Card ──────────────────────────────────────────────────────────────

function WalletCard({
  profile,
  config,
  settings,
  onRefresh,
  refreshing,
  toast,
}: {
  profile: MemberProfile;
  config: MemberZoneConfig;
  settings: WebsiteSettings;
  onRefresh: () => void;
  refreshing: boolean;
  toast: string;
}) {
  const currency    = settings.website_currency || 'RM';
  const minDeposit  = parseFloat(settings.deposit_min_amount  || '30');
  const minWithdraw = parseFloat(settings.withdraw_min_amount || '50');

  const balance = profile.balance != null
    ? parseFloat(String(profile.balance))
    : parseFloat(profile.total_deposit || '0') - parseFloat(profile.total_withdraw || '0');

  const depositEnabled  = config.deposit_button?.enabled  !== false;
  const withdrawEnabled = config.withdraw_button?.enabled !== false;
  const hasMedia        = !!config.bg_media_url;
  const hasGradient     = !!config.bg_gradient;

  return (
    <div
      className="rounded-2xl p-3.5"
      style={{
        background: hasMedia || hasGradient ? (hasGradient && !hasMedia ? config.bg_gradient : 'var(--bg-card)') : 'var(--bg-card)',
        border: config.border_color ? `1px solid ${config.border_color}` : '1px solid rgba(255,255,255,0.06)',
        borderRadius: config.border_radius || '16px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <CardBackground config={config} />

      <div className="relative z-20">
        {/* User row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: 'var(--brand-primary)', color: '#fff' }}>
              {profile.first_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold leading-none" style={{ color: 'var(--text-base)' }}>{profile.first_name}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{profile.phone}</p>
            </div>
          </div>
        </div>

        {/* Balance */}
        <div className="rounded-xl p-2.5 mb-2" style={{ background: 'rgba(0,0,0,0.25)' }}>
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Available Balance</p>
          <div className="flex items-center justify-between">
            <p className="text-xl font-bold" style={{ color: 'var(--brand-primary)' }}>
              {refreshing ? <span className="opacity-50">…</span> : fmt(balance, currency)}
            </p>
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="p-1.5 rounded-full transition-colors hover:bg-white/10 disabled:opacity-50"
              style={{ color: 'var(--text-muted)' }}
              title="刷新余额"
            >
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                style={{ transition: 'transform 0.3s', transform: refreshing ? 'rotate(360deg)' : 'rotate(0deg)', animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }}
              >
                <path d="M1 4v6h6" />
                <path d="M23 20v-6h-6" />
                <path d="M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15" />
              </svg>
            </button>
          </div>

          {/* Error / success toast */}
          {toast && (
            <p className="text-xs mt-1" style={{ color: '#f87171' }}>{toast}</p>
          )}

          {/* Active promotion OR default config limits */}
          {profile.active_bonus_id ? (
            <div className="mt-2 pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              <div className="flex items-center gap-1 mb-1.5">
                <span style={{ fontSize: 11 }}>🎁</span>
                <span className="text-xs font-semibold" style={{ color: 'var(--brand-primary)' }}>Active Promotion</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                <span className="col-span-2 truncate font-medium" style={{ color: 'var(--text-base)' }}>
                  {profile.active_promo_name}
                </span>
                <span>Bonus</span>
                <span className="font-semibold" style={{ color: '#22c55e' }}>
                  {currency}{parseFloat(profile.active_bonus_amount ?? '0').toFixed(2)}
                </span>
                <span>Min Withdraw</span>
                <span>{currency}{minWithdraw}</span>
                <span>Max Withdraw</span>
                <span>{currency}{parseFloat(settings.withdraw_max_amount ?? '50000').toLocaleString()}</span>
              </div>
            </div>
          ) : (
            <div className="flex gap-4 mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span>Min Deposit: {currency}{minDeposit}</span>
              <span>Min Withdraw: {currency}{minWithdraw}</span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-2">
          {depositEnabled && (
            config.deposit_button?.media_url ? (
              <Link href="/deposit">
                <img src={config.deposit_button.media_url} alt={config.deposit_button.text || 'Deposit'} className="w-full h-12 object-cover rounded-xl" />
              </Link>
            ) : (
              <Link href="/deposit" className="text-center py-2 text-sm font-semibold rounded-xl transition-colors" style={{ background: 'var(--brand-primary)', color: '#fff' }}>
                {config.deposit_button?.text || '存款 Deposit'}
              </Link>
            )
          )}

          {withdrawEnabled && (
            config.withdraw_button?.media_url ? (
              <Link href="/withdraw">
                <img src={config.withdraw_button.media_url} alt={config.withdraw_button.text || 'Withdraw'} className="w-full h-12 object-cover rounded-xl" />
              </Link>
            ) : (
              <Link href="/withdraw" className="text-center py-2 text-sm font-semibold rounded-xl border transition-colors" style={{ borderColor: 'var(--brand-primary)', color: 'var(--brand-primary)' }}>
                {config.withdraw_button?.text || '提款 Withdraw'}
              </Link>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function MemberZoneSection({ config }: { config: MemberZoneConfig }) {
  const [authState, setAuthState] = useState<'loading' | 'guest' | 'member'>('loading');
  const [profile,   setProfile]   = useState<MemberProfile | null>(null);
  const [settings,  setSettings]  = useState<WebsiteSettings>({});
  const [refreshing, setRefreshing] = useState(false);
  const [toast,      setToast]      = useState('');
  const autoRefreshInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadProfile = useCallback(async (showToastOnError = false) => {
    try {
      const res = await fetch(`/api/member/profile?_=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) {
        setAuthState('guest');
        if (showToastOnError) {
          setToast('Unable to refresh balance. Please try again.');
          setTimeout(() => setToast(''), 3000);
        }
        return;
      }
      const data = await res.json() as MemberProfile;
      setProfile(data);
      setAuthState('member');
    } catch {
      setAuthState('guest');
      if (showToastOnError) {
        setToast('Unable to refresh balance. Please try again.');
        setTimeout(() => setToast(''), 3000);
      }
    }
  }, []);

  useEffect(() => {
    void loadProfile();
    fetch('/api/public/settings')
      .then(r => r.ok ? r.json() as Promise<WebsiteSettings> : {})
      .then(data => setSettings(data as WebsiteSettings))
      .catch(() => {});
  }, [loadProfile]);

  // Auto-refresh timer
  useEffect(() => {
    const intervalSec = config.auto_refresh ?? 0;
    if (autoRefreshInterval.current) clearInterval(autoRefreshInterval.current);
    if (intervalSec > 0) {
      autoRefreshInterval.current = setInterval(() => {
        void loadProfile();
      }, intervalSec * 1000);
    }
    return () => {
      if (autoRefreshInterval.current) clearInterval(autoRefreshInterval.current);
    };
  }, [config.auto_refresh, loadProfile]);

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    setToast('');
    await loadProfile(true);
    setRefreshing(false);
  }

  const currency = settings.website_currency || 'RM';

  if (authState === 'loading') {
    return (
      <div className="rounded-2xl p-5 animate-pulse" style={{ background: 'var(--bg-card)' }}>
        <div className="h-3 rounded w-1/2 mb-4" style={{ background: 'rgba(255,255,255,0.06)' }} />
        <div className="h-12 rounded-xl mb-3" style={{ background: 'rgba(255,255,255,0.06)' }} />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-11 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }} />
          <div className="h-11 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }} />
        </div>
      </div>
    );
  }

  if (authState === 'guest') {
    return <AuthButtons config={config} settings={settings} />;
  }

  return (
    <>
      {/* Keyframe for refresh spin */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <WalletCard
        profile={profile!}
        config={config}
        settings={settings}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        toast={toast}
      />
    </>
  );
}
