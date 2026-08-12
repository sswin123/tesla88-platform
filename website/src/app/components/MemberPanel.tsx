'use client';
import { useEffect, useState } from 'react';
import { useMember } from '@/lib/contexts/MemberContext';
import { useWalletRefresh, type SyncItem } from '@/lib/hooks/useWalletRefresh';

type PublicSettings = {
  website_currency?: string;
  deposit_min_amount?: string;
  withdraw_min_amount?: string;
  website_registration?: string;
  website_decimal_places?: string;
};

function useFmt(currency: string, decimals: number) {
  return (n: string | number) => {
    const v = parseFloat(String(n));
    return `${currency} ${isNaN(v) ? (0).toFixed(decimals) : v.toFixed(decimals)}`;
  };
}

export default function MemberPanel() {
  const { profile, loading } = useMember();
  const { refreshing, refreshDone, syncResults, handleRefresh } = useWalletRefresh();
  const [pub, setPub] = useState<PublicSettings>({});

  useEffect(() => {
    fetch('/api/public/settings')
      .then(r => r.ok ? r.json() as Promise<PublicSettings> : Promise.resolve({} as PublicSettings))
      .then(setPub)
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  }

  const currency = pub.website_currency         ?? 'RM';
  const decimals = parseInt(pub.website_decimal_places ?? '2', 10);
  const fmt      = useFmt(currency, decimals);
  const depMin   = pub.deposit_min_amount  ?? '—';
  const wdMin    = pub.withdraw_min_amount ?? '—';
  const regOpen  = pub.website_registration === 'true';

  const balance   = profile ? parseFloat(profile.available_balance  ?? '0') : 0;
  const pendingWd = profile ? parseFloat(profile.pending_withdrawal ?? '0') : 0;

  /* ── Loading ─────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="casino-card p-4 animate-pulse">
        <div className="h-3 rounded w-3/4 mb-3" style={{ background: 'var(--bg-surface3)' }} />
        <div className="h-6 rounded w-1/2 mb-4" style={{ background: 'var(--bg-surface3)' }} />
        <div className="h-9 rounded mb-2"       style={{ background: 'var(--bg-surface3)' }} />
        <div className="h-9 rounded"             style={{ background: 'var(--bg-surface3)' }} />
      </div>
    );
  }

  /* ── Guest ───────────────────────────────────────────────── */
  if (!profile) {
    return (
      <div className="casino-card p-5">
        <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
          Member Portal
        </p>
        <div className="rounded-lg p-3 mb-4" style={{ background: 'var(--bg-surface3)' }}>
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Available Balance</p>
          <p className="text-xl font-bold glow-text" style={{ color: 'var(--brand-primary)' }}>
            {currency} {(0).toFixed(decimals)}
          </p>
          <div className="mt-2 flex gap-4 text-xs" style={{ color: 'var(--text-faint)' }}>
            <span>Min Deposit: <strong style={{ color: 'var(--text-muted)' }}>{currency} {depMin}</strong></span>
            <span>Min Withdraw: <strong style={{ color: 'var(--text-muted)' }}>{currency} {wdMin}</strong></span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <a href="/login" className="casino-btn-primary text-center py-2.5 text-sm font-semibold">Login</a>
          {regOpen && (
            <a href="/register" className="casino-btn-outline text-center py-2.5 text-sm font-semibold">Register</a>
          )}
        </div>
      </div>
    );
  }

  /* ── Member ──────────────────────────────────────────────── */
  return (
    <div className="casino-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ background: 'var(--brand-primary)', color: '#fff' }}
          >
            {profile.first_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold leading-none" style={{ color: 'var(--text-base)' }}>
              {profile.first_name}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
              {profile.phone}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs px-2 py-1 rounded casino-btn-outline"
          style={{ color: 'var(--text-muted)' }}
        >
          Logout
        </button>
      </div>

      {/* Balance — single source of truth: available_balance from context */}
      <div className="rounded-lg p-3 mb-4" style={{ background: 'var(--bg-surface3)' }}>
        <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Available Balance</p>
        <div className="flex items-center justify-between">
          <p className="text-xl font-bold glow-text" style={{ color: 'var(--brand-primary)' }}>
            {fmt(balance)}
          </p>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-3 rounded-full transition-colors"
            style={{ color: 'var(--text-muted)' }}
            title="Refresh balance"
            aria-label="Refresh balance"
          >
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5"
              className={refreshing ? 'animate-spin' : ''}
            >
              <path d="M1 4v6h6" />
              <path d="M23 20v-6h-6" />
              <path d="M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15" />
            </svg>
          </button>
        </div>
        {pendingWd > 0 && (
          <p className="text-xs mt-1" style={{ color: '#ca8a04' }}>
            + {fmt(pendingWd)} pending withdrawal
          </p>
        )}
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
                  +{fmt(totalRecovered)} recovered
                </p>
              )}
              <p className="text-xs mt-1" style={{ color: '#16a34a' }}>✓ Refreshed</p>
            </>
          );
        })()}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <a href="/deposit"  className="casino-btn-primary text-center py-2 text-sm font-semibold">Deposit</a>
        <a href="/withdraw" className="casino-btn-outline  text-center py-2 text-sm font-semibold">Withdraw</a>
      </div>
    </div>
  );
}
