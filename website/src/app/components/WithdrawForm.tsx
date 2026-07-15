'use client';
import { useState, useEffect } from 'react';
import type { MemberProfile } from '@/lib/types';
import WithdrawSummary from './WithdrawSummary';

type Step = 'form' | 'confirm' | 'success';

function InputLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-bold tracking-wider uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
      {children}
    </label>
  );
}

function inputStyle(focused: boolean = false) {
  return {
    background: 'var(--bg-surface3)',
    border: `1px solid ${focused ? 'var(--brand-primary)' : 'var(--border-mid)'}`,
    color: 'var(--text-base)',
    outline: 'none',
    boxShadow: focused ? '0 0 0 2px color-mix(in srgb, var(--brand-primary) 20%, transparent)' : 'none',
  };
}

function maskAccount(s: string): string {
  if (s.length <= 4) return s;
  return '*'.repeat(s.length - 4) + s.slice(-4);
}

export default function WithdrawForm() {
  const [step, setStep]         = useState<Step>('form');
  const [amount, setAmount]     = useState('');
  const [focusedField, setFocusedField] = useState('');
  const [error, setError]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successId, setSuccessId]   = useState<number | null>(null);

  const [profile, setProfile]   = useState<MemberProfile | null>(null);
  const [minAmount, setMinAmount] = useState(30);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/member/profile').then(r => r.ok ? r.json() as Promise<MemberProfile> : Promise.reject()),
      fetch('/api/public/settings').then(r => r.ok ? r.json() as Promise<Partial<Record<string, string>>> : Promise.resolve({} as Partial<Record<string, string>>)),
    ]).then(([prof, settings]) => {
      setProfile(prof);
      if (settings.withdraw_min_amount) setMinAmount(parseFloat(settings.withdraw_min_amount) || 30);
    }).catch(() => {/* silent */}).finally(() => setLoading(false));
  }, []);

  const numAmount = parseFloat(amount) || 0;
  const balance   = parseFloat(profile?.net_deposit ?? '0');

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!profile?.bank_account) { window.location.href = '/complete-bank-information'; return; }
    if (numAmount < minAmount)  { setError(`最低提款金额为 RM ${minAmount}`); return; }
    if (numAmount > balance)    { setError('提款金额超过可用余额'); return; }
    setStep('confirm');
  }

  async function handleConfirm() {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/member/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: numAmount }),
      });
      const data = await res.json() as { ok?: boolean; id?: number; error?: string; pending_id?: number };
      if (res.ok && data.id) {
        setSuccessId(data.id);
        setStep('success');
      } else if (res.status === 409) {
        setError(data.error ?? '已有提款申请处理中');
        setStep('form');
      } else {
        setError(data.error ?? '提交失败，请重试');
        setStep('form');
      }
    } catch {
      setError('网络错误，请重试');
      setStep('form');
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Loading skeleton ────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="casino-card p-4 h-24 rounded-2xl" style={{ background: 'var(--bg-surface)' }} />
        <div className="casino-card p-4 h-32 rounded-2xl" style={{ background: 'var(--bg-surface)' }} />
      </div>
    );
  }

  /* ── No bank account warning ─────────────────────────────────── */
  if (!loading && !profile?.bank_account) {
    return (
      <div className="casino-card p-4 text-center space-y-3">
        <p className="text-4xl">🏦</p>
        <p className="font-semibold" style={{ color: 'var(--text-base)' }}>未绑定银行账户</p>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          提款前请先联系客服绑定您的银行账户
        </p>
        <a href="/chat" className="casino-btn-primary inline-block px-6 py-2.5 text-sm">
          联系客服
        </a>
      </div>
    );
  }

  /* ── Success screen ──────────────────────────────────────────── */
  if (step === 'success') {
    return (
      <div className="casino-card p-5 text-center">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
          style={{ background: 'rgba(34,197,94,0.15)', fontSize: '1.5rem' }}
        >
          ✓
        </div>
        <h2 className="text-base font-bold mb-1.5" style={{ color: '#22c55e' }}>
          提款申请已提交
        </h2>
        <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>
          流水号：<span className="font-mono font-bold" style={{ color: 'var(--text-base)' }}>#{successId}</span>
        </p>
        <p className="text-xs mb-4" style={{ color: 'var(--text-faint)' }}>
          我们将在 1-3 个工作日内处理您的提款申请
        </p>
        <div className="flex gap-2 justify-center">
          <a href="/history" className="casino-btn-outline px-4 text-sm">
            查看记录
          </a>
          <button
            onClick={() => { setStep('form'); setAmount(''); setSuccessId(null); }}
            className="casino-btn-primary px-4 text-sm"
          >
            再次提款
          </button>
        </div>
      </div>
    );
  }

  /* ── Confirmation screen ─────────────────────────────────────── */
  if (step === 'confirm') {
    return (
      <WithdrawSummary
        amount={numAmount}
        bankName={profile!.bank_name}
        bankAccount={profile!.bank_account}
        onConfirm={handleConfirm}
        onBack={() => setStep('form')}
        submitting={submitting}
      />
    );
  }

  /* ── Withdraw form ───────────────────────────────────────────── */
  return (
    <form onSubmit={handleFormSubmit} className="space-y-4">
      {error && (
        <div
          className="text-sm px-4 py-3 rounded-xl"
          style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}
        >
          {error}
        </div>
      )}

      {/* ── Balance card ── */}
      <div className="casino-card p-4">
        <p className="text-xs font-bold tracking-wider uppercase mb-0.5" style={{ color: 'var(--text-muted)' }}>
          可用余额
        </p>
        <p
          className="text-2xl font-black"
          style={{
            color: 'var(--brand-primary)',
            textShadow: '0 0 16px color-mix(in srgb, var(--brand-primary) 50%, transparent)',
          }}
        >
          RM {balance.toFixed(2)}
        </p>
      </div>

      {/* ── Bank info ── */}
      <div className="casino-card p-3">
        <p className="text-xs font-bold tracking-wider uppercase mb-3" style={{ color: 'var(--text-muted)' }}>
          提款至
        </p>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-base)' }}>{profile!.bank_name}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{profile!.bank_holder_name}</p>
          </div>
          <p className="text-sm font-mono font-bold" style={{ color: 'var(--brand-primary)' }}>
            {maskAccount(profile!.bank_account)}
          </p>
        </div>
      </div>

      {/* ── Amount ── */}
      <div>
        <InputLabel>提款金额 (RM)</InputLabel>
        <div className="relative">
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold"
            style={{ color: 'var(--text-faint)' }}
          >
            RM
          </span>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            onFocus={() => setFocusedField('amount')}
            onBlur={() => setFocusedField('')}
            min={minAmount}
            max={balance}
            step="1"
            placeholder={`最低 RM ${minAmount}`}
            required
            className="w-full pl-10 pr-4 py-2 rounded-xl text-sm"
            style={inputStyle(focusedField === 'amount')}
          />
        </div>
        {/* Quick amount buttons */}
        <div className="flex gap-2 mt-2">
          {[100, 200, 500, 1000].map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setAmount(String(Math.min(v, balance)))}
              className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={
                numAmount === v
                  ? { background: 'var(--brand-primary)', color: '#fff' }
                  : { background: 'var(--bg-surface3)', color: 'var(--text-muted)' }
              }
            >
              {v}
            </button>
          ))}
        </div>
        {/* All-in shortcut */}
        {balance > 0 && (
          <button
            type="button"
            onClick={() => setAmount(Math.floor(balance).toString())}
            className="mt-2 w-full py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{ background: 'var(--bg-surface3)', color: 'var(--text-muted)' }}
          >
            全部提款 (RM {Math.floor(balance)})
          </button>
        )}
      </div>

      <button
        type="submit"
        className="casino-btn-primary w-full text-sm font-bold"
      >
        下一步：确认详情
      </button>
    </form>
  );
}
