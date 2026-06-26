'use client';

import { useEffect, useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AccountPoolRow, AccountStats } from '@/lib/types';

// ─── helpers ────────────────────────────────────────────────────────────────

function parseBulkImport(
  text: string
): { provider: string; username: string; password: string }[] {
  return text
    .trim()
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      const [provider, username, password] = l.split(',').map((s) => s.trim());
      return { provider: provider ?? '', username: username ?? '', password: password ?? '' };
    })
    .filter((r) => r.provider && r.username);
}

function exportCSV(accounts: AccountPoolRow[]) {
  const rows = [
    ['Provider', 'Username', 'Status', 'Assigned To'],
    ...accounts.map((a) => [
      a.provider,
      a.username,
      a.status,
      a.assigned_user_name ?? '',
    ]),
  ];
  const csv = rows.map((r) => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'accounts.csv';
  a.click();
  URL.revokeObjectURL(url);
}

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  AVAILABLE: 'default',
  ASSIGNED:  'secondary',
  DISABLED:  'destructive',
};

// ─── types ──────────────────────────────────────────────────────────────────

interface ApiResponse {
  accounts: AccountPoolRow[];
  total: number;
  stats: AccountStats;
  providers: string[];
  page: number;
  limit: number;
}

// ─── page ───────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function AccountsPage() {
  // data
  const [data, setData]         = useState<ApiResponse | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  // filters
  const [provider, setProvider] = useState('');
  const [status, setStatus]     = useState('');
  const [search, setSearch]     = useState('');
  const [page, setPage]         = useState(1);

  // per-row reassign inputs
  const [reassignInputs, setReassignInputs] = useState<Record<number, string>>({});
  const [actionLoading, setActionLoading]   = useState<Record<number, boolean>>({});

  // bulk import
  const [showImport, setShowImport]   = useState(false);
  const [importText, setImportText]   = useState('');
  const [importing, setImporting]     = useState(false);
  const [importResult, setImportResult] = useState('');

  // ── fetch ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (provider) qs.set('provider', provider);
      if (status)   qs.set('status',   status);
      if (search)   qs.set('search',   search);
      qs.set('page',  String(page));
      qs.set('limit', String(PAGE_SIZE));

      const res = await fetch(`/api/accounts?${qs.toString()}`);
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [provider, status, search, page]);

  useEffect(() => { void load(); }, [load]);

  // ── actions ────────────────────────────────────────────────────────────────

  async function setRowLoading(id: number, val: boolean) {
    setActionLoading((prev) => ({ ...prev, [id]: val }));
  }

  async function handleUnassign(id: number) {
    await setRowLoading(id, true);
    await fetch(`/api/accounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_user_id: null }),
    });
    await setRowLoading(id, false);
    void load();
  }

  async function handleStatusToggle(account: AccountPoolRow) {
    const newStatus = account.status === 'DISABLED' ? 'AVAILABLE' : 'DISABLED';
    await setRowLoading(account.id, true);
    await fetch(`/api/accounts/${account.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    await setRowLoading(account.id, false);
    void load();
  }

  async function handleReassign(id: number) {
    const raw = reassignInputs[id]?.trim();
    if (!raw) return;
    const userId = parseInt(raw, 10);
    if (isNaN(userId)) { alert('Enter a valid numeric user ID'); return; }
    await setRowLoading(id, true);
    await fetch(`/api/accounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_user_id: userId }),
    });
    setReassignInputs((prev) => ({ ...prev, [id]: '' }));
    await setRowLoading(id, false);
    void load();
  }

  async function handleImport() {
    const rows = parseBulkImport(importText);
    if (rows.length === 0) { setImportResult('No valid rows found.'); return; }
    setImporting(true);
    setImportResult('');
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const d = await res.json();
      if (res.ok) {
        setImportResult(`Imported ${d.inserted} account(s).`);
        setImportText('');
        void load();
      } else {
        setImportResult(d.error ?? 'Import failed');
      }
    } catch {
      setImportResult('Network error');
    } finally {
      setImporting(false);
    }
  }

  // ── render helpers ─────────────────────────────────────────────────────────

  const stats = data?.stats;
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Game Accounts</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => data && exportCSV(data.accounts)}>
            Export CSV
          </Button>
          <Button onClick={() => { setShowImport((v) => !v); setImportResult(''); }}>
            {showImport ? 'Hide Import' : 'Bulk Import'}
          </Button>
        </div>
      </div>

      {/* ── Stats cards ── */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total',     value: stats.total,     color: 'text-gray-800' },
            { label: 'Available', value: stats.available, color: 'text-green-600' },
            { label: 'Assigned',  value: stats.assigned,  color: 'text-blue-600'  },
            { label: 'Disabled',  value: stats.disabled,  color: 'text-red-500'   },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg border bg-white p-4 shadow-sm">
              <div className="text-xs text-gray-500">{label}</div>
              <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Provider breakdown ── */}
      {stats && stats.by_provider.length > 0 && (
        <div className="rounded-lg border bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">By Provider</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500">
                  <th className="pb-1 pr-4">Provider</th>
                  <th className="pb-1 pr-4 text-green-600">Available</th>
                  <th className="pb-1 pr-4 text-blue-600">Assigned</th>
                  <th className="pb-1 text-red-500">Disabled</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {stats.by_provider.map((p) => (
                  <tr key={p.provider}>
                    <td className="py-1 pr-4 font-medium">{p.provider}</td>
                    <td className="py-1 pr-4 text-green-600">{p.available}</td>
                    <td className="py-1 pr-4 text-blue-600">{p.assigned}</td>
                    <td className="py-1 text-red-500">{p.disabled}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Bulk Import (collapsible) ── */}
      {showImport && (
        <div className="rounded-lg border bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Bulk Import</h2>
          <p className="mb-2 text-xs text-gray-500">
            One account per line: <code className="rounded bg-gray-100 px-1">provider,username,password</code>
          </p>
          <textarea
            className="w-full rounded border p-2 font-mono text-xs"
            rows={6}
            placeholder={"SLOT123,player1,pass123\nSLOT123,player2,pass456"}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <div className="mt-2 flex items-center gap-3">
            <Button onClick={handleImport} disabled={importing}>
              {importing ? 'Importing…' : 'Import'}
            </Button>
            {importResult && (
              <span className="text-sm text-gray-700">{importResult}</span>
            )}
          </div>
        </div>
      )}

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap gap-2">
        <select
          className="rounded border px-3 py-1.5 text-sm"
          value={provider}
          onChange={(e) => { setProvider(e.target.value); setPage(1); }}
        >
          <option value="">All Providers</option>
          {data?.providers.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select
          className="rounded border px-3 py-1.5 text-sm"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
        >
          <option value="">All Statuses</option>
          <option value="AVAILABLE">Available</option>
          <option value="ASSIGNED">Assigned</option>
          <option value="DISABLED">Disabled</option>
        </select>
        <Input
          className="w-48"
          placeholder="Search username / provider…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <Button variant="outline" size="sm" onClick={() => { setProvider(''); setStatus(''); setSearch(''); setPage(1); }}>
          Clear
        </Button>
      </div>

      {/* ── Error / loading ── */}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {loading ? (
        <div className="flex h-40 items-center justify-center text-gray-400">Loading…</div>
      ) : (
        <>
          {/* ── Accounts table ── */}
          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-600">
                <tr>
                  {['Provider', 'Username', 'Status', 'Assigned To', 'Actions'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {(data?.accounts ?? []).map((acc) => (
                  <tr key={acc.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium">{acc.provider}</td>
                    <td className="px-3 py-2 font-mono">{acc.username}</td>
                    <td className="px-3 py-2">
                      <Badge variant={STATUS_COLORS[acc.status] ?? 'outline'}>
                        {acc.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {acc.assigned_user_name
                        ? `${acc.assigned_user_name} (#${acc.assigned_user_id})`
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        {/* Reassign */}
                        <Input
                          className="h-7 w-20 text-xs"
                          placeholder="User ID"
                          value={reassignInputs[acc.id] ?? ''}
                          onChange={(e) =>
                            setReassignInputs((prev) => ({ ...prev, [acc.id]: e.target.value }))
                          }
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          disabled={!!actionLoading[acc.id]}
                          onClick={() => handleReassign(acc.id)}
                        >
                          Assign
                        </Button>
                        {/* Unassign */}
                        {acc.status === 'ASSIGNED' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            disabled={!!actionLoading[acc.id]}
                            onClick={() => handleUnassign(acc.id)}
                          >
                            Unassign
                          </Button>
                        )}
                        {/* Enable / Disable */}
                        <Button
                          size="sm"
                          variant={acc.status === 'DISABLED' ? 'outline' : 'destructive'}
                          className="h-7 px-2 text-xs"
                          disabled={!!actionLoading[acc.id]}
                          onClick={() => handleStatusToggle(acc)}
                        >
                          {acc.status === 'DISABLED' ? 'Enable' : 'Disable'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(data?.accounts ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-gray-400">
                      No accounts found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>
                {data?.total ?? 0} total — page {page} of {totalPages}
              </span>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Prev
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
