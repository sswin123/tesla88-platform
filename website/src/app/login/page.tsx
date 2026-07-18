'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMember } from '@/lib/contexts/MemberContext';

export default function LoginPage() {
  const router = useRouter();
  const { refreshProfile } = useMember();
  const [phone, setPhone]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [focused, setFocused]   = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
      headers: { 'Content-Type': 'application/json' },
    });
    setLoading(false);
    if (res.ok) {
      // Sync global auth state before soft navigation — ensures MemberZoneSection,
      // MemberPanel, and ReferralCenter all show the logged-in view immediately.
      await refreshProfile();
      router.push('/');
      return;
    }
    const data = await res.json() as { error: string };
    setError(data.error ?? '登录失败，请重试');
  }

  function inputStyle(field: string) {
    return {
      background: 'var(--bg-surface3)',
      border: `1px solid ${focused === field ? 'var(--brand-primary)' : 'var(--border-mid)'}`,
      color: 'var(--text-base)',
      outline: 'none',
      boxShadow: focused === field ? '0 0 0 2px color-mix(in srgb, var(--brand-primary) 15%, transparent)' : 'none',
      height: 'var(--input-h)',
      borderRadius: 'var(--radius-sm)',
      padding: '0 12px',
      width: '100%',
      fontSize: '14px',
    };
  }

  return (
    <div className="max-w-sm mx-auto">
      <h1 className="font-bold mb-5" style={{ fontSize: 'var(--sz-page-title)', color: 'var(--text-base)' }}>
        会员登录
      </h1>

      <form onSubmit={handleSubmit} className="casino-card space-y-4" style={{ padding: 'var(--card-padding)' }}>
        {error && (
          <div className="text-sm px-3 py-2.5 rounded-lg"
            style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-bold tracking-wider uppercase mb-1.5"
            style={{ color: 'var(--text-muted)' }}>
            手机号码
          </label>
          <input
            value={phone}
            onChange={e => setPhone(e.target.value)}
            onFocus={() => setFocused('phone')}
            onBlur={() => setFocused('')}
            type="tel" required placeholder="01xxxxxxxxx"
            style={inputStyle('phone')}
          />
        </div>

        <div>
          <label className="block text-xs font-bold tracking-wider uppercase mb-1.5"
            style={{ color: 'var(--text-muted)' }}>
            密码
          </label>
          <input
            value={password}
            onChange={e => setPassword(e.target.value)}
            onFocus={() => setFocused('password')}
            onBlur={() => setFocused('')}
            type="password" required placeholder="请输入密码"
            style={inputStyle('password')}
          />
        </div>

        <button type="submit" disabled={loading}
          className="casino-btn-primary w-full text-sm font-bold disabled:opacity-50"
          style={{ borderRadius: 'var(--radius-btn)' }}>
          {loading ? '登录中…' : '立即登录'}
        </button>

        <div className="flex items-center justify-between text-xs pt-1">
          <a href="/forgot-password" style={{ color: 'var(--brand-primary)' }}>忘记密码？</a>
          <a href="/register" style={{ color: 'var(--brand-primary)' }}>注册新账号</a>
        </div>
      </form>
    </div>
  );
}
