'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { MALAYSIA_BANKS, validateBankAccount, stripNonDigits } from '@/lib/bank';

// Three-step registration wizard indicator
function SetupWizard({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { num: 1, label: '创建账号', icon: '👤' },
    { num: 2, label: '银行信息', icon: '🏦' },
    { num: 3, label: '注册完成', icon: '🎉' },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', marginBottom: 24 }}>
      {steps.map((s, i) => (
        <div key={s.num} style={{ display: 'flex', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: s.num < step ? 14 : 15,
              fontWeight: 700,
              background: s.num < step
                ? 'var(--brand-primary)'
                : s.num === step
                  ? 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))'
                  : 'var(--bg-surface3)',
              color: s.num <= step ? '#fff' : 'var(--text-faint)',
              border: s.num > step ? '1.5px solid var(--border-mid)' : 'none',
              boxShadow: s.num === step ? '0 0 14px color-mix(in srgb, var(--brand-primary) 45%, transparent)' : 'none',
              flexShrink: 0,
            }}>
              {s.num < step ? '✓' : s.icon}
            </div>
            <span style={{
              fontSize: 9, fontWeight: s.num === step ? 700 : 400,
              color: s.num === step ? 'var(--text-base)' : 'var(--text-faint)',
              letterSpacing: '0.03em', whiteSpace: 'nowrap',
            }}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div style={{
              width: 32, height: 1.5, marginTop: 17, marginLeft: 4, marginRight: 4, flexShrink: 0,
              background: s.num < step ? 'var(--brand-primary)' : 'var(--border-dim)',
            }} />
          )}
        </div>
      ))}
    </div>
  );
}

// Step 3: Registration complete screen
function RegistrationComplete({ holderName }: { holderName: string }) {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.replace('/'), 3000);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <div className="w-full max-w-sm text-center">
      <SetupWizard step={3} />

      <div
        className="w-24 h-24 rounded-full flex items-center justify-center text-4xl mx-auto mb-5"
        style={{
          background: 'linear-gradient(135deg, #22c55e, #16a34a)',
          boxShadow: '0 0 36px rgba(34,197,94,0.45)',
        }}
      >
        🎉
      </div>

      <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-base)' }}>
        注册成功！
      </h1>
      <p className="text-sm mb-6" style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>
        欢迎，<strong style={{ color: 'var(--text-base)' }}>{holderName}</strong>！<br />
        您的账号已创建完成，银行信息已安全绑定。
      </p>

      <div
        className="rounded-xl p-4 mb-5 text-sm text-left space-y-2"
        style={{
          background: 'color-mix(in srgb, #22c55e 10%, transparent)',
          border: '1px solid color-mix(in srgb, #22c55e 25%, transparent)',
        }}
      >
        <p className="font-bold text-xs tracking-wider uppercase" style={{ color: '#22c55e' }}>
          ✅ 已完成设置
        </p>
        <p style={{ color: 'var(--text-muted)' }}>· 账号已激活</p>
        <p style={{ color: 'var(--text-muted)' }}>· 银行账户已绑定</p>
        <p style={{ color: 'var(--text-muted)' }}>· 可立即进行存款与取款</p>
      </div>

      <p className="text-xs mb-4" style={{ color: 'var(--text-faint)' }}>
        正在跳转至会员中心…
      </p>

      <button
        onClick={() => router.replace('/')}
        className="w-full py-3 rounded-xl text-sm font-bold"
        style={{
          background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))',
          color: '#fff',
          boxShadow: '0 4px 16px color-mix(in srgb, var(--brand-primary) 35%, transparent)',
          cursor: 'pointer',
        }}
      >
        立即进入会员中心 →
      </button>
    </div>
  );
}

