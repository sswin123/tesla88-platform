'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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

  // 500ms debounce for search input
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

  // Keep loadRef current so SSE handler never captures stale closure
  useEffect(() => { loadRef.current = load; }, [load]);

  // Load data on user-action-driven state changes
  useEffect(() => { load(false); }, [load]);

  // Initial pending count
  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  // SSE subscription — 250ms throttle, no sound (sidebar handles that)
  useEffect(() => {
    const es = new EventSource('/api/transactions/stream');
    es.onmessage = () => {
      if (refreshTimer.current) return;
      refreshTimer.current = setTimeout(() => {
        refreshTimer.current = null;
        fetchCounts();
        loadRef.current(true);
      }, 250);
    };
    return () => {
      es.close();
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
      }
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = null;
      }
    };
  }, [fetchCounts]);

  function switchTab(t: TabType) {
    setTab(t);
    setStatus('');
    setPage(1);
    setHighlightedIds(new Set());
  }

  const tabLabel = (t: TabType): string => {
    switch (t) {
      case 'pending':    return pendingCounts.count > 0 ? `Pending (${pendingCounts.count})` : 'Pending';
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
        <h1 className="text-2xl font-bold">Transactions</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(['pending', 'all', 'deposit', 'withdrawal'] as const).map(t => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tabLabel(t)}
          </button>
        ))}
      </div>

      {/* Pending Summary Card — only on pending tab */}
      {tab === 'pending' && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border bg-white p-4">
            <div className="text-xs text-gray-500 mb-1">Deposits Pending</div>
            <div className="text-2xl font-bold text-emerald-600">{pendingCounts.deposit_count}</div>
          </div>
          <div className="rounded-lg border bg-white p-4">
            <div className="text-xs text-gray-500 mb-1">Withdrawals Pending</div>
            <div className="text-2xl font-bold text-orange-600">{pendingCounts.withdrawal_count}</div>
          </div>
          <div className="rounded-lg border bg-white p-4">
            <div className="text-xs text-gray-500 mb-1">Total Pending</div>
            <div className="text-2xl font-bold text-gray-900">{pendingCounts.count}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by Member ID, username, phone..."
          className="border rounded-md px-3 py-1.5 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-gray-300"
        />

        {/* Status filter — hidden on pending tab */}
        {tab !== 'pending' && (
          <Select
            value={status || 'ALL'}
            onValueChange={v => { setStatus(v === 'ALL' ? '' : v); setPage(1); }}
          >
            <SelectTrigger className="w-44">
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

        <span className="text-sm text-gray-400">Total: {total}</span>
      </div>

      {/* Table */}
      <div className="rounded-md border bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              {['ID', 'Type', 'Member', 'Amount', 'Status', 'Time', 'Actions'].map(h => (
                <th key={h} className="px-3 py-3 text-left font-medium text-gray-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  {tab === 'pending' ? 'No pending transactions.' : 'No transactions found.'}
                </td>
              </tr>
            ) : rows.map(row => (
              <tr
                key={`${row.type}-${row.id}`}
                className={`border-b last:border-0 hover:bg-gray-50 ${
                  highlightedIds.has(`${row.type}-${row.id}`) ? 'animate-highlight' : ''
                }`}
              >
                <td className="px-3 py-3 font-mono text-xs text-gray-500">{row.id}</td>

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
                  <div className="text-xs text-gray-400">{row.phone}</div>
                </td>

                <td className="px-3 py-3 whitespace-nowrap font-medium">
                  RM {parseFloat(row.amount).toFixed(2)}
                </td>

                <td className="px-3 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_CLASS[row.status] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                    {row.status}
                  </span>
                  {row.status === 'PROCESSING' && row.processing_by_name && (
                    <div className="text-xs text-blue-600 mt-0.5">by {row.processing_by_name}</div>
                  )}
                </td>

                <td className="px-3 py-3 text-xs text-gray-400 whitespace-nowrap">
                  {new Date(row.created_at).toLocaleString()}
                </td>

                <td className="px-3 py-3">
                  {(row.status === 'PENDING' || row.status === 'PROCESSING') ? (
                    <Link href={`/transactions/${row.type}/${row.id}`}>
                      <Button size="sm" variant="outline" className="text-xs h-7">
                        Handle
                      </Button>
                    </Link>
                  ) : (
                    <Link href={`/transactions/${row.type}/${row.id}`}>
                      <Button size="sm" variant="ghost" className="text-xs h-7 text-gray-400">
                        View
                      </Button>
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-end gap-2 text-sm">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page === 1}
        >
          Previous
        </Button>
        <span className="px-2 py-1 text-gray-500">Page {page}</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPage(p => p + 1)}
          disabled={page * 20 >= total}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
