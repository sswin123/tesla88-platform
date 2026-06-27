'use client';

import { useEffect, useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import RejectModal from '@/components/RejectModal';
import type { DepositRow, PaginatedResponse } from '@/lib/types';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  APPROVED: 'default',
  PENDING:  'secondary',
  REJECTED: 'destructive',
};

export default function DepositsPage() {
  const [data,         setData]         = useState<PaginatedResponse<DepositRow> | null>(null);
  const [status,       setStatus]       = useState('');
  const [page,         setPage]         = useState(1);
  const [loading,      setLoading]      = useState(true);
  const [acting,       setActing]       = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({ page: page.toString() });
    if (status) p.set('status', status);
    fetch(`/api/deposits?${p}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [status, page]);

  useEffect(() => { load(); }, [load]);

  async function approve(id: number) {
    setActing(id);
    await fetch(`/api/deposits/${id}/approve`, { method: 'POST' });
    setActing(null);
    load();
  }

  const rows  = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Deposit Review Center</h1>

      <Select
        value={status || 'ALL'}
        onValueChange={(v) => { setStatus(v === 'ALL' ? '' : v); setPage(1); }}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="All Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All Status</SelectItem>
          <SelectItem value="PENDING">Pending</SelectItem>
          <SelectItem value="APPROVED">Approved</SelectItem>
          <SelectItem value="REJECTED">Rejected</SelectItem>
        </SelectContent>
      </Select>

      <div className="rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              {['ID', 'User', 'Provider', 'Amount', 'Bonus', 'Credit', 'Status', 'Reason', 'Created At', 'Actions'].map((h) => (
                <th key={h} className="px-3 py-3 text-left font-medium text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">No deposits found</td></tr>
            ) : rows.map((d) => (
              <tr key={d.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-3 py-3 font-mono text-xs">{d.id}</td>
                <td className="px-3 py-3">
                  <div className="font-medium">{d.first_name}</div>
                  <div className="text-xs text-gray-400">{d.phone}</div>
                </td>
                <td className="px-3 py-3">{d.provider}</td>
                <td className="px-3 py-3">RM {parseFloat(d.deposit_amount).toFixed(2)}</td>
                <td className="px-3 py-3">RM {parseFloat(d.bonus_amount).toFixed(2)}</td>
                <td className="px-3 py-3">RM {parseFloat(d.credit_amount).toFixed(2)}</td>
                <td className="px-3 py-3">
                  <Badge variant={STATUS_VARIANT[d.status]}>{d.status}</Badge>
                </td>
                <td className="px-3 py-3 max-w-[160px]">
                  {d.reject_reason ? (
                    <span className="text-xs text-gray-600 break-words">{d.reject_reason}</span>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </td>
                <td className="px-3 py-3 text-gray-500 text-xs">
                  {new Date(d.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="outline" asChild>
                      <a
                        href={`/api/deposits/${d.id}/receipt`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Receipt
                      </a>
                    </Button>
                    {d.status === 'PENDING' && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => approve(d.id)}
                          disabled={acting === d.id}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setRejectTarget(d.id)}
                          disabled={acting === d.id}
                        >
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">Total: {total}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            Previous
          </Button>
          <span className="px-2 py-1 text-gray-500">Page {page}</span>
          <Button size="sm" variant="outline" onClick={() => setPage((p) => p + 1)} disabled={page * 20 >= total}>
            Next
          </Button>
        </div>
      </div>

      {rejectTarget !== null && (
        <RejectModal
          type="deposit"
          id={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onSuccess={() => { setRejectTarget(null); load(); }}
        />
      )}
    </div>
  );
}
