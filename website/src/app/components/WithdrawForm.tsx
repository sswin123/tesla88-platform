'use client';
import { useState, useEffect, useRef } from 'react';
import { useMember } from '@/lib/contexts/MemberContext';
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

// ── Receipt Upload ────────────────────────────────────────────────────────────
function WithdrawReceiptUpload({ mediaId, preview, uploading, onFile, onDelete }: {
  mediaId: number | null; preview: string | null; uploading: boolean;
  onFile: (file: File) => void; onDelete: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  function trigger() { inputRef.current?.click(); }
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) { e.target.value = ''; onFile(file); }
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }
  return (
    <div>
      {preview ? (
        <div className="relative">
          <img src={preview} alt="Receipt"
            className="w-full max-h-48 object-contain rounded-xl"
            style={{ background: 'var(--bg-surface3)', border: '1px solid var(--border-mid)' }} />
          {!uploading && (
            <div className="absolute top-2 right-2 flex gap-1.5">
              <button type="button" onClick={trigger}
                className="text-xs px-2.5 py-1 rounded-lg font-medium"
                style={{ background: 'rgba(0,0,0,0.65)', color: '#fff' }}>
                重新上传
              </button>
              <button type="button" onClick={onDelete}
                className="text-xs px-2.5 py-1 rounded-lg font-medium"
                style={{ background: 'rgba(239,68,68,0.75)', color: '#fff' }}>
                删除
              </button>
            </div>
          )}
          {mediaId && !uploading && (
            <div className="absolute bottom-2 left-2 text-xs px-2 py-1 rounded-lg"
              style={{ background: 'rgba(34,197,94,0.85)', color: '#fff' }}>
              ✓ 已上传
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-xl"
              style={{ background: 'rgba(0,0,0,0.5)' }}>
              <p className="text-sm text-white">上传中…</p>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed p-4 text-center cursor-pointer transition-all select-none"
          style={{ borderColor: uploading ? 'var(--brand-primary)' : 'var(--border-mid)' }}
          onClick={trigger}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}>
          <p className="text-2xl mb-2 pointer-events-none">{uploading ? '⏳' : '📎'}</p>
          <p className="text-sm font-medium pointer-events-none" style={{ color: 'var(--text-muted)' }}>
            {uploading ? '上传中…' : '点击上传（可选）'}
          </p>
          <p className="text-xs mt-1 pointer-events-none" style={{ color: 'var(--text-faint)' }}>
            支持 JPG / PNG / WEBP，最大 10MB
          </p>
        </div>
      )}
      <input ref={inputRef} type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden" onChange={handleChange} disabled={uploading} />
    </div>
  );
}

