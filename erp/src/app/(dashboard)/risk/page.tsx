'use client';

import { useEffect, useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { RiskScanResult, RiskFlag } from '@/lib/types';

// ── helpers ──────────────────────────────────────────────────────────────────

type SeverityLevel = 'LOW' | 'MEDIUM' | 'HIGH';

function SeverityBadge({ level }: { level: SeverityLevel }) {
  const variant =
    level === 'HIGH' ? 'destructive' : level === 'MEDIUM' ? 'secondary' : 'default';
  return <Badge variant={variant} className="text-xs">{level}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === 'OPEN' ? 'destructive' : status === 'REVIEWED' ? 'default' : 'secondary';
  return <Badge variant={variant} className="text-xs">{status}</Badge>;
}

// ── section wrapper ───────────────────────────────────────────────────────────

function RiskSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-md border bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left font-medium hover:bg-gray-50"
      >
        <span>{title}</span>
        <div className="flex items-center gap-2">
          <Badge variant={count > 0 ? 'destructive' : 'secondary'} className="text-xs">
            {count}
          </Badge>
          <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && <div className="border-t">{children}</div>}
    </div>
  );
}

// ── scan action buttons (hoisted to module scope) ─────────────────────────────

function ScanActions({
  userId,
  riskType,
  isFlagged,
  onFlag,
  onIgnore,
}: {
  userId: number;
  riskType: string;
  isFlagged: boolean;
  onFlag: (userId: number, riskType: string) => void;
  onIgnore: (userId: number, riskType: string) => void;
}) {
  if (isFlagged) {
    return (
      <span className="text-xs text-green-600 font-medium">Flagged ✓</span>
    );
  }
  return (
    <div className="flex gap-1">
      <Button
        size="sm"
        variant="default"
        onClick={() => onFlag(userId, riskType)}
        className="text-xs h-7"
      >
        Flag
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => onIgnore(userId, riskType)}
        className="text-xs h-7"
      >
        Ignore
      </Button>
    </div>
  );
}

// ── response type ─────────────────────────────────────────────────────────────

interface RiskFlagsResponse {
  flags: RiskFlag[];
  stats: { open: number; high: number; reviewed: number };
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function RiskPage() {
  const [tab, setTab] = useState<'scan' | 'flags'>('scan');
  const [scan, setScan] = useState<RiskScanResult | null>(null);
  const [flags, setFlags] = useState<RiskFlag[]>([]);
  const [flagsFilter, setFlagsFilter] = useState('OPEN');
  const [scanLoading, setScanLoading] = useState(false);
  const [flagsLoading, setFlagsLoading] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [flaggedUserIds, setFlaggedUserIds] = useState<Set<number>>(new Set());
  const [stats, setStats] = useState<{ open: number; high: number; reviewed: number }>({
    open: 0,
    high: 0,
    reviewed: 0,
  });

  // ── data loaders ────────────────────────────────────────────────────────────

  const loadScan = useCallback(async () => {
    setScanLoading(true);
    try {
      const r = await fetch('/api/risk/scan');
      if (r.ok) setScan(await r.json());
    } finally {
      setScanLoading(false);
    }
  }, []);

  const loadFlags = useCallback(async (status: string) => {
    setFlagsLoading(true);
    try {
      const params = status ? `?status=${status}` : '';
      const r = await fetch(`/api/risk/flags${params}`);
      if (r.ok) {
        const data: RiskFlagsResponse = await r.json();
        setFlags(data.flags);
        setStats(data.stats);
      }
    } finally {
      setFlagsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'scan' && !scan) loadScan();
  }, [tab, scan, loadScan]);

  useEffect(() => {
    if (tab === 'flags') loadFlags(flagsFilter);
  }, [tab, flagsFilter, loadFlags]);

  // ── actions ─────────────────────────────────────────────────────────────────

  const flagUser = useCallback(async (userId: number, riskType: string, severity: SeverityLevel = 'HIGH') => {
    const key = `flag-${userId}-${riskType}`;
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const r = await fetch('/api/risk/flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, risk_type: riskType, severity }),
      });
      if (r.ok) {
        setFlaggedUserIds((prev) => new Set(prev).add(userId));
        await loadFlags(flagsFilter);
      } else {
        console.error('flagUser failed', r.status, await r.text());
      }
    } catch (err) {
      console.error('flagUser error', err);
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }, [flagsFilter, loadFlags]);

