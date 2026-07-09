'use client';
import { useState, useEffect } from 'react';
import type { PublicPromotion } from '@/lib/types';
import PromotionSelector from './PromotionSelector';
import DepositSummary from './DepositSummary';

const GAME_PROVIDERS = ['918Kiss', 'Mega888', 'Pussy888', 'Newtown', 'Ace333', 'Live22'] as const;
const PAYMENT_METHODS = ['Maybank', 'CIMB', 'Public Bank', 'RHB', 'Hong Leong', 'AmBank', 'Touch\'n Go', 'DuitNow'];

interface PaymentBank {
  id: number;
  bank_name: string;
  account_number: string;
  account_name: string;
  qr_media_id: number | null;
  instructions: string | null;
}

type Step = 'form' | 'confirm' | 'success';

function BankCard({ bank }: { bank: PaymentBank }) {
  const [copied, setCopied] = useState(false);

  function copyAccount() {
    navigator.clipboard.writeText(bank.account_number).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {/* silent */});
  }

  return (
    <div className="casino-card p-4 space-y-3">
      {/* Bank name + account */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--text-base)' }}>{bank.bank_name}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{bank.account_name}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-mono font-bold" style={{ color: 'var(--brand-primary)' }}>
            {bank.account_number}
          </p>
          <button
            type="button"
            onClick={copyAccount}
            className="mt-1 text-xs px-2 py-0.5 rounded transition-all"
            style={{
              background: copied ? 'rgba(34,197,94,0.15)' : 'var(--bg-surface3)',
              color: copied ? '#22c55e' : 'var(--text-muted)',
              border: `1px solid ${copied ? 'rgba(34,197,94,0.3)' : 'var(--border-dim)'}`,
            }}
          >
            {copied ? '✓ 已复制' : '复制账号'}
          </button>
        </div>
      </div>

      {/* QR Code */}
      {bank.qr_media_id && (
        <div className="flex justify-center pt-1">
          <img
            src={`/api/public/media/${bank.qr_media_id}`}
            alt={`${bank.bank_name} QR`}
            className="w-32 h-32 object-contain rounded-lg"
            style={{ background: '#fff', padding: '4px' }}
          />
        </div>
      )}

      {/* Instructions */}
      {bank.instructions && (
        <p
          className="text-xs rounded-lg px-3 py-2"
          style={{ background: 'rgba(234,179,8,0.1)', color: '#ca8a04', border: '1px solid rgba(234,179,8,0.2)' }}
        >
          ⚠️ {bank.instructions}
        </p>
      )}
    </div>
  );
}

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

function calcBonus(promo: PublicPromotion, amount: number): number {
  if (amount < parseFloat(promo.min_deposit)) return 0;
  if (promo.bonus_type === 'PERCENTAGE') {
    const raw = amount * (parseFloat(promo.bonus_value) / 100);
    return promo.max_bonus ? Math.min(raw, parseFloat(promo.max_bonus)) : raw;
  }
  return parseFloat(promo.bonus_value);
}