export default function WithdrawForm() {
  const { profile, loading, updateProfile } = useMember();
  const [step, setStep]         = useState<Step>('form');
  const [amount, setAmount]     = useState('');
  const [focusedField, setFocusedField] = useState('');
  const [error, setError]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successId, setSuccessId]   = useState<number | null>(null);

  const [minAmount, setMinAmount] = useState(50);
  const [maxAmount, setMaxAmount] = useState(50000);
  const [currency, setCurrency] = useState('RM');
  const [decimals, setDecimals] = useState(2);

  // ── Receipt (optional) ───────────────────────────────────────────────────
  const [receiptMediaId,   setReceiptMediaId]   = useState<number | null>(null);
  const [receiptPreview,   setReceiptPreview]   = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [receiptError,     setReceiptError]     = useState('');

  useEffect(() => {
    fetch('/api/public/settings')
      .then(r => r.ok ? r.json() as Promise<Partial<Record<string, string>>> : Promise.resolve({} as Partial<Record<string, string>>))
      .then(settings => {
        if (settings.withdraw_min_amount)    setMinAmount(parseFloat(settings.withdraw_min_amount) || 50);
        if (settings.withdraw_max_amount)    setMaxAmount(parseFloat(settings.withdraw_max_amount) || 50000);
        if (settings.website_currency)       setCurrency(settings.website_currency);
        if (settings.website_decimal_places) setDecimals(parseInt(settings.website_decimal_places, 10) || 2);
      })
      .catch(() => {});
  }, []);

  const numAmount = parseFloat(amount) || 0;
  // Use available_balance (net_deposit - pending_withdrawal) as single source of truth
  const balance   = parseFloat(profile?.available_balance ?? profile?.net_deposit ?? '0');
  const pendingWd = parseFloat(profile?.pending_withdrawal ?? '0');

  async function handleReceiptFile(file: File) {
    setUploadingReceipt(true);
    setReceiptPreview(URL.createObjectURL(file));
    setReceiptMediaId(null);
    setReceiptError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await fetch('/api/member/uploads/receipt', { method: 'POST', body: form });
      const d = await r.json() as { ok?: boolean; media_id?: number; error?: string };
      if (r.ok && d.media_id) { setReceiptMediaId(d.media_id); }
      else { setReceiptError(d.error ?? '上传凭证失败，请重试'); setReceiptPreview(null); }
    } finally { setUploadingReceipt(false); }
  }

  function handleDeleteReceipt() {
    setReceiptPreview(null);
    setReceiptMediaId(null);
    setReceiptError('');
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!profile?.bank_account) { window.location.href = '/complete-bank-information'; return; }
    if (numAmount < minAmount)  { setError(`最低提款金额为 ${currency} ${minAmount.toFixed(decimals)}`); return; }
    if (numAmount > maxAmount)  { setError(`单笔提款上限为 ${currency} ${maxAmount.toFixed(decimals)}`); return; }
    if (numAmount > balance)    { setError(`可用余额不足，当前可提款 ${currency} ${balance.toFixed(decimals)}`); return; }
    if (uploadingReceipt)       { setError('请等待凭证上传完成'); return; }
    setStep('confirm');
  }

  async function handleConfirm() {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/member/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: numAmount,
          receipt_media_id: receiptMediaId ?? undefined,
        }),
      });
      const data = await res.json() as {
        ok?: boolean; id?: number; error?: string;
        available_balance?: string; pending_withdrawal?: string; net_deposit?: string;
      };
      if (res.ok && data.id) {
        /* API returns the post-trigger balance — optimistic-update the shared context
           so MemberPanel / MemberZoneSection / ProfileCard all reflect the lock immediately. */
        if (data.available_balance !== undefined) {
          updateProfile({
            available_balance:  data.available_balance,
            pending_withdrawal: data.pending_withdrawal ?? profile?.pending_withdrawal,
            net_deposit:        data.net_deposit        ?? profile?.net_deposit,
          });
        }
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
        <div className="flex justify-center mt-4">
          <a href="/history" className="casino-btn-outline px-6 text-sm">
            查看记录
          </a>
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
        currency={currency}
        decimals={decimals}
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
      <div className="casino-card p-4 space-y-2">
        <div>
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
            {currency} {balance.toFixed(decimals)}
          </p>
        </div>
        {pendingWd > 0 && (
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs"
            style={{ background: 'rgba(234,179,8,0.1)', color: '#ca8a04', border: '1px solid rgba(234,179,8,0.2)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span>
              提款中 {currency} {pendingWd.toFixed(decimals)} 已锁定，待审核完成后自动释放
            </span>
          </div>
        )}
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
        <InputLabel>提款金额 ({currency})</InputLabel>
        <div className="relative">
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold"
            style={{ color: 'var(--text-faint)' }}
          >
            {currency}
          </span>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            onFocus={() => setFocusedField('amount')}
            onBlur={() => setFocusedField('')}
            min={minAmount}
            max={maxAmount}
            step="1"
            placeholder={`最低 ${currency} ${minAmount}`}
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
        {/* All-in shortcut */}
        {balance > 0 && (
          <button
            type="button"
            onClick={() => setAmount(Math.floor(balance).toString())}
            className="mt-2 w-full py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{ background: 'var(--bg-surface3)', color: 'var(--text-muted)' }}
          >
            全部提款 ({currency} {Math.floor(balance)})
          </button>
        )}
      </div>

      {/* ── Optional Receipt Upload ── */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
            style={{
              background: receiptMediaId ? 'rgba(34,197,94,0.15)' : 'var(--bg-surface3)',
              color:      receiptMediaId ? '#22c55e' : 'var(--text-muted)',
              border:     receiptMediaId ? '1px solid rgba(34,197,94,0.4)' : '1px solid var(--border-mid)',
            }}>
            {receiptMediaId ? '✓' : '📎'}
          </div>
          <p className="text-sm font-bold" style={{ color: 'var(--text-base)' }}>
            上传凭证（可选）
            <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--text-faint)' }}>
              银行截图 / 转账记录
            </span>
          </p>
        </div>
        {receiptError && (
          <p className="text-xs mb-2 px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
            {receiptError}
          </p>
        )}
        <WithdrawReceiptUpload
          mediaId={receiptMediaId}
          preview={receiptPreview}
          uploading={uploadingReceipt}
          onFile={handleReceiptFile}
          onDelete={handleDeleteReceipt}
        />
      </div>

      <button
        type="submit"
        disabled={uploadingReceipt}
        className="casino-btn-primary w-full text-sm font-bold"
        style={uploadingReceipt ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
      >
        {uploadingReceipt ? '等待凭证上传…' : '下一步：确认详情'}
      </button>
    </form>
  );
}
