'use client';
import { useEffect, useState } from 'react';
import type { MemberProfile } from '@/lib/types';

type State = 'loading' | 'guest' | 'member';

function fmt(n: string | number) {
  const v = parseFloat(String(n));
  return `RM ${isNaN(v) ? '0.00' : v.toFixed(2)}`;
}

export default function MemberPanel() {
  const [state, setState] = useState<State>('loading');
  const [profile, setProfile] = useState<MemberProfile | null>(null);

  async function load() {
    try {
      const res = await fetch('/api/member/profile');
      if (res.status === 401) { setState('guest'); return; }
      if (!res.ok) { setState('guest'); return; }
      const data = (await res.json()) as MemberProfile;
      setProfile(data);
      setState('member');
    } catch {
      setState('guest');
    }
  }

  useEffect(() => { load(); }, []);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  }

  const balance = profile
    ? parseFloat(profile.total_deposit) - parseFloat(profile.total_withdraw)
    : 0;

  /* ── Loading skeleton ───────────────────────────────────── */
  if (state === 'loading') {
    return (
      <div className="casino-card p-4 animate-pulse">
        <div className="h-3 rounded w-3/4 mb-3" style={{ background: 'var(--bg-surface3)' }} />
        <div className="h-6 rounded w-1/2 mb-4" style={{ background: 'var(--bg-surface3)' }} />
        <div className="h-9 rounded mb-2"       style={{ background: 'var(--bg-surface3)' }} />
        <div className="h-9 rounded"             style={{ background: 'var(--bg-surface3)' }} />
      </div>
    );
  }

  /* ── Guest state ────────────────────────────────────────── */
  if (state === 'guest') {
    return (
      <div className="casino-card p-5">
        <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
          Member Portal
        </p>
        <p className="text-xs mb-5" style={{ color: 'var(--text-faint)' }}>
          Login to access your account
        </p>
        <div className="flex flex-col gap-2">
          <a
            href="/login"
            className="casino-btn-primary text-center py-2.5 text-sm font-semibold"
          >
            Login
          </a>
          <a
            href="/register"
            className="casino-btn-outline text-center py-2.5 text-sm font-semibold"
          >
            Register
          </a>
        </div>
      </div>
    );
  }

  /* ── Member state ───────────────────────────────────────── */
  return (
    <div className="casino-card p-5">
      {/* User info row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ background: 'var(--brand-primary)', color: '#fff' }}
          >
            {profile!.first_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold leading-none" style={{ color: 'var(--text-base)' }}>
              {profile!.first_name}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
              {profile!.phone}
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

      {/* Balance */}
      <div
        className="rounded-lg p-3 mb-4"
        style={{ background: 'var(--bg-surface3)' }}
      >
        <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
          Available Balance
        </p>
        <div className="flex items-center justify-between">
          <p
            className="text-xl font-bold glow-text"
            style={{ color: 'var(--brand-primary)' }}
          >
            {fmt(balance)}
          </p>
          <button
            onClick={load}
            className="p-1.5 rounded-full transition-colors"
            style={{ color: 'var(--text-muted)' }}
            title="Refresh balance"
            aria-label="Refresh balance"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M1 4v6h6" />
              <path d="M23 20v-6h-6" />
              <path d="M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-2">
        <a
          href="/dashboard#deposit"
          className="casino-btn-primary text-center py-2 text-sm font-semibold"
        >
          Deposit
        </a>
        <a
          href="/dashboard#withdraw"
          className="casino-btn-outline text-center py-2 text-sm font-semibold"
        >
          Withdraw
        </a>
      </div>
    </div>
  );
}