export default function DepositForm() {
  const [step, setStep]       = useState<Step>('form');
  const [amount, setAmount]   = useState('');
  const [provider, setProvider] = useState('');
  const [paymentBank, setPaymentBank] = useState('');
  const [promoId, setPromoId] = useState<number | null>(null);
  const [focusedField, setFocusedField] = useState('');
  const [error, setError]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successId, setSuccessId]   = useState<number | null>(null);

  const [promotions, setPromotions]     = useState<PublicPromotion[]>([]);
  const [platformBanks, setPlatformBanks] = useState<PaymentBank[]>([]);
  const [minAmount, setMinAmount]       = useState(30);

  useEffect(() => {
    Promise.all([
      fetch('/api/member/promotions/eligible').then(r => r.ok ? r.json() as Promise<PublicPromotion[]> : Promise.resolve([])),
      fetch('/api/public/payment-banks').then(r => r.ok ? r.json() as Promise<PaymentBank[]> : Promise.resolve([])),
      fetch('/api/public/settings').then(r => r.ok ? r.json() as Promise<Partial<Record<string, string>>> : Promise.resolve({} as Partial<Record<string, string>>)),
    ]).then(([promos, banks, settings]) => {
      setPromotions(promos);
      setPlatformBanks(banks);
      if (settings.deposit_min_amount) setMinAmount(parseFloat(settings.deposit_min_amount) || 30);
    }).catch(() => {/* silent */});
  }, []);

  const numAmount    = parseFloat(amount) || 0;
  const selectedPromo = promotions.find(p => p.id === promoId) ?? null;
  const bonusAmount   = selectedPromo ? calcBonus(selectedPromo, numAmount) : 0;
  const turnoverRequired = selectedPromo && bonusAmount > 0
    ? bonusAmount * parseFloat(selectedPromo.turnover_multiplier)
    : 0;

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (numAmount < minAmount) { setError(`最低存款金额为 RM ${minAmount}`); return; }
    if (!provider)    { setError('请选择游戏'); return; }
    if (!paymentBank) { setError('请选择付款方式'); return; }
    setStep('confirm');
  }

  async function handleConfirm() {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/member/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: numAmount,
          provider,
          payment_bank: paymentBank,
          promotion_id: promoId ?? undefined,
        }),
      });
      const data = await res.json() as { ok?: boolean; id?: number; error?: string; pending_id?: number };
      if (res.ok && data.id) {
        setSuccessId(data.id);
        setStep('success');
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

  /* ── Success screen ──────────────────────────────────────────── */
  if (step === 'success') {
    return (
      <div className="casino-card p-8 text-center">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl"
          style={{ background: 'rgba(34,197,94,0.15)', fontSize: '2rem' }}
        >
          ✓
        </div>
        <h2 className="text-lg font-bold mb-2" style={{ color: '#22c55e' }}>
          存款申请已提交
        </h2>
        <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>
          流水号：<span className="font-mono font-bold" style={{ color: 'var(--text-base)' }}>#{successId}</span>
        </p>
        <p className="text-xs mb-6" style={{ color: 'var(--text-faint)' }}>
          请完成转账，我们将在审核后将金额存入您的账户
        </p>
        <div className="flex gap-3 justify-center">
          <a href="/history" className="casino-btn-outline px-5 py-2.5 text-sm">
            查看记录
          </a>
          <button
            onClick={() => { setStep('form'); setAmount(''); setProvider(''); setPaymentBank(''); setPromoId(null); setSuccessId(null); }}
            className="casino-btn-primary px-5 py-2.5 text-sm"
          >
            再次存款
          </button>
        </div>
      </div>
    );
  }

  /* ── Confirmation screen ─────────────────────────────────────── */
  if (step === 'confirm') {
    return (
      <DepositSummary
        amount={numAmount}
        provider={provider}
        paymentBank={paymentBank}
        promotion={selectedPromo}
        bonusAmount={bonusAmount}
        turnoverRequired={turnoverRequired}
        onConfirm={handleConfirm}
        onBack={() => setStep('form')}
        submitting={submitting}
      />
    );
  }

  /* ── Deposit form ────────────────────────────────────────────── */
  return (
    <form onSubmit={handleFormSubmit} className="space-y-5">
      {error && (
        <div
          className="text-sm px-4 py-3 rounded-xl"
          style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}
        >
          {error}
        </div>
      )}

      {/* ── Platform bank accounts (transfer destination) ── */}
      {platformBanks.length === 0 ? (
        <div
          className="casino-card p-5 text-center"
          style={{ border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.05)' }}
        >
          <p className="text-2xl mb-2">🔧</p>
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-base)' }}>
            暂时无法存款
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            收款账户维护中，请联系{' '}
            <a href="/chat" style={{ color: 'var(--brand-primary)' }}>在线客服</a>
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-bold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>
            转账至以下账户
          </p>
          {platformBanks.map(b => (
            <BankCard key={b.id} bank={b} />
          ))}
        </div>
      )}

      {/* ── Amount ── */}
      <div>
        <InputLabel>存款金额 (RM)</InputLabel>
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
            step="1"
            placeholder={`最低 RM ${minAmount}`}
            required
            className="w-full pl-10 pr-4 py-3 rounded-xl text-sm"
            style={inputStyle(focusedField === 'amount')}
          />
        </div>
        {/* Quick amount buttons */}
        <div className="flex gap-2 mt-2">
          {[50, 100, 200, 500].map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setAmount(String(v))}
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
      </div>

      {/* ── Game provider ── */}
      <div>
        <InputLabel>选择游戏</InputLabel>
        <div className="grid grid-cols-3 gap-2">
          {GAME_PROVIDERS.map(g => (
            <button
              key={g}
              type="button"
              onClick={() => setProvider(g)}
              className="py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={
                provider === g
                  ? {
                      background: 'var(--brand-primary)',
                      color: '#fff',
                      boxShadow: '0 0 10px color-mix(in srgb, var(--brand-primary) 40%, transparent)',
                    }
                  : { background: 'var(--bg-surface3)', color: 'var(--text-muted)', border: '1px solid var(--border-dim)' }
              }
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* ── Payment method ── */}
      <div>
        <InputLabel>付款方式</InputLabel>
        <select
          value={paymentBank}
          onChange={e => setPaymentBank(e.target.value)}
          onFocus={() => setFocusedField('bank')}
          onBlur={() => setFocusedField('')}
          required
          className="w-full px-3 py-3 rounded-xl text-sm appearance-none"
          style={inputStyle(focusedField === 'bank')}
        >
          <option value="">-- 请选择 --</option>
          {PAYMENT_METHODS.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {/* ── Receipt upload placeholder ── */}
      <div>
        <InputLabel>上传转账凭证（可选）</InputLabel>
        <div
          className="rounded-xl border-2 border-dashed p-6 text-center"
          style={{ borderColor: 'var(--border-mid)' }}
        >
          <p className="text-2xl mb-2">📎</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            点击上传图片
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>
            支持 JPG / PNG，最大 20MB
          </p>
          <input type="file" accept="image/*" className="hidden" disabled aria-label="上传凭证" />
        </div>
      </div>

      {/* ── Promotion selection ── */}
      <div>
        <InputLabel>优惠活动（可选）</InputLabel>
        <PromotionSelector
          promotions={promotions}
          selectedId={promoId}
          depositAmount={numAmount}
          onChange={setPromoId}
        />
      </div>

      {/* ── Submit ── */}
      <button
        type="submit"
        className="casino-btn-primary w-full py-3.5 text-sm font-bold"
      >
        下一步：确认详情
      </button>
    </form>
  );
}
