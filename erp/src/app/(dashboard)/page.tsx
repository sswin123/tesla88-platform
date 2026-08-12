'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  TrendingUp,
  Download,
  Upload,
  Clock,
  Database,
  HardDrive,
  Wifi,
} from 'lucide-react';
import { StaffMonitorWidget } from '@/components/staff/StaffMonitorWidget';
import type { DashboardStats } from '@/lib/types';

import { KpiCard } from '@/components/dashboard/KpiCard';
import { RevenueChart } from '@/components/dashboard/RevenueChart';
import type { RevenueDataPoint } from '@/components/dashboard/RevenueChart';
import { SystemHealthPanel } from '@/components/dashboard/SystemHealthPanel';
import type { HealthService } from '@/components/dashboard/SystemHealthPanel';
import { GameProvidersPanel } from '@/components/dashboard/GameProvidersPanel';
import { LiveChatPanel } from '@/components/dashboard/LiveChatPanel';
import { MemberPanel } from '@/components/dashboard/MemberPanel';

// ── Types ─────────────────────────────────────────────────────────────────────

type Period = '7d' | '30d' | '6m';

interface HealthData {
  database: { ok: boolean; latency_ms: number };
  relay:    { ok: boolean; latency_ms: number };
  storage:  { ok: boolean; total_files: number; total_bytes: number };
  timestamp: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
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

