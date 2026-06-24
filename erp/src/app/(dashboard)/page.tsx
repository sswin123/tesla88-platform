'use client';

import { useEffect, useState } from 'react';
import { StatsCard } from '@/components/stats-card';
import type { DashboardStats } from '@/lib/types';

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-gray-400">
        Loading…
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex h-40 items-center justify-center text-red-400">
        Failed to load stats.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatsCard title="Total Members"        value={stats.totalMembers} />
        <StatsCard title="Active Members"       value={stats.activeMembers} />
        <StatsCard title="Approved Deposits"    value={stats.totalDeposits} />
        <StatsCard title="Paid Withdrawals"     value={stats.totalWithdrawals} />
        <StatsCard
          title="Pending Deposits"
          value={stats.pendingDeposits}
          description="Awaiting review"
        />
        <StatsCard
          title="Pending Withdrawals"
          value={stats.pendingWithdrawals}
          description="Awaiting review"
        />
      </div>
    </div>
  );
}
