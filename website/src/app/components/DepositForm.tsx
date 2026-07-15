'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { PublicPromotion } from '@/lib/types';
import PromotionSelector from './PromotionSelector';
import DepositSummary from './DepositSummary';


interface PaymentBank {
  id: number;
  bank_name: string;
  account_number: string;
  account_name: string;
  qr_media_id: number | null;
  instructions: string | null;
}

interface GameAccount {
  assigned:        boolean;
  username?:       string;
  password?:       string;
  can_change?:     boolean;
  next_change_at?: string | null;
}

interface SuccessData {
  id: number;
  amount: number;
  provider: string;
  bankName: string;
  promoName: string | null;
  submittedAt: string;
}

type Step = 'form' | 'confirm' | 'success';

// ── CSS ───────────────────────────────────────────────────────────────────────
const FORM_CSS = `
@keyframes deposit-shake {
  0%, 100% { transform: translateX(0); }
  15%, 45%, 75% { transform: translateX(-6px); }
  30%, 60%, 90% { transform: translateX(6px); }
}
.deposit-shake { animation: deposit-shake 0.45s ease; }

@keyframes toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
.toast-anim { animation: toast-in 0.2s ease forwards; }
`;

// ── Error Toast (red) ─────────────────────────────────────────────────────────
function Toast({ msg, onDismiss }: { msg: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [msg, onDismiss]);
  return (
    <div onClick={onDismiss}
      className="fixed top-4 left-1/2 z-50 toast-anim cursor-pointer"
      style={{ transform: 'translateX(-50%)', maxWidth: 'calc(100vw - 2rem)' }}>
      <div className="px-4 py-3 rounded-xl text-sm font-medium shadow-xl text-white"
        style={{ background: 'rgba(220,38,38,0.97)', backdropFilter: 'blur(8px)' }}>
        ⚠️ {msg}
      </div>
    </div>
  );
}

// ── Copy Toast (green) ────────────────────────────────────────────────────────
function CopyToast({ msg, onDismiss }: { msg: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 2000);
    return () => clearTimeout(t);
  }, [msg, onDismiss]);
  return (
    <div onClick={onDismiss}
      className="fixed top-4 left-1/2 z-50 toast-anim cursor-pointer"
      style={{ transform: 'translateX(-50%)', maxWidth: 'calc(100vw - 2rem)' }}>
      <div className="px-4 py-2.5 rounded-xl text-sm font-medium shadow-xl text-white whitespace-nowrap"
        style={{ background: 'rgba(22,163,74,0.97)', backdropFilter: 'blur(8px)' }}>
        ✓ {msg}
      </div>
    </div>
  );
}

