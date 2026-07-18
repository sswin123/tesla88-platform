'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMember } from '@/lib/contexts/MemberContext';

/* ── Individual setting row ───────────────────────────────────── */
function SettingRow({
  icon,
  label,
  value,
  onClick,
  href,
  danger,
  chevron = true,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
  chevron?: boolean;
}) {
  const inner = (
    <div
      className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors"
      style={{ color: danger ? '#f87171' : 'var(--text-base)' }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-surface2)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.background = '';
      }}
      onClick={onClick}
    >
      <span
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{
          background: danger
            ? 'rgba(248,113,113,0.12)'
            : 'color-mix(in srgb, var(--brand-primary) 15%, transparent)',
          color: danger ? '#f87171' : 'var(--brand-primary)',
        }}
      >
        {icon}
      </span>
      <span className="flex-1 text-sm font-medium">{label}</span>
      {value && (
        <span className="text-sm mr-2" style={{ color: 'var(--text-muted)' }}>
          {value}
        </span>
      )}
      {chevron && (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{ color: 'var(--text-faint)', flexShrink: 0 }}
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      )}
    </div>
  );

  if (href) {
    return (
      <a href={href} style={{ textDecoration: 'none', display: 'block' }}>
        {inner}
      </a>
    );
  }
  return inner;
}

/* ── Password change form ─────────────────────────────────────── */
function PasswordForm({ onClose }: { onClose: () => void }) {
  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg]         = useState('');
  const [err, setErr]         = useState('');
  const [busy, setBusy]       = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(''); setErr('');
    if (newPass !== confirm) { setErr('两次密码不一致'); return; }
    if (newPass.length < 8)  { setErr('密码至少需要8个字符'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/member/profile', {
        method: 'PATCH',
        body: JSON.stringify({ new_password: newPass }),
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        setMsg('密码修改成功');
        setNewPass(''); setConfirm('');
        setTimeout(onClose, 1500);
      } else {
        const d = await res.json() as { error: string };
        setErr(d.error ?? '修改失败，请重试');
      }
    } catch {
      setErr('网络错误，请重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="mx-4 mb-3 rounded-xl p-3"
      style={{ background: 'var(--bg-surface3)' }}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        {msg && (
          <p
            className="text-xs px-3 py-2 rounded-lg"
            style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}
          >
            {msg}
          </p>
        )}
        {err && (
          <p
            className="text-xs px-3 py-2 rounded-lg"
            style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171' }}
          >
            {err}
          </p>
        )}
        <input
          type="password"
          value={newPass}
          onChange={e => setNewPass(e.target.value)}
          required
          minLength={8}
          placeholder="新密码（至少8位）"
          className="w-full px-3 py-2.5 rounded-lg text-sm"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-mid)',
            color: 'var(--text-base)',
            outline: 'none',
          }}
          onFocus={e => { e.target.style.borderColor = 'var(--brand-primary)'; }}
          onBlur={e => { e.target.style.borderColor = 'var(--border-mid)'; }}
        />
        <input
          type="password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          required
          minLength={8}
          placeholder="确认新密码"
          className="w-full px-3 py-2.5 rounded-lg text-sm"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-mid)',
            color: 'var(--text-base)',
            outline: 'none',
          }}
          onFocus={e => { e.target.style.borderColor = 'var(--brand-primary)'; }}
          onBlur={e => { e.target.style.borderColor = 'var(--border-mid)'; }}
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="casino-btn-primary flex-1 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {busy ? '保存中…' : '确认修改'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="casino-btn-outline px-4 py-2 text-sm"
          >
            取消
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Main settings list ───────────────────────────────────────── */
export default function SettingsList() {
  const router = useRouter();
  const { refreshProfile } = useMember();
  const [showPassword, setShowPassword] = useState(false);
  const [loggingOut, setLoggingOut]     = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    // Sync global auth state (401 → profile = null) before soft navigation
    await refreshProfile();
    router.push('/');
  }

  return (
    <div className="casino-card overflow-hidden">
      <h3
        className="text-xs font-bold tracking-wider uppercase px-4 pt-3 pb-2"
        style={{ color: 'var(--text-muted)' }}
      >
        账户设置
      </h3>

      <div style={{ borderTop: '1px solid var(--border-dim)' }}>
        {/* Change Password */}
        <div style={{ borderBottom: '1px solid var(--border-dim)' }}>
          <SettingRow
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            }
            label="修改密码"
            onClick={() => setShowPassword(v => !v)}
          />
          {showPassword && <PasswordForm onClose={() => setShowPassword(false)} />}
        </div>

        {/* Language */}
        <div style={{ borderBottom: '1px solid var(--border-dim)' }}>
          <SettingRow
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" />
              </svg>
            }
            label="语言"
            value="简体中文"
            chevron={false}
          />
        </div>

        {/* Invite Friends */}
        <div style={{ borderBottom: '1px solid var(--border-dim)' }}>
          <SettingRow
            icon={<span className="text-base">🎁</span>}
            label="邀请好友"
            href="/profile/invite"
          />
        </div>

        {/* Support */}
        <div style={{ borderBottom: '1px solid var(--border-dim)' }}>
          <SettingRow
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
            }
            label="联系客服"
            href="/chat"
          />
        </div>

        {/* Logout */}
        <SettingRow
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          }
          label={loggingOut ? '退出中…' : '退出登录'}
          onClick={handleLogout}
          danger
          chevron={false}
        />
      </div>
    </div>
  );
}