  // ── 7D chart: merge deposit + withdrawal arrays by date ───────────────────
  const sevenDayData = useMemo<RevenueDataPoint[]>(() => {
    if (!stats) return [];
    const map = new Map<string, { deposit: number; withdrawal: number }>();
    for (const d of stats.depositChart) {
      map.set(d.date, { deposit: d.amount, withdrawal: 0 });
    }
    for (const d of stats.withdrawalChart) {
      const entry = map.get(d.date);
      if (entry) entry.withdrawal = d.amount;
      else map.set(d.date, { deposit: 0, withdrawal: d.amount });
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));
  }, [stats]);

  // ── Revenue chart data for the selected period ────────────────────────────
  const revenueData = useMemo<RevenueDataPoint[]>(() => {
    if (!stats) return [];
    if (period === '7d')  return sevenDayData;
    if (period === '30d') return stats.thirtyDayChart;
    return stats.monthlyRevenue.map((m) => ({
      date: m.month,
      deposit: m.deposit,
      withdrawal: m.withdrawal,
      net: m.net,
    }));
  }, [stats, period, sevenDayData]);

  // ── System health services from /api/dashboard/health ────────────────────
  const healthServices = useMemo<HealthService[]>(() => {
    if (!health) return [];
    return [
      {
        name:    'Database',
        status:  health.database.ok ? 'operational' : 'down',
        latency: health.database.latency_ms,
        icon:    Database,
      },
      {
        name:    'Bot Relay',
        status:  health.relay.ok ? 'operational' : 'down',
        latency: health.relay.latency_ms,
        icon:    Wifi,
      },
      {
        name:   'Media Storage',
        status: health.storage.ok ? 'operational' : 'down',
        detail: health.storage.ok
          ? `${health.storage.total_files} files · ${fmtBytes(health.storage.total_bytes)}`
          : 'Unreachable',
        icon:   HardDrive,
      },
    ];
  }, [health]);

  // ── Game providers from 30-day deposit ranking ────────────────────────────
  const gameProviders = useMemo(() => {
    if (!stats?.topGameProviders.length) return [];
    return stats.topGameProviders.map((p) => ({
      code:          p.provider,
      name:          p.provider,
      status:        'operational' as const,
      todayTurnover: p.deposit_amount,
      lastSync:      `${p.deposit_count} txns`,
    }));
  }, [stats]);

  // ── Deposit trend vs 7-day daily average ─────────────────────────────────
  const depositTrend = useMemo(() => {
    if (!stats || stats.weeklyDepositAmount === 0) return undefined;
    const avg = stats.weeklyDepositAmount / 7;
    const pct = ((stats.todayDepositAmount - avg) / avg) * 100;
    return { value: pct, label: 'vs 7d avg', positive: pct >= 0 };
  }, [stats]);

  // ── Sparkline source arrays ────────────────────────────────────────────────
  const depositSparkline    = useMemo(() => stats?.depositChart.map((d) => d.amount)    ?? [], [stats]);
  const withdrawalSparkline = useMemo(() => stats?.withdrawalChart.map((d) => d.amount) ?? [], [stats]);

  // ── Period label passed to RevenueChart ───────────────────────────────────
  const chartPeriod = period === '7d' ? '7D' : period === '30d' ? '30D' : '6M';

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-5 pb-8 animate-pulse">
        <div className="h-8 w-52 rounded-lg bg-muted" />
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-muted" />
          ))}
        </div>
        <div className="h-80 rounded-xl bg-muted" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="h-48 rounded-xl bg-muted" />
          <div className="h-48 rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (!stats) {
    return (
      <div className="flex h-64 items-center justify-center text-red-400 text-sm">
        Failed to load dashboard. Refresh to try again.
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time overview · auto-refreshes every minute
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Period selector */}
          <div className="flex rounded-lg border bg-card overflow-hidden">
            {(['7d', '30d', '6m'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  period === p
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '6 Months'}
              </button>
            ))}
          </div>
          {/* Refresh */}
          <button
            onClick={() => void fetchData()}
            className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
            aria-label="Refresh dashboard"
          >
            <RefreshCw size={12} aria-hidden="true" />
            Refresh
          </button>
          {lastUpdate && (
            <span className="hidden sm:block text-[11px] text-muted-foreground">
              Updated {lastUpdate}
            </span>
          )}
        </div>
      </div>

      {/* ── ROW A: 5 KPI Cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        <KpiCard
          title="Net Profit"
          value={fmt(stats.todayProfit)}
          subtitle="Today: deposits − withdrawals − bonus"
          icon={TrendingUp}
          iconClassName={
            stats.todayProfit >= 0
              ? 'bg-emerald-500/10 text-emerald-500'
              : 'bg-red-500/10 text-red-500'
          }
          sparklineData={depositSparkline}
          sparklineColor={stats.todayProfit >= 0 ? '#10b981' : '#ef4444'}
        />

        <KpiCard
          title="Today Deposits"
          value={fmt(stats.todayDepositAmount)}
          subtitle={`${stats.todayDepositCount} transactions`}
          icon={Download}
          iconClassName="bg-indigo-500/10 text-indigo-400"
          trend={depositTrend}
          sparklineData={depositSparkline}
          sparklineColor="#6366f1"
        />

        <KpiCard
          title="Today Withdrawals"
          value={fmt(stats.todayWithdrawalAmount)}
          subtitle={`${stats.todayWithdrawalCount} transactions`}
          icon={Upload}
          iconClassName="bg-amber-500/10 text-amber-500"
          sparklineData={withdrawalSparkline}
          sparklineColor="#f59e0b"
        />

        <KpiCard
          title="Pending Deposits"
          value={String(stats.pendingDeposits)}
          subtitle={stats.pendingDeposits > 0 ? 'Awaiting review' : 'All cleared'}
          icon={Clock}
          iconClassName={
            stats.pendingDeposits > 0
              ? 'bg-amber-500/10 text-amber-500'
              : 'bg-muted text-muted-foreground'
          }
        />

        <KpiCard
          title="Pending Withdrawals"
          value={String(stats.pendingWithdrawals)}
          subtitle={stats.pendingWithdrawals > 0 ? 'Awaiting review' : 'All cleared'}
          icon={Clock}
          iconClassName={
            stats.pendingWithdrawals > 0
              ? 'bg-amber-500/10 text-amber-500'
              : 'bg-muted text-muted-foreground'
          }
        />
      </div>

      {/* ── ROW B: Revenue Analytics Chart ──────────────────────────────── */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Revenue Analytics</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {period === '7d'
                ? 'Daily deposit & withdrawal trends (last 7 days)'
                : period === '30d'
                  ? 'Daily deposit & withdrawal trends (last 30 days)'
                  : 'Monthly deposit, withdrawal & net revenue (6 months)'}
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-indigo-500" />
              Deposits
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
              Withdrawals
            </span>
            {period === '6m' && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                Net
              </span>
            )}
          </div>
        </div>
        <RevenueChart data={revenueData} period={chartPeriod} />
      </div>

      {/* ── ROW C: System Health + Game Providers ────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <SystemHealthPanel services={healthServices} />
        <GameProvidersPanel providers={gameProviders} />
      </div>

      {/* ── ROW D: Live Chat + Member Overview ───────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <LiveChatPanel
          conversations={[]}
          totalUnread={stats.waitingCustomers}
          aggregate={{
            open:           stats.openLiveChats,
            waiting:        stats.waitingCustomers,
            todaySessions:  stats.chatSessionsToday,
            avgResponseSec: stats.avgResponseTimeSeconds,
            onlineStaff:    stats.onlineSupportStaff,
            csPerformance:  stats.csPerformance,
          }}
        />
        <MemberPanel
          stats={{
            total:       stats.totalMembers,
            newToday:    stats.newMembersToday,
            activeToday: stats.activeMembersToday,
            active:      stats.activeMembers,
            vip:         stats.vipMembers,
            online:      stats.onlineMembers,
          }}
        />
      </div>

      {/* ── ROW E: Promotions + Top Depositors ───────────────────────────── */}
      {(stats.topPromotions.length > 0 || stats.topDepositors.length > 0) && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

          {/* Promotions */}
          {stats.topPromotions.length > 0 && (
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Top Promotions
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-muted-foreground">Last 30 days</span>
                  {stats.broadcastSentToday > 0 && (
                    <span className="text-[10px] font-semibold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                      {stats.broadcastSentToday} broadcasts today
                    </span>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                {stats.topPromotions.slice(0, 7).map((p, i) => {
                  const maxClaims = stats.topPromotions[0].claim_count;
                  const pct = maxClaims > 0 ? (p.claim_count / maxClaims) * 100 : 0;
                  return (
                    <div key={p.name} className="flex items-center gap-2">
                      <span className="w-3 shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                        {p.name}
                      </span>
                      <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-indigo-500/60"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-16 shrink-0 text-right text-[10px] font-semibold tabular-nums text-muted-foreground">
                        {p.claim_count} claims
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top Depositors */}
          {stats.topDepositors.length > 0 && (
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Top Depositors
                </p>
                <span className="text-[10px] text-muted-foreground">All time</span>
              </div>
              <div className="space-y-2">
                {stats.topDepositors.slice(0, 7).map((d, i) => {
                  const maxTotal = stats.topDepositors[0].total;
                  const pct = maxTotal > 0 ? (d.total / maxTotal) * 100 : 0;
                  return (
                    <div key={`${d.first_name}-${i}`} className="flex items-center gap-2">
                      <span className="w-3 shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                        {d.first_name}
                      </span>
                      <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-emerald-500/60"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-24 shrink-0 text-right text-[10px] font-semibold tabular-nums text-muted-foreground">
                        {fmt(d.total)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      )}

      {/* ── ROW F: Staff Monitor (permission-gated) ──────────────────────── */}
      <StaffMonitorWidget />

    </div>
  );
}
