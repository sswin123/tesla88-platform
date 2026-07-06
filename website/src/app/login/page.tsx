'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
      headers: { 'Content-Type': 'application/json' },
    });
    setLoading(false);
    if (res.ok) { router.push('/dashboard'); return; }
    const data = await res.json() as { error: string };
    setError(data.error ?? 'Login failed');
  }

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-6">Member Login</h1>
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-8 space-y-4">
        {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-3">{error}</div>}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} type="tel" required placeholder="01xxxxxxxxx"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input value={password} onChange={e => setPassword(e.target.value)} type="password" required placeholder="••••••••"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button type="submit" disabled={loading}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
          {loading ? 'Logging in…' : 'Login'}
        </button>
        <p className="text-center text-sm text-gray-500">
          First time? <a href="/register" className="text-blue-600 hover:underline">Activate web access</a>
        </p>
      </form>
    </div>
  );
}
