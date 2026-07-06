'use client';
import { useEffect, useState } from 'react';
import type { MemberProfile } from '@/lib/types';

export default function ProfilePage() {
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [newPass, setNewPass]     = useState('');
  const [confirm, setConfirm]     = useState('');
  const [msg, setMsg]             = useState('');
  const [error, setError]         = useState('');

  useEffect(() => {
    fetch('/api/member/profile').then(r => r.json()).then(d => setProfile(d as MemberProfile));
  }, []);

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setMsg(''); setError('');
    if (newPass !== confirm) { setError('Passwords do not match'); return; }
    const res = await fetch('/api/member/profile', {
      method: 'PATCH',
      body: JSON.stringify({ new_password: newPass }),
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.ok) { setMsg('Password updated successfully'); setNewPass(''); setConfirm(''); }
    else { const d = await res.json() as { error: string }; setError(d.error); }
  }

  if (!profile) return <div className="text-center py-12 text-gray-400">Loading…</div>;

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-6">My Profile</h1>
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold mb-4 text-gray-700">Account Details</h2>
        <div className="space-y-3 text-sm">
          {[['Name', profile.first_name], ['Phone', profile.phone], ['Bank', profile.bank_name],
            ['Bank Account', profile.bank_account], ['Account Holder', profile.bank_holder_name],
            ['Member Since', new Date(profile.created_at).toLocaleDateString('en-MY')]
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between">
              <span className="text-gray-500">{label}</span>
              <span className="font-medium text-gray-900">{value}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold mb-4 text-gray-700">Change Password</h2>
        <form onSubmit={handlePasswordChange} className="space-y-3">
          {msg   && <div className="text-green-700 text-sm bg-green-50 border border-green-200 rounded p-2">{msg}</div>}
          {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-2">{error}</div>}
          <input value={newPass} onChange={e => setNewPass(e.target.value)} type="password" required minLength={8} placeholder="New password (min 8 chars)"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input value={confirm} onChange={e => setConfirm(e.target.value)} type="password" required minLength={8} placeholder="Confirm new password"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button type="submit" className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Update Password</button>
        </form>
      </div>
    </div>
  );
}
