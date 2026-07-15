'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const MALAYSIA_BANKS = [
  'Maybank', 'CIMB Bank', 'Public Bank', 'RHB Bank', 'Hong Leong Bank',
  'AmBank', 'Bank Islam', 'Bank Rakyat', 'BSN', 'OCBC Bank', 'UOB Bank',
  'HSBC Bank', 'Standard Chartered', 'Alliance Bank', 'Affin Bank', 'Agrobank',
  'MBSB Bank', 'Bank Muamalat', 'Al Rajhi Bank', 'Citibank', 'GXBank',
  'Boost Bank', 'AEON Bank', "Touch 'n Go eWallet", 'ShopeePay', 'BigPay', 'Other',
];

export default function CompleteBankInformationPage() {
  const router = useRouter();

  const [bankName,      setBankName]      = useState('');
  const [holderName,    setHolderName]    = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [error,         setError]         = useState('');
  const [fieldErrors,   setFieldErrors]   = useState<Record<string, string>>({});
  const [submitting,    setSubmitting]    = useState(false);
  const [checking,      setChecking]      = useState(true);

  // On mount: call GET /api/member/bank.
  // If bank already bound, API sets bank_ok cookie and returns bank_complete: true → go home.
  // This handles Telegram members who activated web access with existing bank info.
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

  function validateAccount(v: string): string {
    if (!v) return '银行账号为必填项';
    if (!/^\d+$/.test(v)) return '银行账号只能包含数字';
    if (v.length < 6)  return '银行账号最少 6 位数字';
    if (v.length > 20) return '银行账号最多 20 位数字';
    return '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const errs: Record<string, string> = {};
    if (!bankName)            errs.bankName      = '请选择银行';
    if (!holderName.trim())   errs.holderName    = '账户持有人姓名为必填项';
    const acctErr = validateAccount(accountNumber);
    if (acctErr)              errs.accountNumber = acctErr;
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
        // bank_ok cookie set by API — now middleware will allow access
        router.push('/');
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
    /* Full-screen overlay covers header/nav so user cannot navigate away */
    <div className="fixed inset-0 z-[9999] overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      <div className="min-h-full flex flex-col items-center justify-center p-4 py-10">
        <div className="w-full max-w-sm">

          {/* Header */}
          <div className="text-center mb-8">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-3xl mx-auto mb-5"
              style={{
                background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))',
                boxShadow: '0 0 30px color-mix(in srgb, var(--brand-primary) 40%, transparent)',
              }}
            >
              🏦
            </div>
            <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-base)' }}>
              完善银行信息
            </h1>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              为保障账户安全及日后提款，请完善您的银行信息。
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
                    onChange={e => { setBankName(e.target.value); setFieldErrors(p => ({ ...p, bankName: '' })); }}
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
                  onChange={e => { setHolderName(e.target.value); setFieldErrors(p => ({ ...p, holderName: '' })); }}
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
                    const v = e.target.value.replace(/\D/g, '');
                    setAccountNumber(v);
                    setFieldErrors(p => ({ ...p, accountNumber: '' }));
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
              {submitting ? '提交中…' : '确认绑定银行账户'}
            </button>

            <p className="text-center text-xs pb-2" style={{ color: 'var(--text-faint)' }}>
              填写有误？请先{' '}
              <a href="/chat" style={{ color: 'var(--brand-primary)' }}>联系在线客服</a>
              {' '}确认正确信息后再提交
            </p>
          </form>

        </div>
      </div>
    </div>
  );
}
