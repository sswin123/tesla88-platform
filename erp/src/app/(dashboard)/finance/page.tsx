'use client';

import { useEffect, useState, useCallback } from 'react';
import { LineChart } from '@/components/charts/LineChart';
import type { FinanceReport } from '@/lib/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getPresetDates(preset: 'today' | 'week' | 'month' | 'lastMonth') {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  if (preset === 'today') return { start: today, end: today };
  if (preset === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return { start: d.toISOString().split('T')[0], end: today };
  }
  if (preset === 'month') {
    const d = new Date(now);
    d.setDate(1);
    return { start: d.toISOString().split('T')[0], end: today };
  }
  // lastMonth
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  return {
    start: first.toISOString().split('T')[0],
    end: last.toISOString().split('T')[0],
  };
}

function exportCSV(report: FinanceReport) {
  const rows = [
    ['Date', 'Deposit', 'Withdrawal', 'Bonus', 'Net Deposit'],
    ...report.daily_breakdown.map((d) => [
      d.date,
      d.deposit.toFixed(2),
      d.withdrawal.toFixed(2),
      d.bonus.toFixed(2),
      d.net.toFixed(2),
    ]),
  ];
  const csv = rows.map((r) => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `finance-report-${report.period_start}-to-${report.period_end}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' : 'border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700'}`}>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className={`text-xl font-semibold ${highlight ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-gray-100'}`}>
        RM {value}
      </p>
    </div>
  );
}

