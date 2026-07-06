'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MemberProfile } from '@/lib/types';

function fmt(n: string | number) {
  return `RM ${parseFloat(String(n)).toFixed(2)}`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [deposits, setDeposits]     = useState<unknown[]>([]);
  const [withdrawals, setWithdrawals] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/member/profile').then(r => r.json()),
      fetch('/api/member/deposits').then(r => r.json()),
      fetch('/api/member/withdrawals').then(r => r.json()),
    ]).then(([p, d, w]) => {
      setProfile(p as MemberProfile);
      setDeposits(d as unknown[]);
      setWithdrawals(w as unknown[]);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
  }

  if (loading) return <div className="text-center py-12 text-gray-400">Loading…</div>;
  if (!profile) return <div className="text-center py-12 text-red-400">Failed to load profile.</div>;

  const balance = parseFloat(profile.total_deposit) - parseFloat(profile.total_withdraw);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Welcome, {profile.first_name}</h1>
        <button onClick={handleLogout} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">Logout</button>
      </div>

      {/* Balance cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Net Balance', value: fmt(balance) },
          { label: 'Total Deposit', value: fmt(profile.total_deposit) },
          { label: 'Total Withdrawal', value: fmt(profile.total_withdraw) },
          { label: 'Total Bonus', value: fmt(profile.total_bonus) },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">{c.label}</p>
            <p className="text-lg font-bold text-gray-900 mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="flex gap-3 mb-8">
        <a href="/deposit" className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">+ Deposit</a>
        <a href="/withdrawal" className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50">Withdraw</a>
        <a href="/profile" className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50">Profile</a>
        <a href="/chat" className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50">Support</a>
      </div>

      {/* Recent transactions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold mb-3">Recent Deposits</h2>
          {deposits.length === 0 ? <p className="text-sm text-gray-400">No deposits yet.</p> : (
            <div className="space-y-2">
              {(deposits as { id: number; deposit_amount: string; status: string; created_at: string }[]).slice(0, 5).map(d => (
                <div key={d.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{new Date(d.created_at).toLocaleDateString()}</span>
                  <span className="font-medium">{fmt(d.deposit_amount)}</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${d.status === 'APPROVED' ? 'bg-green-100 text-green-700' : d.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{d.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold mb-3">Recent Withdrawals</h2>
          {withdrawals.length === 0 ? <p className="text-sm text-gray-400">No withdrawals yet.</p> : (
            <div className="space-y-2">
              {(withdrawals as { id: number; withdraw_amount: string; status: string; created_at: string }[]).slice(0, 5).map(w => (
                <div key={w.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{new Date(w.created_at).toLocaleDateString()}</span>
                  <span className="font-medium">{fmt(w.withdraw_amount)}</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${w.status === 'PAID' ? 'bg-green-100 text-green-700' : w.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{w.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
