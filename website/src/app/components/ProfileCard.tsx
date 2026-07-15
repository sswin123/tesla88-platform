'use client';
import { useState, useEffect } from 'react';
import type { MemberProfile } from '@/lib/types';

interface BrandSettings {
  support_whatsapp?: string;
  support_telegram?: string;
}

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
  const [brand, setBrand]     = useState<BrandSettings>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/member/profile').then(r => r.ok ? r.json() as Promise<MemberProfile> : Promise.reject()),
      fetch('/api/public/brand').then(r => r.ok ? r.json() as Promise<BrandSettings> : Promise.resolve({} as BrandSettings)),
    ]).then(([prof, b]) => {
      setProfile(prof);
      setBrand(b);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="casino-card p-4 animate-pulse">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full" style={{ background: 'var(--bg-surface3)' }} />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 rounded w-1/2" style={{ background: 'var(--bg-surface3)' }} />
            <div className="h-3 rounded w-1/3" style={{ background: 'var(--bg-surface3)' }} />
          </div>
        </div>
        <div className="h-8 rounded mb-3" style={{ background: 'var(--bg-surface3)' }} />
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
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
  const displayName = profile.bank_holder_name || profile.first_name;
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="space-y-4">
      {/* ── Avatar + name + balance ─────────────────────────── */}
      <div
        className="casino-card p-4"
        style={{
          border: '1px solid color-mix(in srgb, var(--brand-primary) 35%, transparent)',
          boxShadow: '0 0 24px color-mix(in srgb, var(--brand-primary) 10%, transparent)',
        }}
      >
        {/* Avatar row */}
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-black shrink-0"
            style={{
              background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))',
              color: '#fff',
              boxShadow: '0 0 12px color-mix(in srgb, var(--brand-primary) 50%, transparent)',
            }}
          >
            {initial}
          </div>
          <div>
            <p
              className="text-base font-bold leading-tight"
              style={{ color: 'var(--text-base)' }}
            >
              {displayName}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {profile.phone}
            </p>
            {profile.public_id && (
              <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--text-faint)' }}>
                ID: {profile.public_id}
              </p>
            )}
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
          className="rounded-xl p-3"
          style={{ background: 'var(--bg-surface3)' }}
        >
          <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>
            可用余额
          </p>
          <p
            className="text-2xl font-black"
            style={{
              color: 'var(--brand-primary)',
              textShadow: '0 0 20px color-mix(in srgb, var(--brand-primary) 60%, transparent)',
            }}
          >
            {fmt(balance)}
          </p>
          <div className="flex gap-2 mt-3">
            <a
              href="/dashboard#deposit"
              className="casino-btn-primary flex-1 text-center text-sm font-semibold"
              style={{ minHeight: '36px', lineHeight: '36px', padding: '0 12px' }}
            >
              存款
            </a>
            <a
              href="/dashboard#withdraw"
              className="casino-btn-outline flex-1 text-center text-sm font-semibold"
              style={{ minHeight: '36px', lineHeight: '36px', padding: '0 12px' }}
            >
              取款
            </a>
          </div>
        </div>
      </div>

      {/* ── Bank info ──────────────────────────────────────── */}
      <div className="casino-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3
            className="text-xs font-bold tracking-wider uppercase"
            style={{ color: 'var(--text-muted)' }}
          >
            银行信息
          </h3>
          {profile.bank_account ? (
            <span
              className="text-xs px-2 py-0.5 rounded-full font-semibold flex items-center gap-1"
              style={{
                background: 'color-mix(in srgb, #22c55e 15%, transparent)',
                color: '#22c55e',
              }}
            >
              🔒 已绑定
            </span>
          ) : (
            <a
              href="/complete-bank-information"
              className="text-xs px-3 py-1 rounded-full font-semibold"
              style={{
                background: 'var(--brand-primary)',
                color: '#fff',
              }}
            >
              立即绑定
            </a>
          )}
        </div>

        {profile.bank_account ? (
          <>
            <div className="space-y-3">
              {[
                { label: '银行名称', value: profile.bank_name || '—' },
                { label: '银行账号', value: maskAccount(profile.bank_account) },
                { label: '账户名称', value: profile.bank_holder_name || '—' },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between text-sm">
                  <span style={{ color: 'var(--text-muted)' }}>{row.label}</span>
                  <span className="font-medium font-mono" style={{ color: 'var(--text-base)' }}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>

            {/* Lock notice + CS contact */}
            <div
              className="mt-3 rounded-lg p-2.5 text-xs"
              style={{
                background: 'color-mix(in srgb, var(--brand-primary) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--brand-primary) 20%, transparent)',
                color: 'var(--text-muted)',
              }}
            >
              <p className="mb-2">🔒 银行信息提交后不可自行修改，如需更改请联系客服核实后由管理员操作。</p>
              <div className="flex gap-2 flex-wrap">
                {brand.support_telegram && (
                  <a
                    href={brand.support_telegram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold"
                    style={{ background: 'var(--bg-surface3)', color: 'var(--text-base)' }}
                  >
                    💬 Telegram 客服
                  </a>
                )}
                {brand.support_whatsapp && (
                  <a
                    href={brand.support_whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold"
                    style={{ background: 'var(--bg-surface3)', color: 'var(--text-base)' }}
                  >
                    📱 WhatsApp 客服
                  </a>
                )}
                <a
                  href="/chat"
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold"
                  style={{ background: 'var(--bg-surface3)', color: 'var(--text-base)' }}
                >
                  🎧 在线客服
                </a>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
              您尚未绑定银行账户，绑定后方可提款
            </p>
            <a
              href="/complete-bank-information"
              className="inline-block px-6 py-2 rounded-lg text-sm font-semibold"
              style={{ background: 'var(--brand-primary)', color: '#fff' }}
            >
              绑定银行账户
            </a>
          </div>
        )}
      </div>

      {/* ── Stats ─────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: '累计存款', value: fmt(profile.total_deposit) },
          { label: '累计取款', value: fmt(profile.total_withdraw) },
          { label: '获得奖金', value: fmt(profile.total_bonus) },
        ].map(s => (
          <div
            key={s.label}
            className="casino-card p-2.5 text-center"
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
