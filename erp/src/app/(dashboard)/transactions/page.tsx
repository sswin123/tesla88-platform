'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
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

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  APPROVED:   'default',
  PAID:       'default',
  PENDING:    'secondary',
  PROCESSING: 'outline',
  REJECTED:   'destructive',
};

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

type TabType = 'all' | 'deposit' | 'withdrawal';

export default function TransactionsPage() {
  const [data,    setData]    = useState<PaginatedResponse<TransactionRow> | null>(null);
  const [tab,     setTab]     = useState<TabType>('all');
  const [status,  setStatus]  = useState('');
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({ page: page.toString() });
    if (tab !== 'all') p.set('type', tab);
    if (status) p.set('status', status);
    fetch(`/api/transactions?${p}`)
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [tab, status, page]);

  useEffect(() => { load(); }, [load]);

  // SSE: refresh when new deposit arrives
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => {
    const es = new EventSource('/api/deposits/stream');
    es.onmessage = (e: MessageEvent) => {
      try {
        const evt = JSON.parse(e.data as string) as { type?: string };
        if (evt.type === 'new_deposit') loadRef.current();
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, []);

  function switchTab(t: TabType) {
    setTab(t);
    setStatus('');
    setPage(1);
  }

  const rows  = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Transactions</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(['all', 'deposit', 'withdrawal'] as const).map(t => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
              tab === t
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'all' ? 'All' : t === 'deposit' ? 'Deposits' : 'Withdrawals'}
          </button>
        ))}
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-3">
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
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No transactions found</td></tr>
            ) : rows.map(row => (
              <tr key={`${row.type}-${row.id}`} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-3 py-3 font-mono text-xs text-gray-500">{row.id}</td>

                <td className="px-3 py-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${TYPE_CLASS[row.type]}`}>
                    {row.type === 'deposit' ? '↓ Dep' : '↑ Wd'}
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
        <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
          Previous
        </Button>
        <span className="px-2 py-1 text-gray-500">Page {page}</span>
        <Button size="sm" variant="outline" onClick={() => setPage(p => p + 1)} disabled={page * 20 >= total}>
          Next
        </Button>
      </div>
    </div>
  );
}
