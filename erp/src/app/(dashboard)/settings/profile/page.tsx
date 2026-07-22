'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Loader2, CheckCircle } from 'lucide-react';

interface MeData { username: string; role: string }

export default function ChangePasswordPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeData | null>(null);
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() as Promise<MeData> : null)
      .then(d => { if (d) setMe(d); })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (form.new_password.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }
    if (form.new_password !== form.confirm_password) {
      setError('Passwords do not match');
      return;
    }
    if (form.current_password === form.new_password) {
      setError('New password must be different from current password');
      return;
    }

    setSaving(true);
    try {
      const r = await fetch('/api/settings/profile/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await r.json() as { error?: string };
      if (!r.ok) {
        setError(d.error ?? 'Failed to change password');
        return;
      }
      setSuccess(true);
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } finally {
      setSaving(false);
    }
  }

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <CheckCircle className="mx-auto text-green-500 mb-4" size={48} />
          <h2 className="text-xl font-semibold text-gray-900">Password Changed</h2>
          <p className="text-gray-500 mt-1 text-sm">Redirecting to login…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Change Password</h1>
        {me && (
          <p className="text-sm text-gray-500 mt-1">
            Account: <span className="font-medium text-gray-700">{me.username}</span>
            <span className="ml-2 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">{me.role}</span>
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-blue-50">
            <KeyRound size={20} className="text-blue-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Update Password</h2>
            <p className="text-xs text-gray-500">You will be logged out after changing your password</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={form.current_password}
              onChange={e => setForm(f => ({ ...f, current_password: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <input
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              value={form.new_password}
              onChange={e => setForm(f => ({ ...f, new_password: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="••••••••"
            />
            <p className="text-xs text-gray-400 mt-1">Minimum 8 characters</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={form.confirm_password}
              onChange={e => setForm(f => ({ ...f, confirm_password: e.target.value }))}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                form.confirm_password && form.new_password !== form.confirm_password
                  ? 'border-red-300 bg-red-50'
                  : 'border-gray-300'
              }`}
              placeholder="••••••••"
            />
            {form.confirm_password && form.new_password !== form.confirm_password && (
              <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving || (!!form.confirm_password && form.new_password !== form.confirm_password)}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Change Password
          </button>
        </form>
      </div>
    </div>
  );
}
