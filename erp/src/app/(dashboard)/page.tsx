'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatsCard } from '@/components/stats-card';
import { BarChart } from '@/components/charts/BarChart';
import type { DashboardStats } from '@/lib/types';

// ── Types ─────────────────────────────────────────────────────────────────────

type Period = '7d' | '30d' | '6m';

interface HealthData {
  database: { ok: boolean; latency_ms: number };
  relay:    { ok: boolean; latency_ms: number };
  storage:  { ok: boolean; total_files: number; total_bytes: number };
  timestamp: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) { return `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`; }
function fmtSec(s: number) {
  if (s < 60) return `${s.toFixed(0)}s`;
  return `${(s / 60).toFixed(1)}m`;
}
function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

// ── Health indicator ──────────────────────────────────────────────────────────

function HealthBadge({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
      <span className={`h-2 w-2 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
      <div>
        <p className={`text-xs font-semibold ${ok ? 'text-green-700' : 'text-red-700'}`}>{label}</p>
        <p className="text-[10px] text-gray-500">{detail}</p>
      </div>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">{children}</h2>;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [stats, setStats]     = useState<DashboardStats | null>(null);
  const [health, setHealth]   = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod]   = useState<Period>('7d');
  const [lastUpdate, setLastUpdate] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, healthRes] = await Promise.all([
        fetch('/api/dashboard'),
        fetch('/api/dashboard/health'),
      ]);
      if (statsRes.ok) setStats(await statsRes.json() as DashboardStats);
      if (healthRes.ok) setHealth(await healthRes.json() as HealthData);
      setLastUpdate(new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
    const interval = setInterval(() => { void fetchData(); }, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Chart data based on selected period
  const chartData = stats
    ? period === '7d'
      ? stats.depositChart.map(d => ({ label: d.date, deposit: d.amount, withdrawal: 0 }))
      : period === '30d'
        ? stats.thirtyDayChart.map(d => ({ label: d.date, ...d }))
        : stats.monthlyRevenue.map(m => ({ label: m.month, deposit: m.deposit, withdrawal: m.withdrawal }))
    : [];

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-400 text-sm">
        Loading dashboard…
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex h-64 items-center justify-center text-red-400 text-sm">
        Failed to load dashboard. Refresh to try again.
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Executive Dashboard</h1>
        <div className="flex items-center gap-3">
          {/* Period selector */}
          <div className="flex rounded-lg border bg-white overflow-hidden">
            {(['7d', '30d', '6m'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  period === p ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '6 Months'}
              </button>
            ))}
          </div>
          <button
            onClick={() => void fetchData()}
            className="rounded-lg border bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
          >
            ↻ Refresh
          </button>
          {lastUpdate && (
            <span className="text-xs text-gray-400">Updated {lastUpdate}</span>
          )}
        </div>
      </div>

      {/* ── Section 1: Financial ─────────────────────────────────────────── */}
      <section>
        <SectionTitle>Financial</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 mb-4">
          <StatsCard title="Today Deposits"    value={fmt(stats.todayDepositAmount)}    description={`${stats.todayDepositCount} txns`} />
          <StatsCard title="Today Withdrawals" value={fmt(stats.todayWithdrawalAmount)} description={`${stats.todayWithdrawalCount} txns`} />
          <StatsCard title="Today Profit"      value={fmt(stats.todayProfit)}           description="Net – bonus" />
          <StatsCard title="Weekly Revenue"    value={fmt(stats.weeklyDepositAmount)}   description="Last 7 days deposits" />
          <StatsCard title="This Month"        value={fmt(stats.thisMonthDepositAmount)} description="Month-to-date deposits" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Revenue Chart — {period === '7d' ? 'Daily (7 Days)' : period === '30d' ? 'Daily (30 Days)' : 'Monthly (6 Months)'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">No data for this period</p>
            ) : (
              <BarChart
                data={chartData.map(d => ({ label: d.label, value: d.deposit }))}
                valueKey="value"
                color="#3B82F6"
                height={140}
                formatValue={v => `RM ${v.toFixed(0)}`}
              />
            )}
            {/* Monthly detail list (6m period only) */}
            {period === '6m' && stats.monthlyRevenue.length > 0 && (
              <div className="mt-3 space-y-1">
                {stats.monthlyRevenue.map(m => (
                  <div key={m.month} className="flex items-center justify-between text-xs text-gray-600">
                    <span className="font-medium">{m.month}</span>
                    <span>Dep: {fmt(m.deposit)} · With: {fmt(m.withdrawal)}</span>
                    <span className="font-semibold text-gray-800">Net: {fmt(m.net)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── Section 2: Members ────────────────────────────────────────────── */}
      <section>
        <SectionTitle>Members</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatsCard title="New Members Today"  value={stats.newMembersToday}    description="Registered today" />
          <StatsCard title="Active Members"     value={stats.activeMembers}      description="Status: Active" />
          <StatsCard title="Online Now"         value={stats.onlineMembers}      description="Seen in last 5 min" />
          <StatsCard title="VIP Members"        value={stats.vipMembers}         description="Tagged as VIP" />
        </div>
      </section>

      {/* ── Section 3: Operations ─────────────────────────────────────────── */}
      <section>
        <SectionTitle>Operations</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatsCard
            title="Pending Deposits"
            value={stats.pendingDeposits}
            description={stats.pendingDeposits > 0 ? '⚠ Awaiting review' : 'All clear'}
          />
          <StatsCard
            title="Pending Withdrawals"
            value={stats.pendingWithdrawals}
            description={stats.pendingWithdrawals > 0 ? '⚠ Awaiting review' : 'All clear'}
          />
          <StatsCard
            title="Open Live Chats"
            value={stats.openLiveChats}
            description="OPEN + ACTIVE sessions"
          />
          <StatsCard
            title="Waiting Customers"
            value={stats.waitingCustomers}
            description="Unassigned sessions"
          />
        </div>
      </section>

      {/* ── Section 4: Marketing ──────────────────────────────────────────── */}
      <section>
        <SectionTitle>Marketing</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-sm">Broadcasts</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-3xl font-bold">{stats.broadcastSentToday}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Broadcasts sent today</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Top Promotions — Last 30 Days</CardTitle></CardHeader>
            <CardContent>
              {stats.topPromotions.length === 0 ? (
                <p className="text-xs text-gray-400">No promotion data</p>
              ) : (
                <div className="space-y-1.5">
                  {stats.topPromotions.slice(0, 5).map((p, i) => (
                    <div key={p.name} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">#{i + 1} {p.name}</span>
                      <span className="font-semibold">{p.claim_count} claims</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── Section 5: Support ────────────────────────────────────────────── */}
      <section>
        <SectionTitle>Support</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 mb-4">
          <StatsCard title="Avg Response Time" value={fmtSec(stats.avgResponseTimeSeconds)} description="Time to first response today" />
          <StatsCard title="Chat Sessions Today" value={stats.chatSessionsToday}            description="Sessions opened today" />
          <StatsCard title="Online Staff"        value={stats.onlineSupportStaff}           description="Staff active today" />
        </div>
        {stats.csPerformance.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">CS Performance — Today</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {stats.csPerformance.map((cs, i) => (
                  <div key={cs.agent} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">#{i + 1} {cs.agent}</span>
                    <span className="font-semibold">{cs.sessions} session{cs.sessions !== 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {/* ── Section 6: System Health ──────────────────────────────────────── */}
      <section>
        <SectionTitle>System Health</SectionTitle>
        {!health ? (
          <p className="text-xs text-gray-400">Loading health status…</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            <HealthBadge
              ok={health.database.ok}
              label="Database"
              detail={health.database.ok ? `${health.database.latency_ms}ms` : 'Unreachable'}
            />
            <HealthBadge
              ok={health.relay.ok}
              label="Bot Relay"
              detail={health.relay.ok ? `${health.relay.latency_ms}ms` : 'Unreachable'}
            />
            <HealthBadge
              ok={health.storage.ok}
              label="Media Storage"
              detail={health.storage.ok ? `${health.storage.total_files} files · ${fmtBytes(health.storage.total_bytes)}` : 'Error'}
            />
          </div>
        )}
      </section>

      {/* ── Bottom: Game Providers ────────────────────────────────────────── */}
      {stats.topGameProviders.length > 0 && (
        <section>
          <SectionTitle>Top Game Providers — Last 30 Days</SectionTitle>
          <Card>
            <CardContent className="pt-4">
              <BarChart
                data={stats.topGameProviders.map(p => ({ label: p.provider, value: p.deposit_count }))}
                valueKey="value"
                color="#6366F1"
                height={120}
                formatValue={v => `${v} txns`}
              />
              <div className="mt-3 space-y-1">
                {stats.topGameProviders.map((p, i) => (
                  <div key={p.provider} className="flex items-center justify-between text-xs text-gray-600">
                    <span>#{i + 1} {p.provider}</span>
                    <span className="font-medium">{p.deposit_count} txns · {fmt(p.deposit_amount)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

    </div>
  );
}