function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700 p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FinancePage() {
  const [report, setReport] = useState<FinanceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default: last 30 days
  const defaultEnd = new Date().toISOString().split('T')[0];
  const defaultStartD = new Date();
  defaultStartD.setDate(defaultStartD.getDate() - 29);
  const defaultStart = defaultStartD.toISOString().split('T')[0];

  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const fetchReport = useCallback(async (s: string, e: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/finance/reports?start=${s}&end=${e}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const data: FinanceReport = await res.json();
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount
  useEffect(() => {
    fetchReport(start, end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyPreset(preset: 'today' | 'week' | 'month' | 'lastMonth') {
    const dates = getPresetDates(preset);
    setStart(dates.start);
    setEnd(dates.end);
    setActivePreset(preset);
    fetchReport(dates.start, dates.end);
  }

  function applyCustom() {
    setActivePreset(null);
    fetchReport(start, end);
  }

  // Chart data helpers
  const depositChartData = (report?.daily_breakdown ?? []).map((d) => ({
    label: d.date.slice(5), // MM-DD
    value: d.deposit,
  }));
  const withdrawalChartData = (report?.daily_breakdown ?? []).map((d) => ({
    label: d.date.slice(5),
    value: d.withdrawal,
  }));
  const netChartData = (report?.daily_breakdown ?? []).map((d) => ({
    label: d.date.slice(5),
    value: d.net,
  }));

  const presetBtnClass = (preset: string) =>
    `px-3 py-1.5 rounded text-sm font-medium transition-colors ${
      activePreset === preset
        ? 'bg-blue-600 text-white'
        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
    }`;

  return (
    <>
      <style media="print">{`
        .no-print { display: none !important; }
        body { background: white; color: black; }
        .dark { background: white; color: black; }
      `}</style>

      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Finance Reports</h1>
          <div className="flex gap-2 no-print">
            {report && (
              <>
                <button
                  onClick={() => exportCSV(report)}
                  className="px-4 py-2 rounded bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
                >
                  Export CSV
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 rounded bg-gray-600 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
                >
                  Print / PDF
                </button>
              </>
            )}
          </div>
        </div>

        {/* Date Range Picker */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 no-print">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">Preset:</span>
            <button onClick={() => applyPreset('today')} className={presetBtnClass('today')}>Today</button>
            <button onClick={() => applyPreset('week')} className={presetBtnClass('week')}>This Week</button>
            <button onClick={() => applyPreset('month')} className={presetBtnClass('month')}>This Month</button>
            <button onClick={() => applyPreset('lastMonth')} className={presetBtnClass('lastMonth')}>Last Month</button>

            <span className="text-gray-300 dark:text-gray-600 mx-1">|</span>

            <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">Custom:</span>
            <input
              type="date"
              value={start}
              onChange={(e) => { setStart(e.target.value); setActivePreset(null); }}
              className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <span className="text-sm text-gray-400">to</span>
            <input
              type="date"
              value={end}
              onChange={(e) => { setEnd(e.target.value); setActivePreset(null); }}
              className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <button
              onClick={applyCustom}
              className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Apply
            </button>
          </div>
        </div>

        {/* Loading / Error */}
        {loading && (
          <div className="flex h-40 items-center justify-center text-gray-400">Loading report…</div>
        )}
        {error && !loading && (
          <div className="flex h-40 items-center justify-center text-red-400">{error}</div>
        )}

        {/* Report Content */}
        {report && !loading && (
          <>
            {/* Period label */}
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Period: <span className="font-medium text-gray-700 dark:text-gray-300">{report.period_start}</span>
              {' '}to{' '}
              <span className="font-medium text-gray-700 dark:text-gray-300">{report.period_end}</span>
            </p>

            {/* KPI Cards — primary 4 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="Total Deposit" value={fmt(report.total_deposit)} />
              <KpiCard label="Total Withdrawal" value={fmt(report.total_withdrawal)} />
              <KpiCard label="Net Deposit" value={fmt(report.net_deposit)} highlight />
              <KpiCard label="Gross Profit" value={fmt(report.gross_profit)} highlight />
            </div>

            {/* Count Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <CountCard label="Deposit Count" value={report.deposit_count} />
              <CountCard label="Withdrawal Count" value={report.withdrawal_count} />
              <CountCard label="First-Time Depositors" value={report.first_deposit_count} />
              <CountCard label="Repeat Depositors" value={report.repeat_deposit_count} />
            </div>

            {/* Full Stats Table */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Full Statistics</h2>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {[
                    ['Total Deposit', `RM ${fmt(report.total_deposit)}`],
                    ['Total Withdrawal', `RM ${fmt(report.total_withdrawal)}`],
                    ['Total Bonus', `RM ${fmt(report.total_bonus)}`],
                    ['Net Deposit', `RM ${fmt(report.net_deposit)}`],
                    ['Gross Profit', `RM ${fmt(report.gross_profit)}`],
                    ['Deposit Count', String(report.deposit_count)],
                    ['Withdrawal Count', String(report.withdrawal_count)],
                    ['Avg Deposit', `RM ${fmt(report.avg_deposit)}`],
                    ['Avg Withdrawal', `RM ${fmt(report.avg_withdrawal)}`],
                    ['First-Time Depositors', String(report.first_deposit_count)],
                    ['Repeat Depositors', String(report.repeat_deposit_count)],
                    ['VIP Deposit Amount', `RM ${fmt(report.vip_deposit_amount)}`],
                  ].map(([label, value], i) => (
                    <tr key={label} className={i % 2 === 0 ? 'bg-gray-50 dark:bg-gray-750' : ''}>
                      <td className="px-4 py-2 text-gray-500 dark:text-gray-400 w-1/2">{label}</td>
                      <td className="px-4 py-2 font-medium text-gray-900 dark:text-gray-100">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Daily Breakdown Charts */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-6">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Daily Breakdown</h2>

              <div>
                <p className="text-xs text-gray-400 mb-2">Deposits (RM)</p>
                <LineChart
                  data={depositChartData}
                  valueKey="value"
                  color="#22c55e"
                  height={140}
                  formatValue={(v) => `RM ${v.toFixed(2)}`}
                />
              </div>

              <div>
                <p className="text-xs text-gray-400 mb-2">Withdrawals (RM)</p>
                <LineChart
                  data={withdrawalChartData}
                  valueKey="value"
                  color="#ef4444"
                  height={140}
                  formatValue={(v) => `RM ${v.toFixed(2)}`}
                />
              </div>

              <div>
                <p className="text-xs text-gray-400 mb-2">Net Deposit (RM)</p>
                <LineChart
                  data={netChartData}
                  valueKey="value"
                  color="#3b82f6"
                  height={140}
                  formatValue={(v) => `RM ${v.toFixed(2)}`}
                />
              </div>
            </div>

            {/* Daily Breakdown Table */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Daily Breakdown Table</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750">
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Date</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Deposit</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Withdrawal</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Bonus</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.daily_breakdown.map((row, i) => (
                      <tr key={row.date} className={i % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-750'}>
                        <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{row.date}</td>
                        <td className="px-4 py-2 text-right text-green-600 dark:text-green-400">{fmt(row.deposit)}</td>
                        <td className="px-4 py-2 text-right text-red-500 dark:text-red-400">{fmt(row.withdrawal)}</td>
                        <td className="px-4 py-2 text-right text-yellow-600 dark:text-yellow-400">{fmt(row.bonus)}</td>
                        <td className={`px-4 py-2 text-right font-medium ${row.net >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-500 dark:text-red-400'}`}>
                          {fmt(row.net)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-gray-200 dark:border-gray-700">
                    <tr className="bg-gray-100 dark:bg-gray-700 font-semibold">
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300">Total</td>
                      <td className="px-4 py-2 text-right text-green-600 dark:text-green-400">{fmt(report.total_deposit)}</td>
                      <td className="px-4 py-2 text-right text-red-500 dark:text-red-400">{fmt(report.total_withdrawal)}</td>
                      <td className="px-4 py-2 text-right text-yellow-600 dark:text-yellow-400">{fmt(report.total_bonus)}</td>
                      <td className={`px-4 py-2 text-right ${report.net_deposit >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-500 dark:text-red-400'}`}>
                        {fmt(report.net_deposit)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