// ── Step Header ───────────────────────────────────────────────────────────────
function StepHeader({ n, title, done }: { n: number; title: string; done?: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
        style={{
          background: done ? 'rgba(34,197,94,0.15)' : 'var(--brand-primary)',
          color:      done ? '#22c55e' : '#fff',
          border:     done ? '1px solid rgba(34,197,94,0.4)' : 'none',
        }}>
        {done ? '✓' : n}
      </div>
      <p className="text-sm font-bold" style={{ color: 'var(--text-base)' }}>{title}</p>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function inputStyle(focused = false, error = false) {
  return {
    background: 'var(--bg-surface3)',
    border: `1px solid ${error ? '#ef4444' : focused ? 'var(--brand-primary)' : 'var(--border-mid)'}`,
    color: 'var(--text-base)',
    outline: 'none',
    boxShadow: error
      ? '0 0 0 2px rgba(239,68,68,0.18)'
      : focused
        ? '0 0 0 2px color-mix(in srgb, var(--brand-primary) 20%, transparent)'
        : 'none',
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

// ── Bank Card ─────────────────────────────────────────────────────────────────
function BankCard({ bank, selected, hasError, onSelect, memberPhone, onCopy }: {
  bank: PaymentBank;
  selected: boolean;
  hasError: boolean;
  onSelect: () => void;
  memberPhone: string;
  onCopy: (msg: string) => void;
}) {
  const [showQr, setShowQr] = useState(false);

  function copyText(text: string, label: string, e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => onCopy(label)).catch(() => {});
  }

  return (
    <div onClick={onSelect}
      className="casino-card p-4 space-y-3 cursor-pointer transition-all"
      style={{
        border: selected
          ? '2px solid var(--brand-primary)'
          : hasError
            ? '2px solid rgba(239,68,68,0.5)'
            : '2px solid var(--border-dim)',
        boxShadow: selected
          ? '0 0 14px color-mix(in srgb, var(--brand-primary) 25%, transparent)'
          : 'none',
      }}>

      {/* Bank header row */}
      <div className="flex items-center gap-3">
        <div className="w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center"
          style={{
            borderColor: selected ? 'var(--brand-primary)' : 'var(--border-mid)',
            background:  selected ? 'var(--brand-primary)' : 'transparent',
          }}>
          {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
        </div>
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--text-base)' }}>{bank.bank_name}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{bank.account_name}</p>
        </div>
      </div>

      {/* Account number row */}
      <div className="rounded-xl px-3 py-2.5 flex items-center justify-between gap-3"
        style={{ background: 'var(--bg-surface3)', border: '1px solid var(--border-dim)' }}
        onClick={e => e.stopPropagation()}>
        <div>
          <p className="text-xs mb-0.5" style={{ color: 'var(--text-faint)' }}>账号 Account Number</p>
          <p className="text-base font-mono font-bold tracking-wide" style={{ color: 'var(--brand-primary)' }}>
            {bank.account_number}
          </p>
        </div>
        <button type="button"
          onClick={e => copyText(bank.account_number, 'Account Number copied', e)}
          className="shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
          style={{ background: 'color-mix(in srgb, var(--brand-primary) 12%, transparent)', color: 'var(--brand-primary)', border: '1px solid color-mix(in srgb, var(--brand-primary) 30%, transparent)' }}>
          Copy
        </button>
      </div>

      {/* REF row */}
      {memberPhone && (
        <div className="rounded-xl px-3 py-2.5"
          style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.22)' }}
          onClick={e => e.stopPropagation()}>
          <p className="text-xs font-bold mb-1" style={{ color: '#b45309' }}>
            Reference / Remark / 备注
          </p>
          <p className="text-xs mb-2" style={{ color: 'var(--text-faint)' }}>
            转账备注请填写您的注册手机号
          </p>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-mono font-bold" style={{ color: 'var(--text-base)' }}>
              {memberPhone}
            </p>
            <button type="button"
              onClick={e => copyText(memberPhone, 'Reference copied', e)}
              className="shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
              style={{ background: 'rgba(234,179,8,0.12)', color: '#b45309', border: '1px solid rgba(234,179,8,0.35)' }}>
              Copy REF
            </button>
          </div>
        </div>
      )}

      {/* QR code toggle */}
      {bank.qr_media_id && (
        <div onClick={e => e.stopPropagation()}>
          <button type="button" onClick={() => setShowQr(v => !v)}
            className="text-xs px-3 py-1 rounded-lg"
            style={{ background: 'var(--bg-surface3)', color: 'var(--text-muted)', border: '1px solid var(--border-dim)' }}>
            {showQr ? '收起 QR' : '显示 QR 码'}
          </button>
          {showQr && (
            <div className="flex justify-center pt-2">
              <img src={`/api/public/media/${bank.qr_media_id}`} alt="QR"
                className="w-40 h-40 object-contain rounded-lg"
                style={{ background: '#fff', padding: 4 }} />
            </div>
          )}
        </div>
      )}

      {bank.instructions && (
        <p className="text-xs rounded-lg px-3 py-2"
          style={{ background: 'rgba(234,179,8,0.08)', color: '#b45309', border: '1px solid rgba(234,179,8,0.2)' }}>
          ⚠️ {bank.instructions}
        </p>
      )}
    </div>
  );
}

// ── Game Account Section ──────────────────────────────────────────────────────
function GameAccountSection({ provider, account, onClaim, onChange, loading, acting, onCopy }: {
  provider: string; account: GameAccount | null; onClaim: () => void; onChange: () => void;
  loading: boolean; acting: boolean; onCopy: (msg: string) => void;
}) {
  function copyText(text: string, label: string, e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => onCopy(label)).catch(() => {});
  }

  if (loading) {
    return (
      <div className="casino-card p-4 text-center text-xs" style={{ color: 'var(--text-faint)' }}>
        查询游戏账号中…
      </div>
    );
  }
  if (!account || !account.assigned) {
    return (
      <div className="casino-card p-4 flex items-center justify-between gap-3"
        style={{ border: '1px dashed var(--border-mid)' }}>
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-base)' }}>
            您还没有 {provider} 账号
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
            领取后系统自动填入用户名
          </p>
        </div>
        <button type="button" onClick={onClaim} disabled={acting}
          className="casino-btn-primary px-4 py-2 text-xs font-bold shrink-0 disabled:opacity-50">
          {acting ? '领取中…' : '领取账号'}
        </button>
      </div>
    );
  }
  return (
    <div className="casino-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>
          {provider} 游戏账号
        </span>
        {account.can_change ? (
          <button type="button" onClick={onChange} disabled={acting}
            className="text-xs px-3 py-1 rounded-lg disabled:opacity-50"
            style={{ background: 'var(--bg-surface3)', color: 'var(--text-muted)', border: '1px solid var(--border-dim)' }}>
            {acting ? '更换中…' : '更换账号'}
          </button>
        ) : (
          <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
            {account.next_change_at
              ? `冷却至 ${new Date(account.next_change_at).toLocaleDateString('zh-CN')}`
              : ''}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {/* Username */}
        <div className="rounded-xl px-3 py-2 flex items-center justify-between gap-2"
          style={{ background: 'var(--bg-surface3)', border: '1px solid var(--border-dim)' }}>
          <div className="min-w-0">
            <p className="text-xs" style={{ color: 'var(--text-faint)' }}>用户名</p>
            <p className="text-sm font-mono font-bold mt-0.5 truncate" style={{ color: 'var(--text-base)' }}>
              {account.username}
            </p>
          </div>
          <button type="button"
            onClick={e => copyText(account.username ?? '', 'Game Username copied', e)}
            className="shrink-0 text-xs px-2 py-1 rounded-lg"
            style={{ background: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)', color: 'var(--brand-primary)', border: '1px solid color-mix(in srgb, var(--brand-primary) 25%, transparent)' }}>
            Copy
          </button>
        </div>
        {/* Password */}
        <div className="rounded-xl px-3 py-2 flex items-center justify-between gap-2"
          style={{ background: 'var(--bg-surface3)', border: '1px solid var(--border-dim)' }}>
          <div className="min-w-0">
            <p className="text-xs" style={{ color: 'var(--text-faint)' }}>密码</p>
            <p className="text-sm font-mono font-bold mt-0.5 truncate" style={{ color: 'var(--text-base)' }}>
              {account.password}
            </p>
          </div>
          <button type="button"
            onClick={e => copyText(account.password ?? '', 'Password copied', e)}
            className="shrink-0 text-xs px-2 py-1 rounded-lg"
            style={{ background: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)', color: 'var(--brand-primary)', border: '1px solid color-mix(in srgb, var(--brand-primary) 25%, transparent)' }}>
            Copy
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Receipt Upload ─────────────────────────────────────────────────────────────
function ReceiptUpload({ mediaId, preview, uploading, hasError, onFile, onDelete }: {
  mediaId: number | null; preview: string | null; uploading: boolean;
  hasError: boolean; onFile: (file: File) => void; onDelete: () => void;
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
            className="w-full max-h-56 object-contain rounded-xl"
            style={{ background: 'var(--bg-surface3)', border: `1px solid ${hasError ? 'rgba(239,68,68,0.6)' : 'var(--border-mid)'}` }} />

          {/* Overlay controls */}
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
          style={{
            borderColor: hasError ? 'rgba(239,68,68,0.6)' : uploading ? 'var(--brand-primary)' : 'var(--border-mid)',
            background:  hasError ? 'rgba(239,68,68,0.03)' : 'transparent',
          }}
          onClick={trigger}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}>
          <p className="text-2xl mb-2 pointer-events-none">{uploading ? '⏳' : '📎'}</p>
          <p className="text-sm font-medium pointer-events-none"
            style={{ color: hasError ? '#ef4444' : 'var(--text-muted)' }}>
            {uploading ? '上传中…' : '点击上传转账截图'}
          </p>
          <p className="text-xs mt-1 pointer-events-none" style={{ color: 'var(--text-faint)' }}>
            支持 JPG / PNG / WEBP，最大 10MB
          </p>
        </div>
      )}
      <input ref={inputRef} type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden" onChange={handleChange} disabled={uploading}
        aria-label="上传凭证" />
    </div>
  );
}

// ── Change Account Modal ──────────────────────────────────────────────────────
function ChangeAccountModal({ onConfirm, onCancel, loading }: {
  onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onCancel}>
      <div className="casino-card w-full max-w-sm p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold" style={{ color: 'var(--text-base)' }}>确认更换游戏账号？</h3>
        <div className="space-y-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
          <p>• 当前账号将立即释放回账号池</p>
          <p>• 系统会自动分配一个新的账号</p>
          <p className="font-semibold mt-2" style={{ color: '#f87171' }}>⚠️ 更换后无法恢复旧账号。</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} disabled={loading}
            className="casino-btn-outline flex-1 text-sm font-medium">取消</button>
          <button type="button" onClick={onConfirm} disabled={loading}
            className="casino-btn-primary flex-1 text-sm font-bold disabled:opacity-50">
            {loading ? '更换中…' : '确认更换'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Transfer Instructions ─────────────────────────────────────────────────────
function TransferInstructions({ amount, phone }: { amount: number; phone: string }) {
  return (
    <div className="rounded-xl px-4 py-3.5 space-y-2"
      style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.18)' }}>
      <p className="text-xs font-bold tracking-wider uppercase mb-1" style={{ color: '#3b82f6' }}>
        📋 转账说明 Transfer Instructions
      </p>
      <div className="space-y-1.5 text-xs" style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>
        <p>
          • 请转账 <strong style={{ color: 'var(--text-base)' }}>
            {amount > 0 ? `RM ${amount.toFixed(2)}` : '您输入的存款金额'}
          </strong>（必须与存款金额完全一致）
        </p>
        <p>
          • 转账备注请填写：<strong style={{ color: 'var(--text-base)' }}>
            {phone || '您的注册手机号'}
          </strong>
        </p>
        <p>• 每笔交易只上传 <strong style={{ color: 'var(--text-base)' }}>1 张</strong> 转账凭证</p>
        <p>• 审核通常在 <strong style={{ color: 'var(--text-base)' }}>几分钟内</strong> 完成</p>
      </div>
    </div>
  );
}

// ── Main DepositForm ──────────────────────────────────────────────────────────
export default function DepositForm() {
  const [step,          setStep]          = useState<Step>('form');
  const [amount,        setAmount]        = useState('');
  const [provider,      setProvider]      = useState('');
  const [selectedBankId, setSelectedBankId] = useState<number | null>(null);
  const [promoId,       setPromoId]       = useState<number | null>(null);
  const [focusedField,  setFocusedField]  = useState('');
  const [submitting,    setSubmitting]    = useState(false);
  const [successData,   setSuccessData]   = useState<SuccessData | null>(null);
  const [countdown,     setCountdown]     = useState(5);

  // ── Member ────────────────────────────────────────────────────────────────
  const [memberPhone,   setMemberPhone]   = useState('');

  // ── Toast ─────────────────────────────────────────────────────────────────
  const [toast,         setToast]         = useState('');
  const [copyToast,     setCopyToast]     = useState('');

  // ── Data ──────────────────────────────────────────────────────────────────
  const [gameProviders, setGameProviders] = useState<string[]>([]);
  const [promotions,    setPromotions]    = useState<PublicPromotion[]>([]);
  const [platformBanks, setPlatformBanks] = useState<PaymentBank[]>([]);
  const [banksLoaded,   setBanksLoaded]   = useState(false);
  const [minAmount,          setMinAmount]          = useState(30);
  const [walletBalance,      setWalletBalance]      = useState<number | null>(null);
  const [maxBalanceDeposit,  setMaxBalanceDeposit]  = useState(0); // 0 = unlimited

  // ── Validation ────────────────────────────────────────────────────────────
  const [errorFields,   setErrorFields]   = useState<Set<string>>(new Set());
  const [shakingFields, setShakingFields] = useState<Set<string>>(new Set());

  // ── Game account ──────────────────────────────────────────────────────────
  const [gameAccount,       setGameAccount]       = useState<GameAccount | null>(null);
  const [loadingAccount,    setLoadingAccount]    = useState(false);
  const [actingAccount,     setActingAccount]     = useState(false);
  const [accountError,      setAccountError]      = useState('');
  const [showChangeConfirm, setShowChangeConfirm] = useState(false);

  // ── Receipt ───────────────────────────────────────────────────────────────
  const [receiptMediaId,   setReceiptMediaId]   = useState<number | null>(null);
  const [receiptPreview,   setReceiptPreview]   = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const amountRef   = useRef<HTMLDivElement>(null);
  const providerRef = useRef<HTMLDivElement>(null);
  const bankRef     = useRef<HTMLDivElement>(null);

  // ── Load game providers from CMS ─────────────────────────────────────────
  useEffect(() => {
    fetch('/api/public/game-providers')
      .then(r => r.ok ? r.json() as Promise<Array<{ provider_name: string }>> : [])
      .then(list => setGameProviders((list as Array<{ provider_name: string }>).map(p => p.provider_name)))
      .catch(() => {});
  }, []);

  // ── Member phone fetch ────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() as Promise<{ phone?: string }> : null)
      .then(d => { if (d?.phone) setMemberPhone(d.phone); })
      .catch(() => {});
  }, []);

  // ── Load promotions + settings + balance ─────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch('/api/member/promotions/eligible').then(r => r.ok ? r.json() as Promise<PublicPromotion[]> : []),
      fetch('/api/public/settings').then(r => r.ok ? r.json() as Promise<Record<string, string>> : {}),
      fetch('/api/member/profile').then(r => r.ok ? r.json() as Promise<{ total_deposit: string; total_withdraw: string }> : null),
    ]).then(([promos, settings, profile]) => {
      setPromotions(promos as PublicPromotion[]);
      const s = settings as Record<string, string>;
      if (s.deposit_min_amount)        setMinAmount(parseFloat(s.deposit_min_amount) || 30);
      if (s.wallet_max_balance_deposit) setMaxBalanceDeposit(parseFloat(s.wallet_max_balance_deposit) || 0);
      if (profile) {
        const bal = parseFloat(profile.total_deposit || '0') - parseFloat(profile.total_withdraw || '0');
        setWalletBalance(bal);
      }
    }).catch(() => {});
  }, []);

  // ── Load banks (filtered by provider) ────────────────────────────────────
  const loadBanks = useCallback(async (prov: string) => {
    setBanksLoaded(false);
    setSelectedBankId(null);
    const url = prov
      ? `/api/public/payment-banks?provider=${encodeURIComponent(prov)}`
      : '/api/public/payment-banks';
    const r = await fetch(url);
    setPlatformBanks(r.ok ? await r.json() as PaymentBank[] : []);
    setBanksLoaded(true);
  }, []);

  useEffect(() => { void loadBanks(''); }, [loadBanks]);
  useEffect(() => { if (provider) void loadBanks(provider); }, [provider, loadBanks]);

  // ── Load game account ─────────────────────────────────────────────────────
  const fetchGameAccount = useCallback(async (p: string) => {
    setLoadingAccount(true);
    setGameAccount(null);
    try {
      const r = await fetch(`/api/member/game-accounts?provider=${encodeURIComponent(p)}`);
      if (r.ok) setGameAccount(await r.json() as GameAccount);
    } finally { setLoadingAccount(false); }
  }, []);

  useEffect(() => {
    if (provider) void fetchGameAccount(provider);
    else { setGameAccount(null); setLoadingAccount(false); }
  }, [provider, fetchGameAccount]);

  // ── Success countdown + redirect ─────────────────────────────────────────
  useEffect(() => {
    if (step !== 'success') return;
    setCountdown(5);
    const id = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { window.location.assign('/history'); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  // ── Actions ───────────────────────────────────────────────────────────────
  function showCopyToast(msg: string) { setCopyToast(msg); }
  function showErrorToast(msg: string) { setToast(msg); }

  function triggerShake(fields: Set<string>) {
    setShakingFields(new Set(fields));
    setTimeout(() => setShakingFields(new Set()), 500);
  }

  function scrollToRef(ref: React.RefObject<HTMLDivElement | null>) {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function clearError(field: string) {
    setErrorFields(prev => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev); next.delete(field); return next;
    });
  }

  async function handleClaim() {
    setActingAccount(true); setAccountError('');
    try {
      const r = await fetch('/api/member/game-accounts/claim', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const d = await r.json() as { ok?: boolean; username?: string; password?: string; error?: string };
      if (r.ok && d.ok) setGameAccount({ assigned: true, username: d.username, password: d.password, can_change: false });
      else setAccountError(d.error ?? '领取账号失败，请联系客服');
    } finally { setActingAccount(false); }
  }

  async function handleChangeAccount() {
    setShowChangeConfirm(false); setActingAccount(true); setAccountError('');
    try {
      const r = await fetch('/api/member/game-accounts/change', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const d = await r.json() as { ok?: boolean; username?: string; password?: string; error?: string };
      if (r.ok && d.ok) {
        setGameAccount({ assigned: true, username: d.username, password: d.password, can_change: false });
        showCopyToast('账号更换成功');
      } else {
        setAccountError(d.error ?? '更换账号失败，请重试');
      }
    } finally { setActingAccount(false); }
  }

  async function handleReceiptFile(file: File) {
    setUploadingReceipt(true);
    setReceiptPreview(URL.createObjectURL(file));
    setReceiptMediaId(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await fetch('/api/member/uploads/receipt', { method: 'POST', body: form });
      const d = await r.json() as { ok?: boolean; media_id?: number; error?: string };
      if (r.ok && d.media_id) { setReceiptMediaId(d.media_id); clearError('receipt'); }
      else { showErrorToast(d.error ?? '上传凭证失败，请重试'); setReceiptPreview(null); }
    } finally { setUploadingReceipt(false); }
  }

  function handleDeleteReceipt() {
    setReceiptPreview(null);
    setReceiptMediaId(null);
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const numAmount     = parseFloat(amount) || 0;
  const selectedPromo = promotions.find(p => p.id === promoId) ?? null;
  const bonusAmount   = selectedPromo ? calcBonus(selectedPromo, numAmount) : 0;
  const turnoverReq   = selectedPromo && bonusAmount > 0 ? bonusAmount * parseFloat(selectedPromo.turnover_multiplier) : 0;
  const selectedBank  = platformBanks.find(b => b.id === selectedBankId) ?? null;
  const allMaintenance = banksLoaded && platformBanks.length === 0;

  // ── Smart submit button ───────────────────────────────────────────────────
  function getSubmitButton(): { text: string; disabled: boolean } {
    if (uploadingReceipt)                  return { text: '等待凭证上传…', disabled: true };
    if (!amount || numAmount < minAmount)   return { text: `最低 RM ${minAmount}`, disabled: true };
    if (!allMaintenance && !selectedBankId) return { text: '请选择收款银行', disabled: true };
    if (!provider)                          return { text: '请先选择游戏', disabled: true };
    return { text: '下一步：确认详情 →', disabled: false };
  }

  // ── Form submit ───────────────────────────────────────────────────────────
  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errors = new Set<string>();
    if (numAmount < minAmount)               errors.add('amount');
    if (!provider)                           errors.add('provider');
    if (!allMaintenance && !selectedBankId)  errors.add('bank');
    if (uploadingReceipt)                    errors.add('receipt');

    if (errors.size > 0) {
      setErrorFields(errors);
      triggerShake(errors);
      const labels: string[] = [];
      if (errors.has('amount'))   labels.push('存款金额');
      if (errors.has('bank'))     labels.push('收款银行');
      if (errors.has('provider')) labels.push('游戏选择');
      if (errors.has('receipt'))  labels.push('等待凭证上传');
      showErrorToast(`请完成：${labels.join('、')}`);
      if (errors.has('amount'))        scrollToRef(amountRef);
      else if (errors.has('bank'))     scrollToRef(bankRef);
      else if (errors.has('provider')) scrollToRef(providerRef);
      return;
    }
    setErrorFields(new Set());
    setStep('confirm');
  }

  // ── Confirm submit ────────────────────────────────────────────────────────
  async function handleConfirm() {
    setSubmitting(true);
    try {
      const res = await fetch('/api/member/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount:            numAmount,
          provider,
          receiving_bank_id: selectedBankId,
          promotion_id:      promoId ?? undefined,
          receipt_media_id:  receiptMediaId ?? undefined,
        }),
      });
      const data = await res.json() as { ok?: boolean; id?: number; error?: string };
      if (res.ok && data.id) {
        setSuccessData({
          id: data.id, amount: numAmount, provider,
          bankName:  selectedBank?.bank_name ?? '',
          promoName: selectedPromo?.name ?? null,
          submittedAt: new Date().toISOString(),
        });
        setStep('success');
      } else {
        showErrorToast(data.error ?? '提交失败，请重试');
        setStep('form');
      }
    } catch {
      showErrorToast('网络错误，请重试');
      setStep('form');
    } finally { setSubmitting(false); }
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (step === 'success' && successData) {
    const dt = new Date(successData.submittedAt);
    return (
      <div className="space-y-3">
        {/* Hero */}
        <div className="casino-card p-5 text-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl"
            style={{ background: 'rgba(34,197,94,0.15)' }}>✓</div>
          <h2 className="text-base font-bold mb-1" style={{ color: '#22c55e' }}>存款申请已提交</h2>
          <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
            请完成转账，我们将在审核后为您存入账户
          </p>
          <div className="inline-flex items-center gap-5 rounded-xl px-5 py-3"
            style={{ background: 'var(--bg-surface3)', border: '1px solid var(--border-dim)' }}>
            <div className="text-center">
              <p className="text-xs" style={{ color: 'var(--text-faint)' }}>流水号</p>
              <p className="font-mono font-bold text-sm" style={{ color: 'var(--text-base)' }}>
                #{successData.id}
              </p>
            </div>
            <div className="w-px h-8" style={{ background: 'var(--border-dim)' }} />
            <div className="text-center">
              <p className="text-xs" style={{ color: 'var(--text-faint)' }}>状态</p>
              <p className="font-semibold text-sm" style={{ color: '#f59e0b' }}>待审核</p>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="casino-card p-4">
          <p className="text-xs font-bold tracking-wider uppercase mb-3" style={{ color: 'var(--text-muted)' }}>
            申请详情
          </p>
          <div className="space-y-3">
            {[
              { label: '存款金额', value: `RM ${successData.amount.toFixed(2)}`, brand: true },
              { label: '游戏平台', value: successData.provider },
              { label: '优惠活动', value: successData.promoName ?? '不使用优惠' },
              { label: '收款银行', value: successData.bankName || '—' },
              {
                label: '提交时间',
                value: dt.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
              },
              { label: '预计状态', value: '待审核', amber: true },
            ].map(({ label, value, brand, amber }) => (
              <div key={label} className="flex items-center justify-between gap-4 text-sm">
                <span style={{ color: 'var(--text-faint)' }}>{label}</span>
                <span className="font-semibold text-right"
                  style={{ color: brand ? 'var(--brand-primary)' : amber ? '#f59e0b' : 'var(--text-base)' }}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA + countdown */}
        <a href="/history"
          className="casino-btn-primary w-full text-sm font-bold text-center block">
          查看存款记录
        </a>
        <p className="text-center text-xs" style={{ color: 'var(--text-faint)' }}>
          {countdown > 0 ? `${countdown} 秒后自动跳转至存款记录` : '正在跳转…'}
        </p>
      </div>
    );
  }

  // ── Confirm screen ────────────────────────────────────────────────────────
  if (step === 'confirm') {
    return (
      <DepositSummary
        amount={numAmount}
        provider={provider}
        paymentBank={selectedBank?.bank_name ?? ''}
        promotion={selectedPromo}
        bonusAmount={bonusAmount}
        turnoverRequired={turnoverReq}
        onConfirm={handleConfirm}
        onBack={() => setStep('form')}
        submitting={submitting}
      />
    );
  }

  // ── Form screen ───────────────────────────────────────────────────────────

  // Balance limit check (Part 7)
  const balanceLimitActive =
    maxBalanceDeposit > 0 &&
    walletBalance !== null &&
    walletBalance >= maxBalanceDeposit;

  if (balanceLimitActive) {
    return (
      <div className="rounded-2xl p-6 text-center space-y-4"
        style={{ background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,0.3)' }}>
        <div className="text-3xl">⛔</div>
        <h3 className="text-base font-bold" style={{ color: '#ef4444' }}>存款已暂停</h3>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          您的钱包余额已达到最高限额 <strong style={{ color: 'var(--text-base)' }}>RM {maxBalanceDeposit.toFixed(2)}</strong>，
          暂时无法进行存款。
        </p>
        <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
          请先进行提款，待余额低于限额后再存款。
        </p>
        <a href="/withdraw"
          className="casino-btn-primary inline-block px-6 py-2.5 text-sm font-semibold rounded-xl">
          前往提款
        </a>
      </div>
    );
  }

  const submitBtn = getSubmitButton();

  // Step completion states for visual feedback
  const step1Done = numAmount >= minAmount;
  const step2Done = allMaintenance || !!selectedBankId;   // Bank is step 2
  const step3Done = !!provider && !!gameAccount?.assigned; // Provider is step 3
  const step4Done = true; // Promo optional

  return (
    <>
      <style>{FORM_CSS}</style>

      {toast     && <Toast     msg={toast}     onDismiss={() => setToast('')}     />}
      {copyToast && <CopyToast msg={copyToast} onDismiss={() => setCopyToast('')} />}

      {showChangeConfirm && (
        <ChangeAccountModal
          onConfirm={handleChangeAccount}
          onCancel={() => setShowChangeConfirm(false)}
          loading={actingAccount}
        />
      )}

      <form onSubmit={handleFormSubmit} className="space-y-4 pb-24">

        {/* ── Step 1: Amount ─────────────────────────────────────────────── */}
        <div ref={amountRef}
          className={`casino-card p-4 ${shakingFields.has('amount') ? 'deposit-shake' : ''}`}
          style={{ border: errorFields.has('amount') ? '1px solid rgba(239,68,68,0.45)' : undefined }}>
          <StepHeader n={1} title="存款金额 Deposit Amount" done={step1Done} />

          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-sm"
              style={{ color: 'var(--text-faint)' }}>RM</span>
            <input
              type="number" value={amount}
              onChange={e => { setAmount(e.target.value); clearError('amount'); }}
              onFocus={() => setFocusedField('amount')}
              onBlur={() => setFocusedField('')}
              min={minAmount} step="1" placeholder="输入存款金额"
              className="w-full pl-10 pr-4 py-2 rounded-xl text-sm"
              style={inputStyle(focusedField === 'amount', errorFields.has('amount'))}
            />
          </div>

          {/* Quick amounts */}
          <div className="flex gap-2 mt-2">
            {[50, 100, 200, 500].map(v => (
              <button key={v} type="button"
                onClick={() => { setAmount(String(v)); clearError('amount'); }}
                className="flex-1 py-1.5 rounded-xl text-sm font-bold transition-all"
                style={numAmount === v
                  ? { background: 'var(--brand-primary)', color: '#fff' }
                  : { background: 'var(--bg-surface3)', color: 'var(--text-muted)', border: '1px solid var(--border-dim)' }}>
                {v}
              </button>
            ))}
          </div>

          {/* Min notice + real-time bonus preview */}
          <div className="mt-2 space-y-1.5">
            <p className="text-xs" style={{ color: numAmount > 0 && numAmount < minAmount ? '#ef4444' : 'var(--text-faint)' }}>
              最低存款 RM {minAmount}
              {numAmount > 0 && numAmount < minAmount && (
                <span className="ml-2 font-semibold">（当前 RM {numAmount} 不足）</span>
              )}
            </p>
            {selectedPromo && numAmount >= parseFloat(selectedPromo.min_deposit) && bonusAmount > 0 && (
              <div className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
                <span style={{ color: '#16a34a' }}>🎁 预计奖金</span>
                <span className="font-bold" style={{ color: '#16a34a' }}>+RM {bonusAmount.toFixed(2)}</span>
                <span style={{ color: 'var(--text-faint)' }}>（{selectedPromo.name}）</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Step 2: Receiving Bank ──────────────────────────────────────── */}
        <div ref={bankRef}
          className={`casino-card p-4 ${shakingFields.has('bank') ? 'deposit-shake' : ''}`}
          style={{ border: errorFields.has('bank') && !allMaintenance ? '1px solid rgba(239,68,68,0.45)' : undefined }}>
          <StepHeader n={2} title="选择收款银行 Receiving Bank" done={step2Done} />

          {!banksLoaded ? (
            <div className="py-6 text-center text-sm" style={{ color: 'var(--text-faint)' }}>加载中…</div>
          ) : allMaintenance ? (
            <div className="rounded-xl p-6 text-center"
              style={{ border: '1px solid rgba(234,179,8,0.3)', background: 'rgba(234,179,8,0.05)' }}>
              <p className="text-3xl mb-3">🔧</p>
              <p className="text-base font-bold mb-1" style={{ color: 'var(--text-base)' }}>所有收款账户目前维护中</p>
              <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>请联系客服或稍后再试</p>
              <a href="/chat" className="casino-btn-primary px-6 py-2 text-sm inline-block">联系客服</a>
            </div>
          ) : (
            <div className="space-y-3">
              {platformBanks.map(b => (
                <BankCard key={b.id} bank={b}
                  selected={selectedBankId === b.id}
                  hasError={errorFields.has('bank') && selectedBankId === null}
                  onSelect={() => { setSelectedBankId(b.id); clearError('bank'); }}
                  memberPhone={memberPhone}
                  onCopy={showCopyToast}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Step 3: Provider + Game Account ────────────────────────────── */}
        <div ref={providerRef}
          className={`casino-card p-4 ${shakingFields.has('provider') ? 'deposit-shake' : ''}`}
          style={{ border: errorFields.has('provider') ? '1px solid rgba(239,68,68,0.45)' : undefined }}>
          <StepHeader n={3} title="选择游戏 Select Provider" done={step3Done} />

          <div className="grid grid-cols-3 gap-2 mb-4">
            {gameProviders.map(g => (
              <button key={g} type="button"
                onClick={() => { setProvider(g); clearError('provider'); }}
                className="py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={provider === g
                  ? { background: 'var(--brand-primary)', color: '#fff', boxShadow: '0 0 12px color-mix(in srgb, var(--brand-primary) 40%, transparent)' }
                  : { background: 'var(--bg-surface3)', color: 'var(--text-muted)', border: `1px solid ${errorFields.has('provider') ? 'rgba(239,68,68,0.4)' : 'var(--border-dim)'}` }}>
                {g}
              </button>
            ))}
          </div>

          {provider && (
            <>
              {accountError && (
                <p className="text-xs mb-2 px-3 py-2 rounded-lg"
                  style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171' }}>
                  {accountError}
                </p>
              )}
              <GameAccountSection
                provider={provider} account={gameAccount}
                onClaim={handleClaim}
                onChange={() => setShowChangeConfirm(true)}
                loading={loadingAccount} acting={actingAccount}
                onCopy={showCopyToast}
              />
            </>
          )}
        </div>

        {/* ── Step 4: Promotion ───────────────────────────────────────────── */}
        {!allMaintenance && (
          <div className="casino-card p-4">
            <StepHeader n={4} title="优惠活动 Promotion（可选）" done={step4Done} />
            <PromotionSelector
              promotions={promotions}
              selectedId={promoId}
              depositAmount={numAmount}
              onChange={setPromoId}
            />
          </div>
        )}

        {/* ── Step 5: Transfer Instructions ──────────────────────────────── */}
        {!allMaintenance && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}>
                5
              </div>
              <p className="text-sm font-bold" style={{ color: 'var(--text-base)' }}>
                转账说明 Transfer Instructions
              </p>
            </div>
            <TransferInstructions amount={numAmount} phone={memberPhone} />
          </div>
        )}

        {/* ── Step 6: Receipt Upload ──────────────────────────────────────── */}
        {!allMaintenance && (
          <div className={shakingFields.has('receipt') ? 'deposit-shake' : ''}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{
                  background: receiptMediaId ? 'rgba(34,197,94,0.15)' : 'var(--brand-primary)',
                  color:      receiptMediaId ? '#22c55e' : '#fff',
                  border:     receiptMediaId ? '1px solid rgba(34,197,94,0.4)' : 'none',
                }}>
                {receiptMediaId ? '✓' : '6'}
              </div>
              <p className="text-sm font-bold" style={{ color: 'var(--text-base)' }}>
                上传转账凭证 Upload Receipt
                <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--text-faint)' }}>
                  （可选）
                </span>
              </p>
            </div>
            <ReceiptUpload
              mediaId={receiptMediaId} preview={receiptPreview}
              uploading={uploadingReceipt} hasError={errorFields.has('receipt')}
              onFile={handleReceiptFile} onDelete={handleDeleteReceipt}
            />
          </div>
        )}

        {/* ── Step 7: Sticky Submit ───────────────────────────────────────── */}
        {!allMaintenance && (
          <div className="sticky bottom-0 z-10 -mx-4 px-4 pb-4 pt-3"
            style={{
              background: 'linear-gradient(to top, var(--bg-base, #0f172a) 75%, transparent)',
            }}>
            <button type="submit"
              disabled={submitBtn.disabled}
              className="casino-btn-primary w-full text-sm font-bold rounded-xl transition-all"
              style={submitBtn.disabled
                ? { opacity: 0.55, cursor: 'not-allowed', boxShadow: 'none' }
                : { boxShadow: '0 4px 20px color-mix(in srgb, var(--brand-primary) 35%, transparent)' }}>
              {submitBtn.text}
            </button>
          </div>
        )}

      </form>
    </>
  );
}
