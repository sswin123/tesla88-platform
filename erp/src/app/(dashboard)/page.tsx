'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatsCard } from '@/components/stats-card';
import type { DashboardStats } from '@/lib/types';

function BarChart({ data, valueKey, label }: {
  data: { date: string; amount: number; count: number }[];
  valueKey: 'amount' | 'count';
  label: string;
}) {
  const max = Math.max(...data.map((d) => d[valueKey]), 1);
  return (
    <div>
      <p className="mb-2 text-xs text-gray-500">{label}</p>
      <div className="flex items-end gap-1 h-24">
        {data.length === 0
          ? <p className="text-xs text-gray-400">No data</p>
          : data.map((d) => (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-blue-500"
                style={{ height: `${(d[valueKey] / max) * 80}px` }}
                title={`${d.date}: ${valueKey === 'amount' ? `RM ${d.amount.toFixed(0)}` : d.count}`}
              />
              <span className="text-[10px] text-gray-400">{d.date}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats]   = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard').then((r) => r.json()).then(setStats).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex h-40 items-center justify-center text-gray-400">Loading…</div>;
  if (!stats)  return <div className="flex h-40 items-center justify-center text-red-400">Failed to load stats.</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatsCard title="Total Members"         value={stats.totalMembers} />
        <StatsCard title="Active Members"        value={stats.activeMembers} />
        <StatsCard title="Pending Deposits"      value={stats.pendingDeposits}    description="Awaiting review" />
        <StatsCard title="Pending Withdrawals"   value={stats.pendingWithdrawals} description="Awaiting review" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatsCard title="Today Deposits"    value={`RM ${stats.todayDepositAmount.toFixed(0)}`}   description={`${stats.todayDepositCount} transactions`} />
        <StatsCard title="Today Withdrawals" value={`RM ${stats.todayWithdrawalAmount.toFixed(0)}`} description={`${stats.todayWithdrawalCount} transactions`} />
        <StatsCard title="All Deposits"      value={stats.totalDeposits}    description="Approved all time" />
        <StatsCard title="All Withdrawals"   value={stats.totalWithdrawals} description="Paid all time" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Deposits — 7 Days</CardTitle></CardHeader>
          <CardContent>
            <BarChart data={stats.depositChart} valueKey="amount" label="Daily Amount (RM)" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Withdrawals — 7 Days</CardTitle></CardHeader>
          <CardContent>
            <BarChart data={stats.withdrawalChart} valueKey="amount" label="Daily Amount (RM)" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Top Promotions (30 days)</CardTitle></CardHeader>
          <CardContent>
            {stats.topPromotions.length === 0
              ? <p className="text-sm text-gray-400">No data</p>
              : <div className="space-y-2">
                  {stats.topPromotions.map((p, i) => (
                    <div key={p.name} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">#{i + 1} {p.name}</span>
                      <span className="font-medium">{p.claim_count} claims</span>
                    </div>
                  ))}
                </div>
            }
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Top Depositors (All Time)</CardTitle></CardHeader>
          <CardContent>
            {stats.topDepositors.length === 0
              ? <p className="text-sm text-gray-400">No data</p>
              : <div className="space-y-2">
                  {stats.topDepositors.map((d, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">#{i + 1} {d.first_name}</span>
                      <span className="font-medium">RM {d.total.toFixed(0)}</span>
                    </div>
                  ))}
                </div>
            }
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
