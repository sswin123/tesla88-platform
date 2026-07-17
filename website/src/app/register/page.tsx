'use client';
import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const SHAKE_CSS = `
@keyframes reg-shake {
  0%,100% { transform: translateX(0); }
  20%,60% { transform: translateX(-5px); }
  40%,80% { transform: translateX(5px); }
}
.reg-shake { animation: reg-shake 0.4s ease; }
`;

function Toast({ msg, onDismiss }: { msg: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [msg, onDismiss]);
  return (
    <div onClick={onDismiss}
      className="fixed top-4 left-1/2 z-50 max-w-sm w-11/12 cursor-pointer"
      style={{ transform: 'translateX(-50%)' }}>
      <div className="text-sm font-medium px-4 py-3 rounded-xl shadow-xl text-white"
        style={{ background: 'rgba(220,38,38,0.97)' }}>
        {msg}
      </div>
    </div>
  );
}

function FieldInput({
  label, required: req, value, onChange, type = 'text', placeholder, autoComplete, focused, onFocus, onBlur, hasError,
}: {
  label: string; required?: boolean; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; autoComplete?: string;
  focused: boolean; onFocus: () => void; onBlur: () => void; hasError?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-bold tracking-wider uppercase mb-1.5"
        style={{ color: 'var(--text-muted)' }}>
        {label} {req && <span style={{ color: '#ef4444' }}>*</span>}
      </label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onFocus={onFocus}
        onBlur={onBlur}
        style={{
          width: '100%',
          height: 'var(--input-h)',
          padding: '0 12px',
          borderRadius: 'var(--radius-sm)',
          fontSize: '14px',
          background: hasError ? 'rgba(239,68,68,0.06)' : 'var(--bg-surface3)',
          border: `1px solid ${hasError ? '#ef4444' : focused ? 'var(--brand-primary)' : 'var(--border-mid)'}`,
          color: 'var(--text-base)',
          outline: 'none',
          boxShadow: focused && !hasError ? '0 0 0 2px color-mix(in srgb, var(--brand-primary) 15%, transparent)' : 'none',
        }}
      />
    </div>
  );
}