  const ignoreUser = useCallback(async (userId: number, riskType: string) => {
    const key = `ignore-${userId}-${riskType}`;
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const r = await fetch('/api/risk/flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, risk_type: riskType, severity: 'LOW', status: 'IGNORED' }),
      });
      if (r.ok) {
        setFlaggedUserIds((prev) => new Set(prev).add(userId));
        await loadFlags(flagsFilter);
      } else {
        console.error('ignoreUser failed', r.status, await r.text());
      }
    } catch (err) {
      console.error('ignoreUser error', err);
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }, [flagsFilter, loadFlags]);

  async function updateFlag(flagId: number, status: string) {
    const key = `update-${flagId}`;
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      await fetch(`/api/risk/flags/${flagId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await loadFlags(flagsFilter);
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Risk Center</h1>
        {tab === 'scan' && (
          <Button size="sm" onClick={loadScan} disabled={scanLoading}>
            {scanLoading ? 'Scanning…' : 'Re-scan'}
          </Button>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Open Flags', value: stats.open, color: 'text-red-600' },
          { label: 'High Severity', value: stats.high, color: 'text-orange-600' },
          { label: 'Reviewed', value: stats.reviewed, color: 'text-green-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-md border bg-white px-4 py-3">
            <p className="text-xs text-gray-500">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {(['scan', 'flags'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'scan' ? 'Live Scan' : 'Saved Flags'}
          </button>
        ))}
      </div>

      {/* Live Scan Tab */}
      {tab === 'scan' && (
        <div className="space-y-4">
          {scanLoading && (
            <div className="flex h-40 items-center justify-center text-gray-400">Scanning…</div>
          )}

          {!scanLoading && scan && (
            <>
              {/* Duplicate Phones */}
              <RiskSection title="Duplicate Phone Numbers" count={scan.duplicate_phones.length}>
                {scan.duplicate_phones.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-400">No duplicates found.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        {['Phone', 'Users', 'Names', 'Severity', 'Actions'].map((h) => (
                          <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {scan.duplicate_phones.map((row) => (
                        <tr key={row.phone} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-mono">{row.phone}</td>
                          <td className="px-3 py-2">{row.user_count}</td>
                          <td className="px-3 py-2 text-gray-600">{row.names.join(', ')}</td>
                          <td className="px-3 py-2"><SeverityBadge level="HIGH" /></td>
                          <td className="px-3 py-2">
                            {row.user_ids.map((uid, i) => (
                              <div key={uid} className="flex items-center gap-1 mb-1">
                                <span className="text-xs text-gray-500 w-20 truncate">{row.names[i]}</span>
                                <ScanActions
                                  userId={uid}
                                  riskType="DUPLICATE_PHONE"
                                  isFlagged={flaggedUserIds.has(uid)}
                                  onFlag={flagUser}
                                  onIgnore={ignoreUser}
                                />
                              </div>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </RiskSection>

              {/* Duplicate Banks */}
              <RiskSection title="Duplicate Bank Accounts" count={scan.duplicate_banks.length}>
                {scan.duplicate_banks.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-400">No duplicates found.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        {['Bank Account', 'Bank Name', 'Users', 'Names', 'Severity', 'Actions'].map((h) => (
                          <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {scan.duplicate_banks.map((row) => (
                        <tr key={`${row.bank_account}-${row.bank_name}`} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-mono">{row.bank_account}</td>
                          <td className="px-3 py-2">{row.bank_name}</td>
                          <td className="px-3 py-2">{row.user_count}</td>
                          <td className="px-3 py-2 text-gray-600">{row.names.join(', ')}</td>
                          <td className="px-3 py-2"><SeverityBadge level="HIGH" /></td>
                          <td className="px-3 py-2">
                            {row.user_ids.map((uid, i) => (
                              <div key={uid} className="flex items-center gap-1 mb-1">
                                <span className="text-xs text-gray-500 w-20 truncate">{row.names[i]}</span>
                                <ScanActions
                                  userId={uid}
                                  riskType="DUPLICATE_BANK"
                                  isFlagged={flaggedUserIds.has(uid)}
                                  onFlag={flagUser}
                                  onIgnore={ignoreUser}
                                />
                              </div>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </RiskSection>

              {/* High Bonus Ratio */}
              <RiskSection title="High Bonus Ratio (>50% in 30 days)" count={scan.high_bonus_ratio.length}>
                {scan.high_bonus_ratio.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-400">No high bonus ratio users found.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        {['User', 'Total Deposit', 'Total Bonus', 'Bonus Ratio', 'Severity', 'Actions'].map((h) => (
                          <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {scan.high_bonus_ratio.map((row) => (
                        <tr key={row.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium">{row.first_name}</td>
                          <td className="px-3 py-2">{row.total_dep.toFixed(2)}</td>
                          <td className="px-3 py-2">{row.total_bonus.toFixed(2)}</td>
                          <td className="px-3 py-2 text-orange-600 font-medium">
                            {row.bonus_ratio.toFixed(1)}%
                          </td>
                          <td className="px-3 py-2">
                            <SeverityBadge level={row.bonus_ratio > 100 ? 'HIGH' : 'MEDIUM'} />
                          </td>
                          <td className="px-3 py-2">
                            <ScanActions
                              userId={row.id}
                              riskType="HIGH_BONUS_RATIO"
                              isFlagged={flaggedUserIds.has(row.id)}
                              onFlag={flagUser}
                              onIgnore={ignoreUser}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </RiskSection>

              {/* Frequent Withdrawals */}
              <RiskSection title="Frequent Withdrawals (>3 in 7 days)" count={scan.frequent_withdrawals.length}>
                {scan.frequent_withdrawals.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-400">No frequent withdrawal users found.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        {['User', 'Withdrawal Count (7d)', 'Severity', 'Actions'].map((h) => (
                          <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {scan.frequent_withdrawals.map((row) => (
                        <tr key={row.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium">{row.first_name}</td>
                          <td className="px-3 py-2">{row.withdrawal_count}</td>
                          <td className="px-3 py-2">
                            <SeverityBadge level={row.withdrawal_count > 7 ? 'HIGH' : 'MEDIUM'} />
                          </td>
                          <td className="px-3 py-2">
                            <ScanActions
                              userId={row.id}
                              riskType="FREQUENT_WITHDRAWAL"
                              isFlagged={flaggedUserIds.has(row.id)}
                              onFlag={flagUser}
                              onIgnore={ignoreUser}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </RiskSection>

              {/* Rapid Pattern */}
              <RiskSection title="Rapid Deposit→Withdrawal Pattern (within 24h, 30 days)" count={scan.rapid_pattern.length}>
                {scan.rapid_pattern.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-400">No rapid pattern users found.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        {['User', 'Rapid Cycles (30d)', 'Severity', 'Actions'].map((h) => (
                          <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {scan.rapid_pattern.map((row) => (
                        <tr key={row.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium">{row.first_name}</td>
                          <td className="px-3 py-2">{row.rapid_count}</td>
                          <td className="px-3 py-2">
                            <SeverityBadge level={row.rapid_count >= 5 ? 'HIGH' : 'MEDIUM'} />
                          </td>
                          <td className="px-3 py-2">
                            <ScanActions
                              userId={row.id}
                              riskType="RAPID_PATTERN"
                              isFlagged={flaggedUserIds.has(row.id)}
                              onFlag={flagUser}
                              onIgnore={ignoreUser}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </RiskSection>
            </>
          )}

          {!scanLoading && !scan && (
            <div className="flex h-40 items-center justify-center text-gray-400">
              Click Re-scan to load risk data.
            </div>
          )}
        </div>
      )}

      {/* Saved Flags Tab */}
      {tab === 'flags' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {(['', 'OPEN', 'IGNORED', 'REVIEWED'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFlagsFilter(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  flagsFilter === s
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s || 'All'}
              </button>
            ))}
          </div>

          {flagsLoading ? (
            <div className="flex h-40 items-center justify-center text-gray-400">Loading…</div>
          ) : (
            <div className="overflow-x-auto rounded-md border bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    {['ID', 'User', 'Risk Type', 'Severity', 'Status', 'Flagged By', 'Reviewed By', 'Created', 'Note', 'Actions'].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {flags.map((f) => (
                    <tr key={f.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-400">#{f.id}</td>
                      <td className="px-3 py-2 font-medium">{f.user_name ?? `#${f.user_id}`}</td>
                      <td className="px-3 py-2 text-xs font-mono text-gray-600">{f.risk_type}</td>
                      <td className="px-3 py-2"><SeverityBadge level={f.severity} /></td>
                      <td className="px-3 py-2"><StatusBadge status={f.status} /></td>
                      <td className="px-3 py-2 text-gray-500">{f.flagged_by ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-500">{f.reviewed_by ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-400 whitespace-nowrap">
                        {new Date(f.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 max-w-xs truncate text-gray-500">{f.note ?? '—'}</td>
                      <td className="px-3 py-2">
                        {f.status === 'OPEN' && (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="default"
                              disabled={busy[`update-${f.id}`]}
                              onClick={() => updateFlag(f.id, 'REVIEWED')}
                              className="text-xs h-7"
                            >
                              {busy[`update-${f.id}`] ? '…' : 'Review'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy[`update-${f.id}`]}
                              onClick={() => updateFlag(f.id, 'IGNORED')}
                              className="text-xs h-7"
                            >
                              Ignore
                            </Button>
                          </div>
                        )}
                        {f.status !== 'OPEN' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy[`update-${f.id}`]}
                            onClick={() => updateFlag(f.id, 'OPEN')}
                            className="text-xs h-7"
                          >
                            Reopen
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {flags.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-3 py-8 text-center text-gray-400">
                        No flags found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
