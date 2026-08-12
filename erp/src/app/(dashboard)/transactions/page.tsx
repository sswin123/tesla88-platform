'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { subscribeSSE } from '@/lib/sse-manager';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import MemberLink from '@/components/MemberLink';
import type { PaginatedResponse } from '@/lib/types';

interface TransactionRow {
  id: number;
  type: 'deposit' | 'withdrawal';
  user_id: number;
  first_name: string;
  phone: string;
  public_id: string | null;
  amount: string;
  status: string;
  reject_reason: string | null;
  processing_by: number | null;
  processing_by_name: string | null;
  processing_at: string | null;
  created_at: string;
}

interface PendingCounts {
  count: number;
  deposit_count: number;
  withdrawal_count: number;
  active_count?: number;
  deposit_active_count?: number;
  withdrawal_active_count?: number;
}

type TabType = 'pending' | 'all' | 'deposit' | 'withdrawal';

const STATUS_CLASS: Record<string, string> = {
  APPROVED:   'bg-green-100 text-green-800 border-green-200',
  PAID:       'bg-green-100 text-green-800 border-green-200',
  PENDING:    'bg-yellow-100 text-yellow-800 border-yellow-200',
  PROCESSING: 'bg-blue-100 text-blue-800 border-blue-200',
  REJECTED:   'bg-red-100 text-red-800 border-red-200',
};

const TYPE_CLASS: Record<string, string> = {
  deposit:    'bg-emerald-50 text-emerald-700 border border-emerald-200',
  withdrawal: 'bg-orange-50 text-orange-700 border border-orange-200',
};

