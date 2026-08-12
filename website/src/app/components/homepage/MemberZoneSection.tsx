'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useMember } from '@/lib/contexts/MemberContext';
import { useWalletRefresh, type SyncItem } from '@/lib/hooks/useWalletRefresh';
import type { MemberProfile } from '@/lib/types';
import { getProxyImageUrl } from '@/lib/imageProxy';

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

function fmt(n: string | number, currency = 'RM') {
  const v = parseFloat(String(n));
  return `${currency} ${isNaN(v) ? '0.00' : v.toFixed(2)}`;
}

// ─── Card Background ─────────────────────────────────────────────────────────

function CardBackground({ config }: { config: MemberZoneConfig }) {
  const hasMedia    = !!config.bg_media_url;
  const isVideo     = config.bg_media_type === 'VIDEO';
  const hasGradient = !!config.bg_gradient;

  return (
    <>
      {hasMedia && (
        <div className="absolute inset-0 z-0">
          {isVideo ? (
            <video src={config.bg_media_url} autoPlay muted loop playsInline className="w-full h-full object-cover" style={{ display: 'block' }} />
          ) : (
            <img src={getProxyImageUrl(config.bg_media_url) ?? config.bg_media_url} alt="" className="w-full h-full object-cover object-center" style={{ display: 'block' }} />
          )}
        </div>
      )}
      {hasGradient && (
        <div className="absolute inset-0 z-10" style={{ background: config.bg_gradient, opacity: hasMedia ? 0.55 : 1 }} />
      )}
      {hasMedia && !hasGradient && (
        <div className="absolute inset-0 z-10" style={{ background: 'linear-gradient(135deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.25) 100%)' }} />
      )}
    </>
  );
}

// ─── Auth Buttons ─────────────────────────────────────────────────────────────

