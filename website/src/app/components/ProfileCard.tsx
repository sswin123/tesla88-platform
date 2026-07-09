'use client';
import { useState, useEffect } from 'react';
import type { MemberProfile } from '@/lib/types';

function fmt(n: string | number) {
  const v = parseFloat(String(n));
  return isNaN(v) ? 'RM 0.00' : `RM ${v.toFixed(2)}`;
}

function maskAccount(acc: string) {
  if (!acc || acc.length < 4) return acc;
  return `${'*'.repeat(acc.length - 4)}${acc.slice(-4)}`;
}

export default function ProfileCard() {
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/member/profile')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { setProfile(d as MemberProfile); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="casino-card p-6 animate-pulse">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full" style={{ background: 'var(--bg-surface3)' }} />
          <div className="flex-1 space-y-2">
            <div className="h-4 rounded w-1/2" style={{ background: 'var(--bg-surface3)' }} />
            <div className="h-3 rounded w-1/3" style={{ background: 'var(--bg-surface3)' }} />
          </div>
        </div>
        <div className="h-10 rounded mb-4" style={{ background: 'var(--bg-surface3)' }} />
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-3 rounded" style={{ background: 'var(--bg-surface3)' }} />
          ))}
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div
        className="casino-card p-6 text-center text-sm"
        style={{ color: 'var(--text-muted)' }}
      >
        加载失败，请刷新页面
      </div>
    );
  }

  const balance = parseFloat(profile.total_deposit) - parseFloat(profile.total_withdraw);
  const initial = profile.first_name.charAt(0).toUpperCase();

  return (
    <div className="space-y-4">
      {/* ── Avatar + name + balance ─────────────────────────── */}
      <div
        className="casino-card p-6"
        style={{
          border: '1px solid color-mix(in srgb, var(--brand-primary) 35%, transparent)',
          boxShadow: '0 0 24px color-mix(in srgb, var(--brand-primary) 10%, transparent)',
        }}
      >
        {/* Avatar row */}
        <div className="flex items-center gap-4 mb-5">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-black shrink-0"
            style={{
              background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))',
              color: '#fff',
              boxShadow: '0 0 16px color-mix(in srgb, var(--brand-primary) 50%, transparent)',
            }}
          >
            {initial}
          </div>
          <div>
            <p
              className="text-lg font-bold leading-tight"
              style={{ color: 'var(--text-base)' }}
            >
              {profile.first_name}
            </p>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {profile.phone}
            </p>
            <span
              className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold"
              style={{
                background: 'color-mix(in srgb, var(--brand-primary) 18%, transparent)',
                color: 'var(--brand-primary)',
              }}
            >
              活跃会员
            </span>
          </div>
        </div>

        {/* Balance */}
        <div
          className="rounded-xl p-4 mb-0"
          style={{ background: 'var(--bg-surface3)' }}
        >
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
            可用余额
          </p>
          <p
            className="text-3xl font-black"
            style={{
              color: 'var(--brand-primary)',
              textShadow: '0 0 20px color-mix(in srgb, var(--brand-primary) 60%, transparent)',
            }}
          >
            {fmt(balance)}
          </p>
          <div className="flex gap-3 mt-4">
            <a
              href="/dashboard#deposit"
              className="casino-btn-primary flex-1 text-center py-2 text-sm font-semibold"
            >
              存款
            </a>
            <a
              href="/dashboard#withdraw"
              className="casino-btn-outline flex-1 text-center py-2 text-sm font-semibold"
            >
              取款
            </a>
          </div>
        </div>
      </div>

      {/* ── Bank info ──────────────────────────────────────── */}
      <div className="casino-card p-5">
        <h3
          className="text-xs font-bold tracking-wider uppercase mb-4"
          style={{ color: 'var(--text-muted)' }}
        >
          银行信息
        </h3>
        <div className="space-y-3">
          {[
            { label: '银行名称', value: profile.bank_name || '未绑定' },
            { label: '银行账号', value: profile.bank_account ? maskAccount(profile.bank_account) : '未绑定' },
            { label: '账户名称', value: profile.bank_holder_name || '未绑定' },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between text-sm">
              <span style={{ color: 'var(--text-muted)' }}>{row.label}</span>
              <span className="font-medium" style={{ color: 'var(--text-base)' }}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Stats ─────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '累计存款', value: fmt(profile.total_deposit) },
          { label: '累计取款', value: fmt(profile.total_withdraw) },
          { label: '获得奖金', value: fmt(profile.total_bonus) },
        ].map(s => (
          <div
            key={s.label}
            className="casino-card p-3 text-center"
          >
            <p
              className="text-sm font-bold mb-1"
              style={{ color: 'var(--brand-primary)' }}
            >
              {s.value}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* ── Member since ───────────────────────────────────── */}
      <p className="text-center text-xs" style={{ color: 'var(--text-faint)' }}>
        注册时间：{new Date(profile.created_at).toLocaleDateString('zh-CN')}
      </p>
    </div>
  );
}