export default function CompleteBankInformationPage() {
  const router = useRouter();

  const [bankName,      setBankName]      = useState('');
  const [holderName,    setHolderName]    = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [error,         setError]         = useState('');
  const [fieldErrors,   setFieldErrors]   = useState<Record<string, string>>({});
  const [submitting,    setSubmitting]    = useState(false);
  const [checking,      setChecking]      = useState(true);
  const [complete,      setComplete]      = useState(false);
  const [savedName,     setSavedName]     = useState('');

  const clearFieldError = useCallback((key: string) => {
    setFieldErrors(p => ({ ...p, [key]: '' }));
  }, []);

  // Check if bank already bound → redirect to home immediately
  useEffect(() => {
    fetch('/api/member/bank')
      .then(r => {
        if (r.status === 401) { router.replace('/login'); return null; }
        return r.json() as Promise<{ bank_complete?: boolean }>;
      })
      .then(d => {
        if (!d) return;
        if (d.bank_complete) {
          router.replace('/');
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const errs: Record<string, string> = {};
    if (!bankName)           errs.bankName      = '请选择银行';
    if (!holderName.trim())  errs.holderName    = '账户持有人姓名为必填项';
    const acctErr = validateBankAccount(accountNumber);
    if (acctErr)             errs.accountNumber = acctErr;
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
    setFieldErrors({});

    setSubmitting(true);
    try {
      const res = await fetch('/api/member/bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bank_name:        bankName,
          bank_holder_name: holderName.trim(),
          bank_account:     accountNumber,
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setSavedName(holderName.trim());
        setComplete(true);
      } else {
        setError(data.error ?? '提交失败，请重试');
      }
    } catch {
      setError('网络错误，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>验证中…</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      <div className="min-h-full flex flex-col items-center justify-center p-4 py-10">

        {complete ? (
          <RegistrationComplete holderName={savedName} />
        ) : (
          <div className="w-full max-w-sm">
            {/* Step 2 of 3 wizard */}
            <SetupWizard step={2} />

            <div className="text-center mb-7">
              <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-base)' }}>
                完善银行信息
              </h1>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                为保障账户安全及日后提款，请完善您的银行信息。<br />
                信息提交后将永久锁定，无法自行修改。
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="casino-card p-5 space-y-5">

                {/* Bank Name */}
                <div>
                  <label className="block text-xs font-bold tracking-wider uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
                    银行名称 <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={bankName}
                      onChange={e => { setBankName(e.target.value); clearFieldError('bankName'); }}
                      className="w-full rounded-lg px-4 py-3 text-sm appearance-none pr-10"
                      style={{
                        background: 'var(--bg-surface3)',
                        border: `1px solid ${fieldErrors.bankName ? '#ef4444' : 'var(--border-mid)'}`,
                        color: bankName ? 'var(--text-base)' : 'var(--text-faint)',
                        outline: 'none',
                      }}
                    >
                      <option value="">请选择银行</option>
                      {MALAYSIA_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--text-faint)' }}>▼</span>
                  </div>
                  {fieldErrors.bankName && <p className="mt-1 text-xs" style={{ color: '#ef4444' }}>{fieldErrors.bankName}</p>}
                </div>

                {/* Holder Name */}
                <div>
                  <label className="block text-xs font-bold tracking-wider uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
                    账户持有人姓名 <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={holderName}
                    onChange={e => { setHolderName(e.target.value); clearFieldError('holderName'); }}
                    placeholder="请输入与银行账户一致的姓名"
                    className="w-full rounded-lg px-4 py-3 text-sm"
                    style={{
                      background: 'var(--bg-surface3)',
                      border: `1px solid ${fieldErrors.holderName ? '#ef4444' : 'var(--border-mid)'}`,
                      color: 'var(--text-base)',
                      outline: 'none',
                    }}
                  />
                  {fieldErrors.holderName && <p className="mt-1 text-xs" style={{ color: '#ef4444' }}>{fieldErrors.holderName}</p>}
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-faint)' }}>
                    此姓名将成为您的官方会员身份，请填写真实姓名
                  </p>
                </div>

                {/* Account Number */}
                <div>
                  <label className="block text-xs font-bold tracking-wider uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
                    银行账号 <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={accountNumber}
                    onChange={e => {
                      const v = stripNonDigits(e.target.value);
                      setAccountNumber(v);
                      clearFieldError('accountNumber');
                    }}
                    placeholder="请输入完整银行账号（仅限数字）"
                    className="w-full rounded-lg px-4 py-3 text-sm font-mono"
                    style={{
                      background: 'var(--bg-surface3)',
                      border: `1px solid ${fieldErrors.accountNumber ? '#ef4444' : 'var(--border-mid)'}`,
                      color: 'var(--text-base)',
                      outline: 'none',
                    }}
                    maxLength={20}
                  />
                  {fieldErrors.accountNumber ? (
                    <p className="mt-1 text-xs" style={{ color: '#ef4444' }}>{fieldErrors.accountNumber}</p>
                  ) : accountNumber.length > 0 ? (
                    <p className="mt-1 text-xs" style={{ color: 'var(--text-faint)' }}>已输入 {accountNumber.length} 位</p>
                  ) : null}
                </div>
              </div>

              {/* Warning */}
              <div
                className="rounded-lg px-4 py-3 text-xs leading-relaxed"
                style={{
                  background: 'color-mix(in srgb, #f59e0b 10%, transparent)',
                  border: '1px solid color-mix(in srgb, #f59e0b 25%, transparent)',
                  color: '#d97706',
                }}
              >
                ⚠️ 重要提示：银行信息一经提交将永久锁定，如需修改必须通过客服核实身份后由管理员操作。请仔细核对，确认无误后再提交。
              </div>

              {error && (
                <div
                  className="rounded-lg px-4 py-3 text-sm text-center"
                  style={{
                    background: 'color-mix(in srgb, #ef4444 10%, transparent)',
                    border: '1px solid color-mix(in srgb, #ef4444 25%, transparent)',
                    color: '#ef4444',
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-xl text-sm font-bold"
                style={{
                  background: submitting ? 'var(--bg-surface3)' : 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))',
                  color: submitting ? 'var(--text-muted)' : '#fff',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  boxShadow: submitting ? 'none' : '0 4px 16px color-mix(in srgb, var(--brand-primary) 35%, transparent)',
                }}
              >
                {submitting ? '提交中…' : '完成注册 →'}
              </button>

              <p className="text-center text-xs pb-2" style={{ color: 'var(--text-faint)' }}>
                填写有误？请先{' '}
                <a href="/chat" style={{ color: 'var(--brand-primary)' }}>联系在线客服</a>
                {' '}确认正确信息后再提交
              </p>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
