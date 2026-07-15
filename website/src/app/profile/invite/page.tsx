'use client';
import { useEffect, useState } from 'react';
import type { MemberProfile } from '@/lib/types';

export default function InvitePage() {
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [copied, setCopied]   = useState(false);

  useEffect(() => {
    fetch('/api/member/profile')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => setProfile(d as MemberProfile))
      .catch(() => {});
  }, []);

  const referralCode  = profile?.referral_code ?? '';
  const referralCount = profile?.referral_count ?? 0;

  // Build telegram bot invite link using referral_code
  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  if (!profile) {
    return (
      <div className="casino-card p-6 animate-pulse">
        <div className="h-6 rounded w-1/3 mb-4" style={{ background: 'var(--bg-surface3)' }} />
        <div className="h-20 rounded" style={{ background: 'var(--bg-surface3)' }} />
      </div>
    );
  }

  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || '';
  const inviteLink = referralCode && siteOrigin
    ? `${siteOrigin}/register?ref=${referralCode}`
    : '';

  return (
    <div className="max-w-lg mx-auto lg:mx-0 flex flex-col gap-4">
      <div className="casino-card p-6">
        <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--text-base)' }}>🎁 邀请好友</h2>
        <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
          分享您的邀请码，邀请好友注册即可建立邀请关系。
        </p>

        {/* Referral code */}
        <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--bg-surface3)' }}>
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>我的邀请码</p>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xl font-mono font-bold tracking-wider" style={{ color: 'var(--text-base)' }}>
              {referralCode || '—'}
            </span>
            {referralCode && (
              <button
                onClick={() => handleCopy(referralCode)}
                className="px-3 py-1 rounded-lg text-xs font-semibold transition-colors"
                style={{
                  background: copied ? 'var(--color-success, #22c55e)' : 'var(--primary)',
                  color: '#fff',
                }}
              >
                {copied ? '已复制' : '复制'}
              </button>
            )}
          </div>
        </div>

        {/* Invite link */}
        {inviteLink && (
          <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--bg-surface3)' }}>
            <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>邀请链接</p>
            <p className="text-xs font-mono break-all mb-2" style={{ color: 'var(--text-base)' }}>
              {inviteLink}
            </p>
            <button
              onClick={() => handleCopy(inviteLink)}
              className="px-3 py-1 rounded-lg text-xs font-semibold transition-colors"
              style={{
                background: copied ? 'var(--color-success, #22c55e)' : 'var(--primary)',
                color: '#fff',
              }}
            >
              {copied ? '已复制' : '复制链接'}
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-surface3)' }}>
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>已邀请好友</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--text-base)' }}>
            {referralCount} <span className="text-sm font-normal" style={{ color: 'var(--text-muted)' }}>人</span>
          </p>
        </div>
      </div>
    </div>
  );
}