export default function TransactionsPage() {
  const [data,            setData]            = useState<PaginatedResponse<TransactionRow> | null>(null);
  const [tab,             setTab]             = useState<TabType>('pending');
  const [status,          setStatus]          = useState('');
  const [page,            setPage]            = useState(1);
  const [search,          setSearch]          = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading,         setLoading]         = useState(true);
  const [pendingCounts,   setPendingCounts]   = useState<PendingCounts>({ count: 0, deposit_count: 0, withdrawal_count: 0 });
  const [highlightedIds,  setHighlightedIds]  = useState<Set<string>>(new Set());

  const prevIdsRef      = useRef<Set<string>>(new Set());
  const refreshTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadRef         = useRef<(rt?: boolean) => void>(() => {});

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchCounts = useCallback(() => {
    fetch('/api/transactions/pending-count')
      .then(r => (r.ok ? r.json() : null))
      .then((d: PendingCounts | null) => {
        if (d !== null) setPendingCounts(d);
      })
      .catch(() => {});
  }, []);

  const load = useCallback((realtimeRefresh = false) => {
    if (!realtimeRefresh) setLoading(true);
    const p = new URLSearchParams({ page: page.toString() });
    p.set('type', tab);
    if (debouncedSearch) p.set('search', debouncedSearch);
    if (tab !== 'pending' && status) p.set('status', status);

    fetch(`/api/transactions?${p}`)
      .then(r => r.json())
      .then((d: PaginatedResponse<TransactionRow>) => {
        if (realtimeRefresh) {
          const newIds = new Set(d.data.map(row => `${row.type}-${row.id}`));
          const newlyAdded = new Set<string>();
          newIds.forEach(key => {
            if (!prevIdsRef.current.has(key)) newlyAdded.add(key);
          });
          if (newlyAdded.size > 0) {
            if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
            setHighlightedIds(newlyAdded);
            highlightTimerRef.current = setTimeout(() => {
              highlightTimerRef.current = null;
              setHighlightedIds(new Set());
            }, 2500);
          }
          prevIdsRef.current = newIds;
        } else {
          prevIdsRef.current = new Set(d.data.map(row => `${row.type}-${row.id}`));
          setHighlightedIds(new Set());
        }
        setData(d);
      })
      .catch(console.error)
      .finally(() => {
        if (!realtimeRefresh) setLoading(false);
      });
  }, [tab, status, page, debouncedSearch]);

  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => { load(false); }, [load]);
  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  useEffect(() => {
    const unsub = subscribeSSE('/api/transactions/stream', () => {
      if (refreshTimer.current) return;
      refreshTimer.current = setTimeout(() => {
        refreshTimer.current = null;
        fetchCounts();
        loadRef.current(true);
      }, 250);
    });
    return () => {
      unsub();
      if (refreshTimer.current) { clearTimeout(refreshTimer.current); refreshTimer.current = null; }
      if (highlightTimerRef.current) { clearTimeout(highlightTimerRef.current); highlightTimerRef.current = null; }
    };
  }, [fetchCounts]);

  function switchTab(t: TabType) {
    setTab(t); setStatus(''); setPage(1); setHighlightedIds(new Set());
  }

  const tabLabel = (t: TabType): string => {
    const activeCount = pendingCounts.active_count ?? pendingCounts.count;
    switch (t) {
      case 'pending':    return activeCount > 0 ? `Pending (${activeCount})` : 'Pending';
      case 'all':        return 'All';
      case 'deposit':    return 'Deposits';
      case 'withdrawal': return 'Withdrawals';
    }
  };

  const rows  = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Transactions</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(['pending', 'all', 'deposit', 'withdrawal'] as const).map(t => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tabLabel(t)}
          </button>
        ))}
      </div>

      {/* Pending Summary Cards */}
      {tab === 'pending' && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1">Deposits Pending / Processing</div>
            <div className="text-2xl font-bold text-emerald-600">
              {pendingCounts.deposit_active_count ?? pendingCounts.deposit_count}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1">Withdrawals Pending / Processing</div>
            <div className="text-2xl font-bold text-orange-600">
              {pendingCounts.withdrawal_active_count ?? pendingCounts.withdrawal_count}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1">Total Active</div>
            <div className="text-2xl font-bold text-foreground">
              {pendingCounts.active_count ?? pendingCounts.count}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by Member ID, username, phone..."
          className="border border-border rounded-md px-3 py-1.5 text-sm w-full sm:w-72 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />

        {tab !== 'pending' && (
          <Select
            value={status || 'ALL'}
            onValueChange={v => { setStatus(v === 'ALL' ? '' : v); setPage(1); }}
          >
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Status</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="PROCESSING">Processing</SelectItem>
              <SelectItem value="approved_paid">Approved / Paid</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
            </SelectContent>
          </Select>
        )}

        <span className="text-sm text-muted-foreground sm:ml-auto">Total: {total}</span>
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block rounded-md border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted">
            <tr>
              {['ID', 'Type', 'Member', 'Amount', 'Status', 'Time', 'Actions'].map(h => (
                <th key={h} className="px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  {tab === 'pending' ? 'No pending transactions.' : 'No transactions found.'}
                </td>
              </tr>
            ) : rows.map(row => (
              <tr
                key={`${row.type}-${row.id}`}
                className={`border-b border-border last:border-0 hover:bg-muted/50 transition-colors ${
                  highlightedIds.has(`${row.type}-${row.id}`) ? 'animate-highlight' : ''
                }`}
              >
                <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{row.id}</td>
                <td className="px-3 py-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${TYPE_CLASS[row.type]}`}>
                    {row.type === 'deposit' ? '🟢 Deposit' : '🟠 Withdraw'}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <MemberLink userId={row.user_id} name={row.first_name} />
                  {row.public_id && (
                    <div className="font-mono text-xs text-blue-500">{row.public_id}</div>
                  )}
                  <div className="text-xs text-muted-foreground">{row.phone}</div>
                </td>
                <td className="px-3 py-3 whitespace-nowrap font-medium text-foreground">
                  RM {parseFloat(row.amount).toFixed(2)}
                </td>
                <td className="px-3 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_CLASS[row.status] ?? 'bg-muted text-muted-foreground border-border'}`}>
                    {row.status}
                  </span>
                  {row.status === 'PROCESSING' && row.processing_by_name && (
                    <div className="text-xs text-blue-600 mt-0.5">by {row.processing_by_name}</div>
                  )}
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(row.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-3">
                  {(row.status === 'PENDING' || row.status === 'PROCESSING') ? (
                    <Link href={`/transactions/${row.type}/${row.id}`}>
                      <Button size="sm" variant="outline" className="text-xs h-7">Handle</Button>
                    </Link>
                  ) : (
                    <Link href={`/transactions/${row.type}/${row.id}`}>
                      <Button size="sm" variant="ghost" className="text-xs h-7">View</Button>
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="lg:hidden space-y-3">
        {loading ? (
          <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-muted-foreground">
            {tab === 'pending' ? 'No pending transactions.' : 'No transactions found.'}
          </div>
        ) : rows.map(row => (
          <div
            key={`${row.type}-${row.id}`}
            className={`rounded-lg border border-border bg-card p-4 ${highlightedIds.has(`${row.type}-${row.id}`) ? 'animate-highlight' : ''}`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${TYPE_CLASS[row.type]}`}>
                  {row.type === 'deposit' ? '🟢 Deposit' : '🟠 Withdraw'}
                </span>
                <span className="font-mono text-xs text-muted-foreground">#{row.id}</span>
              </div>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_CLASS[row.status] ?? 'bg-muted text-muted-foreground border-border'}`}>
                {row.status}
              </span>
            </div>

            <div className="space-y-1 text-sm mb-3">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Member</span>
                <span className="font-medium text-foreground">{row.first_name}</span>
              </div>
              {row.public_id && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Member ID</span>
                  <span className="font-mono text-xs text-blue-500">{row.public_id}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold text-foreground">RM {parseFloat(row.amount).toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Time</span>
                <span className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</span>
              </div>
              {row.status === 'PROCESSING' && row.processing_by_name && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Handler</span>
                  <span className="text-xs text-blue-600">{row.processing_by_name}</span>
                </div>
              )}
            </div>

            <Link href={`/transactions/${row.type}/${row.id}`} className="block">
              <Button
                size="sm"
                variant={(row.status === 'PENDING' || row.status === 'PROCESSING') ? 'default' : 'outline'}
                className="w-full h-10"
              >
                {(row.status === 'PENDING' || row.status === 'PROCESSING') ? 'Handle →' : 'View →'}
              </Button>
            </Link>
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-end gap-2 text-sm">
        <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
          Previous
        </Button>
        <span className="px-2 py-1 text-muted-foreground">Page {page}</span>
        <Button size="sm" variant="outline" onClick={() => setPage(p => p + 1)} disabled={page * 20 >= total}>
          Next
        </Button>
      </div>
    </div>
  );
}
