'use client';

import { useEffect, useState } from 'react';
import { LineChart } from '@/components/charts/LineChart';
import type { MemberAnalytics } from '@/lib/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtNum(n: number) {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: number) {
  return n.toFixed(1) + '%';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700 p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700 p-4 text-center">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [data, setData] = useState<MemberAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/analytics')
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<MemberAnalytics>;
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load analytics'))
      .finally(() => setLoading(false));
  }, []);

  const chartData = (data?.new_members_daily ?? []).map((d) => ({
    label: d.date.slice(5), // MM-DD
    value: d.count,
  }));

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-400">
        Loading analytics…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center text-red-400">{error}</div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Member Analytics</h1>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Members" value={data.total_members.toLocaleString()} />
        <KpiCard
          label="Active (30d)"
          value={data.active_30d.toLocaleString()}
          sub={`${fmtPct((data.active_30d / Math.max(data.total_members, 1)) * 100)} of total`}
        />
        <KpiCard
          label="First Deposit Rate"
          value={fmtPct(data.first_deposit_rate)}
          sub="Depositors / total members"
        />
        <KpiCard
          label="30d Retention"
          value={fmtPct(data.retention_rate_30d)}
          sub="Active older members"
        />
      </div>

      {/* New Members Daily Chart */}
      <div className="rounded-lg border border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700 p-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          New Members — Last 30 Days
        </h2>
        {chartData.length >= 2 ? (
          <LineChart
            data={chartData}
            valueKey="value"
            color="#10B981"
            height={160}
            formatValue={(v) => String(Math.round(v))}
          />
        ) : (
          <p className="text-xs text-gray-400">Not enough data</p>
        )}
      </div>

      {/* Top Members Tables */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Depositors */}
        <div className="rounded-lg border border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Top 10 Depositors
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750">
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">#</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Name</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Total (RM)</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Txns</th>
              </tr>
            </thead>
            <tbody>
              {data.top_depositors.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-xs text-gray-400">No data</td>
                </tr>
              ) : (
                data.top_depositors.map((row, i) => (
                  <tr
                    key={row.id}
                    className={i % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-750'}
                  >
                    <td className="px-3 py-2 text-gray-400 dark:text-gray-500 font-mono">{i + 1}</td>
                    <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{row.first_name}</td>
                    <td className="px-3 py-2 text-right text-green-600 dark:text-green-400 font-medium">
                      {fmtNum(row.total)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500 dark:text-gray-400">{row.count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Top Bonus Users */}
        <div className="rounded-lg border border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Top 10 Bonus Users
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750">
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">#</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Name</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Total (RM)</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Claims</th>
              </tr>
            </thead>
            <tbody>
              {data.top_bonus_users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-xs text-gray-400">No data</td>
                </tr>
              ) : (
                data.top_bonus_users.map((row, i) => (
                  <tr
                    key={row.id}
                    className={i % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-750'}
                  >
                    <td className="px-3 py-2 text-gray-400 dark:text-gray-500 font-mono">{i + 1}</td>
                    <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{row.first_name}</td>
                    <td className="px-3 py-2 text-right text-yellow-600 dark:text-yellow-400 font-medium">
                      {fmtNum(row.total)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500 dark:text-gray-400">{row.claims}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Referral Stats */}
      <div className="rounded-lg border border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700 p-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Referral Statistics</h2>
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Referred Members" value={data.referral_stats.referred_members.toLocaleString()} />
          <StatCard label="Organic Members" value={data.referral_stats.organic_members.toLocaleString()} />
          <StatCard label="Active Referrers" value={data.referral_stats.active_referrers.toLocaleString()} />
        </div>
      </div>

      {/* Top Promotions by Member Acquisition */}
      <div className="rounded-lg border border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700 p-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Top Promotions by Member Acquisition
        </h2>
        {data.top_promotions_by_members.length === 0 ? (
          <p className="text-xs text-gray-400">No data</p>
        ) : (
          <ol className="space-y-2">
            {data.top_promotions_by_members.map((p, i) => (
              <li key={p.name} className="flex items-center gap-3">
                <span className="w-6 text-right text-xs text-gray-400 font-mono shrink-0">{i + 1}</span>
                <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 truncate">{p.name}</span>
                <span className="text-sm font-medium text-blue-600 dark:text-blue-400 shrink-0">
                  {p.member_count.toLocaleString()} members
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