// Three-step registration wizard indicator
function SetupWizard({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { num: 1, label: '创建账号',  icon: '👤' },
    { num: 2, label: '银行信息',  icon: '🏦' },
    { num: 3, label: '注册完成',  icon: '🎉' },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', marginBottom: 20 }}>
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

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [phone,            setPhone]            = useState('');
  const [password,         setPassword]         = useState('');
  const [confirm,          setConfirm]          = useState('');
  const [referralCode,     setReferralCode]     = useState('');
  const [referralLocked,   setReferralLocked]   = useState(false);
  const [focused,          setFocused]          = useState('');

  const [errorFields,    setErrorFields]    = useState<Set<string>>(new Set());
  const [shakingFields,  setShakingFields]  = useState<Set<string>>(new Set());
  const [toast,          setToast]          = useState('');
  const [successMsg,     setSuccessMsg]     = useState('');
  const [loading,        setLoading]        = useState(false);
  const [duplicatePhone, setDuplicatePhone] = useState(false);
  const [telegramMember, setTelegramMember] = useState(false);
  const [regEnabled,     setRegEnabled]     = useState<boolean | null>(null);
  const [regFetchError,  setRegFetchError]  = useState(false);

  const phoneRef    = useRef<HTMLDivElement>(null);
  const passwordRef = useRef<HTMLDivElement>(null);
  const confirmRef  = useRef<HTMLDivElement>(null);

  // Referral session: detect ?ref= URL param, persist across refreshes
  useEffect(() => {
    const urlRef    = searchParams.get('ref')?.trim();
    const storedRef    = sessionStorage.getItem('referral_ref');
    const storedLocked = sessionStorage.getItem('referral_locked');

    if (urlRef) {
      setReferralCode(urlRef);
      setReferralLocked(true);
      sessionStorage.setItem('referral_ref',    urlRef);
      sessionStorage.setItem('referral_locked', 'true');
    } else if (storedRef && storedLocked === 'true') {
      setReferralCode(storedRef);
      setReferralLocked(true);
    }
  }, [searchParams]);

  useEffect(() => {
    fetch('/api/public/settings')
      .then(r => r.json())
      .then((d: Record<string, string>) => {
        setRegEnabled(d['website_registration'] === 'true');
      })
      .catch(() => setRegFetchError(true));
  }, []);

  function shakeField(field: string) {
    setShakingFields(prev => new Set(prev).add(field));
    setTimeout(() => setShakingFields(prev => { const n = new Set(prev); n.delete(field); return n; }), 450);
  }

  function clearError(field: string) {
    setErrorFields(prev => { const n = new Set(prev); n.delete(field); return n; });
  }

  const showToast = useCallback((msg: string) => setToast(msg), []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSuccessMsg(''); setDuplicatePhone(false); setTelegramMember(false);

    const errors = new Set<string>();
    if (!phone.trim())     errors.add('phone');
    if (password.length < 8) errors.add('password');
    if (password !== confirm || confirm.length < 8) errors.add('confirm');

    if (errors.size > 0) {
      setErrorFields(errors);
      errors.forEach(shakeField);
      const labels: string[] = [];
      if (errors.has('phone'))    labels.push('手机号');
      if (errors.has('password')) labels.push(password.length < 8 ? '密码（至少8位）' : '密码');
      if (errors.has('confirm'))  labels.push('确认密码不一致');
      showToast('请填写：' + labels.join('、'));
      if (errors.has('phone'))       phoneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      else if (errors.has('password')) passwordRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      else if (errors.has('confirm'))  confirmRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          phone:           phone.trim(),
          password,
          referral_code:   referralCode.trim() || undefined,
          referral_source: referralLocked ? 'URL_REF' : 'MANUAL',
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json() as {
        ok?: boolean; error?: string; new_user?: boolean;
        first_name?: string; existing_telegram?: boolean;
      };
      if (res.ok && data.ok) {
        // Clear referral session only after successful registration
        sessionStorage.removeItem('referral_ref');
        sessionStorage.removeItem('referral_locked');
        setSuccessMsg('账号创建成功！正在跳转至下一步…');
        setTimeout(() => router.push('/complete-bank-information'), 1000);
        return;
      }
      if (res.status === 409) {
        if (data.existing_telegram) setTelegramMember(true);
        else setDuplicatePhone(true);
        setErrorFields(new Set(['phone']));
        shakeField('phone');
        phoneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      showToast(data.error ?? '注册失败，请稍后重试');
    } catch {
      showToast('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  }

  if (regEnabled === null && !regFetchError) {
    return (
      <div className="max-w-sm mx-auto py-16 text-center" style={{ color: 'var(--text-muted)', fontSize: 14 }}>
        加载中…
      </div>
    );
  }

  if (regFetchError) {
    return (
      <div className="max-w-sm mx-auto py-16 text-center space-y-4">
        <div style={{ fontSize: 48 }}>⚠️</div>
        <h1 className="font-bold" style={{ fontSize: 'var(--sz-section)', color: 'var(--text-base)' }}>
          连接失败
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.7 }}>
          无法加载注册页面，请检查网络连接后重试。
        </p>
        <button onClick={() => window.location.reload()}
          className="casino-btn-primary inline-block px-6 py-2.5 text-sm font-bold"
          style={{ borderRadius: 'var(--radius-sm)' }}>
          重新加载
        </button>
      </div>
    );
  }

  if (!regEnabled) {
    return (
      <div className="max-w-sm mx-auto py-16 text-center space-y-4">
        <div style={{ fontSize: 48 }}>🔒</div>
        <h1 className="font-bold" style={{ fontSize: 'var(--sz-section)', color: 'var(--text-base)' }}>
          注册暂未开放
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.7 }}>
          网站注册暂未开放，请联系在线客服或 Telegram 客服开通会员。
        </p>
        <a href="/login"
          className="casino-btn-primary inline-block px-6 py-2.5 text-sm font-bold"
          style={{ borderRadius: 'var(--radius-btn)', textDecoration: 'none' }}>
          前往登录
        </a>
      </div>
    );
  }

  return (
    <>
      <style>{SHAKE_CSS}</style>
      {toast && <Toast msg={toast} onDismiss={() => setToast('')} />}

      <div className="max-w-sm mx-auto">
        {/* Setup wizard — step 1 of 3 */}
        <SetupWizard step={1} />

        <h1 className="font-bold mb-1 text-center" style={{ fontSize: 'var(--sz-page-title)', color: 'var(--text-base)' }}>
          创建账号
        </h1>
        <p className="text-xs mb-5 text-center" style={{ color: 'var(--text-muted)' }}>
          注册后将引导您完善银行信息，方便日后存取款。
        </p>

        <form onSubmit={handleSubmit} noValidate className="space-y-3">

          {/* Required fields */}
          <div className="casino-card space-y-3" style={{ padding: 'var(--card-padding)' }}>
            <p className="text-xs font-bold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>账号信息</p>

            <div ref={phoneRef} className={shakingFields.has('phone') ? 'reg-shake' : ''}>
              <FieldInput label="手机号" required value={phone}
                onChange={v => { setPhone(v); clearError('phone'); setDuplicatePhone(false); setTelegramMember(false); }}
                type="tel" placeholder="01xxxxxxxxx" autoComplete="tel"
                focused={focused === 'phone'} hasError={errorFields.has('phone')}
                onFocus={() => setFocused('phone')} onBlur={() => setFocused('')} />
              {duplicatePhone && (
                <div className="mt-2 text-xs px-3 py-2 rounded-lg"
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
                  该手机号已注册。{' '}
                  <a href="/login" style={{ color: 'var(--brand-primary)' }}>前往登录</a>
                  {' '}或{' '}
                  <a href="/forgot-password" style={{ color: 'var(--brand-primary)' }}>忘记密码</a>
                </div>
              )}
              {telegramMember && (
                <div className="mt-2 text-xs px-3 py-2 rounded-lg"
                  style={{ background: 'rgba(234,179,8,0.08)', color: '#d97706', border: '1px solid rgba(234,179,8,0.2)' }}>
                  该账号已存在（Telegram 会员）。请直接设置您的网页登录密码。
                </div>
              )}
            </div>

            <div ref={passwordRef} className={shakingFields.has('password') ? 'reg-shake' : ''}>
              <FieldInput label="密码" required value={password}
                onChange={v => { setPassword(v); clearError('password'); clearError('confirm'); }}
                type="password" placeholder="至少8个字符" autoComplete="new-password"
                focused={focused === 'password'} hasError={errorFields.has('password')}
                onFocus={() => setFocused('password')} onBlur={() => setFocused('')} />
            </div>

            <div ref={confirmRef} className={shakingFields.has('confirm') ? 'reg-shake' : ''}>
              <FieldInput label="确认密码" required value={confirm}
                onChange={v => { setConfirm(v); clearError('confirm'); }}
                type="password" placeholder="再次输入密码" autoComplete="new-password"
                focused={focused === 'confirm'} hasError={errorFields.has('confirm')}
                onFocus={() => setFocused('confirm')} onBlur={() => setFocused('')} />
            </div>
          </div>

          {/* Referral — invitation mode when locked, editable when direct */}
          {referralLocked ? (
            <div className="casino-card" style={{ padding: 'var(--card-padding)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 16 }}>🎟️</span>
                <p className="text-xs font-bold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>
                  邀请注册
                </p>
              </div>
              <div style={{
                background: 'var(--bg-surface3)',
                border: '1px solid var(--border-mid)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px 14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-faint)', marginBottom: 3 }}>
                      推荐人
                    </p>
                    <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-base)', fontFamily: 'monospace', letterSpacing: '0.08em' }}>
                      {referralCode}
                    </p>
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                    background: 'color-mix(in srgb, var(--brand-primary) 12%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--brand-primary) 35%, transparent)',
                    borderRadius: 6, padding: '3px 8px',
                  }}>
                    <span style={{ fontSize: 11 }}>🔒</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--brand-primary)', letterSpacing: '0.03em' }}>
                      已锁定
                    </span>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8, lineHeight: 1.6 }}>
                  您正在通过邀请链接注册。推荐码已自动填入且无法修改。
                </p>
              </div>
            </div>
          ) : (
            <div className="casino-card" style={{ padding: 'var(--card-padding)' }}>
              <FieldInput label="推荐码（选填）" value={referralCode}
                onChange={setReferralCode} placeholder="例如：SS1000001"
                focused={focused === 'referral'} onFocus={() => setFocused('referral')} onBlur={() => setFocused('')} />
              <p className="text-xs mt-1.5" style={{ color: 'var(--text-faint)' }}>
                没有推荐码可留空
              </p>
            </div>
          )}

          {successMsg && (
            <div className="text-sm px-3 py-2.5 rounded-lg"
              style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
              {successMsg}
            </div>
          )}

          <button type="submit" disabled={loading}
            className="casino-btn-primary w-full text-sm font-bold disabled:opacity-50"
            style={{ borderRadius: 'var(--radius-btn)' }}>
            {loading ? '注册中…' : (telegramMember ? '设置网页密码' : '下一步：完善银行信息 →')}
          </button>

          <p className="text-center text-xs pb-2" style={{ color: 'var(--text-muted)' }}>
            已有账号？{' '}
            <a href="/login" style={{ color: 'var(--brand-primary)' }}>立即登录</a>
          </p>
        </form>
      </div>
    </>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
