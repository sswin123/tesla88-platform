'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Phase = 'phone' | 'reset' | 'done';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [phase,    setPhase]    = useState<Phase>('phone');
  const [phone,    setPhone]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [focused,  setFocused]  = useState('');

  function inputStyle(field: string, err = false) {
    return {
      width: '100%',
      height: 'var(--input-h)',
      padding: '0 12px',
      borderRadius: 'var(--radius-sm)',
      fontSize: '14px',
      background: err ? 'rgba(239,68,68,0.06)' : 'var(--bg-surface3)',
      border: `1px solid ${err ? '#ef4444' : focused === field ? 'var(--brand-primary)' : 'var(--border-mid)'}`,
      color: 'var(--text-base)',
      outline: 'none',
      boxShadow: focused === field && !err ? '0 0 0 2px color-mix(in srgb, var(--brand-primary) 15%, transparent)' : 'none',
    };
  }

  async function handleCheckPhone(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ phone }),
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json() as { ok?: boolean; found?: boolean; error?: string };
      if (res.ok && data.found) setPhase('reset');
      else setError(data.error ?? '验证失败，请重试');
    } catch {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('密码至少需要8个字符'); return; }
    if (password !== confirm) { setError('两次输入的密码不一致'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ phone, password }),
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setPhase('done');
        setTimeout(() => router.push('/login'), 2000);
      } else {
        setError(data.error ?? '重置失败，请重试');
      }
    } catch {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto">
      <h1 className="font-bold mb-1" style={{ fontSize: 'var(--sz-page-title)', color: 'var(--text-base)' }}>
        忘记密码
      </h1>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        通过注册手机号重置您的登录密码。
      </p>

      <div className="casino-card space-y-4" style={{ padding: 'var(--card-padding)' }}>
        {error && (
          <div className="text-sm px-3 py-2.5 rounded-lg"
            style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
            {error}
          </div>
        )}

        {phase === 'phone' && (
          <form onSubmit={handleCheckPhone} className="space-y-4">
            <div>
              <label className="block text-xs font-bold tracking-wider uppercase mb-1.5"
                style={{ color: 'var(--text-muted)' }}>
                注册手机号
              </label>
              <input value={phone} onChange={e => setPhone(e.target.value)}
                onFocus={() => setFocused('phone')} onBlur={() => setFocused('')}
                type="tel" required placeholder="01xxxxxxxxx"
                style={inputStyle('phone')}
              />
            </div>
            <button type="submit" disabled={loading}
              className="casino-btn-primary w-full text-sm font-bold disabled:opacity-50">
              {loading ? '验证中…' : '下一步'}
            </button>
            <p className="text-center text-xs" style={{ color: 'var(--text-muted)' }}>
              想起密码了？{' '}
              <a href="/login" style={{ color: 'var(--brand-primary)' }}>返回登录</a>
            </p>
          </form>
        )}

        {phase === 'reset' && (
          <form onSubmit={handleReset} className="space-y-4">
            <div className="text-xs px-3 py-2.5 rounded-lg"
              style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
              手机号验证成功，请设置新密码。
            </div>
            <div>
              <label className="block text-xs font-bold tracking-wider uppercase mb-1.5"
                style={{ color: 'var(--text-muted)' }}>
                新密码
              </label>
              <input value={password} onChange={e => setPassword(e.target.value)}
                onFocus={() => setFocused('newpw')} onBlur={() => setFocused('')}
                type="password" required minLength={8} placeholder="至少8个字符"
                style={inputStyle('newpw')}
              />
            </div>
            <div>
              <label className="block text-xs font-bold tracking-wider uppercase mb-1.5"
                style={{ color: 'var(--text-muted)' }}>
                确认新密码
              </label>
              <input value={confirm} onChange={e => setConfirm(e.target.value)}
                onFocus={() => setFocused('confirm')} onBlur={() => setFocused('')}
                type="password" required minLength={8} placeholder="再次输入密码"
                style={inputStyle('confirm')}
              />
            </div>
            <button type="submit" disabled={loading}
              className="casino-btn-primary w-full text-sm font-bold disabled:opacity-50">
              {loading ? '重置中…' : '确认重置'}
            </button>
          </form>
        )}

        {phase === 'done' && (
          <div className="text-center py-4">
            <div className="text-3xl mb-3">✓</div>
            <div className="text-sm px-3 py-2.5 rounded-lg"
              style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
              密码重置成功！正在跳转到登录页…
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
