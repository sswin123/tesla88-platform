'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const router = useRouter();
  const [phone, setPhone]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 8)  { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
      headers: { 'Content-Type': 'application/json' },
    });
    setLoading(false);
    if (res.ok) { router.push('/dashboard'); return; }
    const data = await res.json() as { error: string };
    setError(data.error ?? 'Registration failed');
  }

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-2">Activate Web Access</h1>
      <p className="text-gray-500 text-sm mb-6">Already registered via Telegram? Enter your phone number to set a web password.</p>
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-8 space-y-4">
        {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-3">{error}</div>}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Registered Phone Number</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} type="tel" required placeholder="01xxxxxxxxx"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
          <input value={password} onChange={e => setPassword(e.target.value)} type="password" required minLength={8}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
          <input value={confirm} onChange={e => setConfirm(e.target.value)} type="password" required minLength={8}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button type="submit" disabled={loading}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
          {loading ? 'Activating…' : 'Activate Web Access'}
        </button>
        <p className="text-center text-sm text-gray-500">
          Already activated? <a href="/login" className="text-blue-600 hover:underline">Login here</a>
        </p>
      </form>
    </div>
  );
}
