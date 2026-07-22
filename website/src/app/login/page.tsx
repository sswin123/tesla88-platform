'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMember } from '@/lib/contexts/MemberContext';

function fmtSecs(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m > 0) return `${m} 分 ${r} 秒`;
  return `${r} 秒`;
}

export default function LoginPage() {
  const router = useRouter();
  const { refreshProfile } = useMember();
  const [phone, setPhone]         = useState('');
  const [password, setPassword]   = useState('');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [focused, setFocused]     = useState('');
  const [lockoutSecs, setLockout] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  function startCountdown(secs: number) {
    if (timerRef.current) clearInterval(timerRef.current);
    setLockout(secs);
    timerRef.current = setInterval(() => {
      setLockout(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          setError('');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (lockoutSecs > 0) return;
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
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '900', 10);
      startCountdown(retryAfter);
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
        {lockoutSecs > 0 && (
          <div className="text-sm px-3 py-3 rounded-lg space-y-1.5"
            style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
            <div className="font-semibold">⚠️ 登录已被暂时锁定</div>
            <div style={{ color: 'rgba(248,113,113,0.8)', fontSize: '12px' }}>
              原因：同一网络在 15 分钟内登录失败次数过多
            </div>
            <div style={{ fontSize: '12px' }}>
              请等待 <span className="font-bold" style={{ color: '#fca5a5' }}>{fmtSecs(lockoutSecs)}</span> 后重试
            </div>
          </div>
        )}
        {error && lockoutSecs === 0 && (
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

        <button type="submit" disabled={loading || lockoutSecs > 0}
          className="casino-btn-primary w-full text-sm font-bold disabled:opacity-50"
          style={{ borderRadius: 'var(--radius-btn)' }}>
          {loading ? '登录中…' : lockoutSecs > 0 ? `请等待 ${fmtSecs(lockoutSecs)}` : '立即登录'}
        </button>

        <div className="flex items-center justify-between text-xs pt-1">
          <a href="/forgot-password" style={{ color: 'var(--brand-primary)' }}>忘记密码？</a>
          <a href="/register" style={{ color: 'var(--brand-primary)' }}>注册新账号</a>
        </div>
      </form>
    </div>
  );
}
