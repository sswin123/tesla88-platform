'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatsCard } from '@/components/stats-card';
import { BarChart } from '@/components/charts/BarChart';
import { LineChart } from '@/components/charts/LineChart';
import type { DashboardStats } from '@/lib/types';

// Local inline bar chart kept for the 7-day deposit/withdrawal charts
// (uses the original div-based style to preserve existing visual)
function DailyBarChart({ data, valueKey, label }: {
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

      {/* Row 1: Members & Pending */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatsCard title="Total Members"         value={stats.totalMembers} />
        <StatsCard title="Active Members"        value={stats.activeMembers} />
        <StatsCard title="Pending Deposits"      value={stats.pendingDeposits}    description="Awaiting review" />
        <StatsCard title="Pending Withdrawals"   value={stats.pendingWithdrawals} description="Awaiting review" />
      </div>

      {/* Row 2: Today's financials */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatsCard title="Today Deposits"    value={`RM ${stats.todayDepositAmount.toFixed(0)}`}   description={`${stats.todayDepositCount} transactions`} />
        <StatsCard title="Today Withdrawals" value={`RM ${stats.todayWithdrawalAmount.toFixed(0)}`} description={`${stats.todayWithdrawalCount} transactions`} />
        <StatsCard title="All Deposits"      value={stats.totalDeposits}    description="Approved all time" />
        <StatsCard title="All Withdrawals"   value={stats.totalWithdrawals} description="Paid all time" />
      </div>

      {/* Row 3: NEW KPI cards — today summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatsCard title="Today Bonus"       value={`RM ${stats.todayBonusAmount.toFixed(0)}`}  description="Claimed today (excl. cancelled)" />
        <StatsCard title="Today Net Deposit" value={`RM ${stats.todayNetDeposit.toFixed(0)}`}   description="Deposits minus withdrawals" />
        <StatsCard title="Today Profit"      value={`RM ${stats.todayProfit.toFixed(0)}`}       description="Net deposit minus bonus" />
      </div>

      {/* Row 4: NEW KPI cards — member & staff activity */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatsCard title="New Members Today"     value={stats.newMembersToday}      description="Registered today" />
        <StatsCard title="Active Members Today"  value={stats.activeMembersToday}   description="Seen today" />
        <StatsCard title="Online Support Staff"  value={stats.onlineSupportStaff}   description="Staff active today" />
      </div>

      {/* 7-day charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Deposits — 7 Days</CardTitle></CardHeader>
          <CardContent>
            <DailyBarChart data={stats.depositChart} valueKey="amount" label="Daily Amount (RM)" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Withdrawals — 7 Days</CardTitle></CardHeader>
          <CardContent>
            <DailyBarChart data={stats.withdrawalChart} valueKey="amount" label="Daily Amount (RM)" />
          </CardContent>
        </Card>
      </div>

      {/* NEW: Top Game Providers */}
      <Card>
        <CardHeader><CardTitle className="text-base">Top Game Providers — Last 30 Days</CardTitle></CardHeader>
        <CardContent>
          <BarChart
            data={stats.topGameProviders.map((p) => ({
              label: p.provider,
              value: p.deposit_count,
              deposit_amount: p.deposit_amount,
            }))}
            valueKey="value"
            color="#6366F1"
            height={140}
            formatValue={(v) => `${v} txns`}
          />
          {stats.topGameProviders.length > 0 && (
            <div className="mt-3 space-y-1">
              {stats.topGameProviders.map((p, i) => (
                <div key={p.provider} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">#{i + 1} {p.provider}</span>
                  <span className="font-medium">{p.deposit_count} txns · RM {p.deposit_amount.toFixed(0)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* NEW: Monthly Revenue */}
      <Card>
        <CardHeader><CardTitle className="text-base">Monthly Revenue — Last 6 Months</CardTitle></CardHeader>
        <CardContent>
          <LineChart
            data={stats.monthlyRevenue.map((m) => ({ label: m.month, value: m.net, ...m }))}
            valueKey="value"
            color="#10B981"
            height={140}
            formatValue={(v) => `RM ${v.toFixed(0)}`}
          />
          {stats.monthlyRevenue.length > 0 && (
            <div className="mt-3 space-y-1">
              {stats.monthlyRevenue.map((m) => (
                <div key={m.month} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{m.month}</span>
                  <span className="text-gray-500">Dep: RM {m.deposit.toFixed(0)} · With: RM {m.withdrawal.toFixed(0)}</span>
                  <span className="font-medium">Net: RM {m.net.toFixed(0)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Promotions & Top Depositors (extended to 10) */}
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