function AuthButtons({ config, settings }: { config: MemberZoneConfig; settings: WebsiteSettings }) {
  const loginEnabled    = config.login_button?.enabled !== false;
  const registerEnabled = config.register_button?.enabled !== false;
  const hasMedia        = !!config.bg_media_url;
  const hasGradient     = !!config.bg_gradient;

  const currency    = settings.website_currency    || 'RM';
  const minDeposit  = settings.deposit_min_amount  ?? '—';
  const minWithdraw = settings.withdraw_min_amount ?? '—';

  return (
    <div className="rounded-2xl p-3.5" style={{
      background: hasMedia || hasGradient ? (hasGradient && !hasMedia ? config.bg_gradient : 'var(--bg-card)') : 'var(--bg-card)',
      border: config.border_color ? `1px solid ${config.border_color}` : '1px solid var(--border-dim)',
      borderRadius: config.border_radius || '16px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <CardBackground config={config} />
      <div className="relative z-20">
        <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Member Portal</p>
        <div className="rounded-xl p-2.5 mb-3" style={{ background: 'rgba(0,0,0,0.25)' }}>
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Available Balance</p>
          <p className="text-xl font-bold" style={{ color: 'var(--brand-primary)' }}>{currency} 0.00</p>
          <div className="flex gap-4 mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>Min Deposit: <strong style={{ color: 'var(--text-base)' }}>{currency} {minDeposit}</strong></span>
            <span>Min Withdraw: <strong style={{ color: 'var(--text-base)' }}>{currency} {minWithdraw}</strong></span>
          </div>
        </div>
        <div className="flex gap-3">
          {loginEnabled && (
            config.login_button?.media_url ? (
              <Link href={config.login_button.url || '/login'} className="flex-1">
                <img src={getProxyImageUrl(config.login_button.media_url) ?? config.login_button.media_url} alt={config.login_button.text || 'Login'} className="w-full h-10 object-cover rounded-xl" />
              </Link>
            ) : (
              <Link href={config.login_button?.url || '/login'} className="flex-1 text-center py-2 text-sm font-semibold rounded-xl" style={{ background: 'var(--brand-primary)', color: '#fff' }}>
                {config.login_button?.text || 'Login'}
              </Link>
            )
          )}
          {registerEnabled && (
            config.register_button?.media_url ? (
              <Link href={config.register_button.url || '/register'} className="flex-1">
                <img src={getProxyImageUrl(config.register_button.media_url) ?? config.register_button.media_url} alt={config.register_button.text || 'Register'} className="w-full h-10 object-cover rounded-xl" />
              </Link>
            ) : (
              <Link href={config.register_button?.url || '/register'} className="flex-1 text-center py-2 text-sm font-semibold rounded-xl border" style={{ borderColor: 'var(--brand-primary)', color: 'var(--brand-primary)' }}>
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
  profile, config, settings, onRefresh, refreshing, refreshDone, syncResults,
}: {
  profile: MemberProfile;
  config: MemberZoneConfig;
  settings: WebsiteSettings;
  onRefresh: () => void;
  refreshing: boolean;
  refreshDone: boolean;
  syncResults: SyncItem[] | null;
}) {
  const currency    = settings.website_currency || 'RM';
  const minDeposit  = parseFloat(settings.deposit_min_amount  || '30');
  const minWithdraw = parseFloat(settings.withdraw_min_amount || '50');

  // Single source of truth: always use available_balance from context
  const balance   = parseFloat(profile.available_balance ?? '0');
  const pendingWd = parseFloat(profile.pending_withdrawal ?? '0');

  const depositEnabled  = config.deposit_button?.enabled  !== false;
  const withdrawEnabled = config.withdraw_button?.enabled !== false;
  const hasMedia        = !!config.bg_media_url;
  const hasGradient     = !!config.bg_gradient;

  return (
    <div className="rounded-2xl p-3.5" style={{
      background: hasMedia || hasGradient ? (hasGradient && !hasMedia ? config.bg_gradient : 'var(--bg-card)') : 'var(--bg-card)',
      border: config.border_color ? `1px solid ${config.border_color}` : '1px solid var(--border-dim)',
      borderRadius: config.border_radius || '16px',
      position: 'relative',
      overflow: 'hidden',
    }}>
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

        {/* Balance — single source of truth: available_balance from MemberContext */}
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
                style={{ transition: 'transform 0.3s', animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }}
              >
                <path d="M1 4v6h6" />
                <path d="M23 20v-6h-6" />
                <path d="M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15" />
              </svg>
            </button>
          </div>

          {/* Wallet refresh status — brief success/error indicator after refresh */}
          {refreshDone && (() => {
            const transferItems = syncResults
              ? syncResults.filter(r => r.wallet_type === 'TRANSFER')
              : [];
            const hasError       = transferItems.some(r => r.status === 'error');
            const totalRecovered = transferItems.reduce(
              (s, r) => s + (r.status === 'synced' ? (r.returned ?? 0) : 0), 0,
            );
            if (hasError && totalRecovered === 0) {
              return (
                <p className="text-xs mt-1" style={{ color: '#dc2626' }}>
                  Wallet refresh failed. Please try again later.
                </p>
              );
            }
            return (
              <>
                {totalRecovered > 0 && (
                  <p className="text-xs mt-1" style={{ color: '#16a34a' }}>
                    +{fmt(totalRecovered, currency)} recovered
                  </p>
                )}
                <p className="text-xs mt-1" style={{ color: '#16a34a' }}>✓ Refreshed</p>
              </>
            );
          })()}

          {pendingWd > 0 && (
            <p className="text-xs mt-1" style={{ color: '#ca8a04' }}>
              + {fmt(pendingWd, currency)} pending withdrawal
            </p>
          )}

          {/* Active promotion OR default config limits */}
          {profile.active_bonus_id ? (
            <div className="mt-2 pt-2 border-t" style={{ borderColor: 'var(--border-dim)' }}>
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
                <img src={getProxyImageUrl(config.deposit_button.media_url) ?? config.deposit_button.media_url} alt={config.deposit_button.text || 'Deposit'} className="w-full h-12 object-cover rounded-xl" />
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
                <img src={getProxyImageUrl(config.withdraw_button.media_url) ?? config.withdraw_button.media_url} alt={config.withdraw_button.text || 'Withdraw'} className="w-full h-12 object-cover rounded-xl" />
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
  const { profile, loading, refreshProfile } = useMember();
  const { refreshing, refreshDone, syncResults, handleRefresh } = useWalletRefresh();
  const [settings, setSettings] = useState<WebsiteSettings>({});
  const autoRefreshInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch('/api/public/settings')
      .then(r => r.ok ? r.json() as Promise<WebsiteSettings> : {})
      .then(data => setSettings(data as WebsiteSettings))
      .catch(() => {});
  }, []);

  // Auto-refresh timer — silently refreshes profile only (no sync, not user-initiated)
  useEffect(() => {
    const intervalSec = config.auto_refresh ?? 0;
    if (autoRefreshInterval.current) clearInterval(autoRefreshInterval.current);
    if (intervalSec > 0) {
      autoRefreshInterval.current = setInterval(() => {
        void refreshProfile();
      }, intervalSec * 1000);
    }
    return () => {
      if (autoRefreshInterval.current) clearInterval(autoRefreshInterval.current);
    };
  }, [config.auto_refresh, refreshProfile]);

  if (loading) {
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

  if (!profile) {
    return <AuthButtons config={config} settings={settings} />;
  }

  return (
    <>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <WalletCard
        profile={profile}
        config={config}
        settings={settings}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        refreshDone={refreshDone}
        syncResults={syncResults}
      />
    </>
  );
}
