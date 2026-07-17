'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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
import DepositDetailModal from '@/components/DepositDetailModal';
import type { DepositRow, PaginatedResponse } from '@/lib/types';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  APPROVED: 'default',
  PENDING:  'secondary',
  REJECTED: 'destructive',
};

export default function DepositsPage() {
  const [data,          setData]          = useState<PaginatedResponse<DepositRow> | null>(null);
  const [status,        setStatus]        = useState('');
  const [page,          setPage]          = useState(1);
  const [loading,       setLoading]       = useState(true);
  const [acting,        setActing]        = useState<number | null>(null);
  const [rejectTarget,  setRejectTarget]  = useState<number | null>(null);
  const [detailTarget,  setDetailTarget]  = useState<number | null>(null);

  // Clear deposit badge as soon as operator opens this page
  useEffect(() => {
    fetch('/api/deposits/unread', { method: 'POST' }).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({ page: page.toString() });
    if (status) p.set('status', status);
    fetch(`/api/deposits?${p}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<PaginatedResponse<DepositRow>>;
      })
      .then(setData)
      .catch((err) => {
        console.error('[deposits] load error:', err);
        setData({ data: [], total: 0, page, limit: 20 } as unknown as PaginatedResponse<DepositRow>);
      })
      .finally(() => setLoading(false));
  }, [status, page]);

  useEffect(() => { load(); }, [load]);

  // SSE: auto-reload when a new deposit arrives while operator is on this page
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

      <div className="rounded-md border bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              {['ID', 'User', 'Provider', 'Amount', 'Bonus', 'Receiving Bank', 'Credit', 'Status', 'Reason', 'Created At', 'Actions'].map((h) => (
                <th key={h} className="px-3 py-3 text-left font-medium text-gray-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400">No deposits found</td></tr>
            ) : rows.map((d) => (
              <tr key={d.id} className="border-b last:border-0 hover:bg-gray-50">

                {/* ID */}
                <td className="px-3 py-3 font-mono text-xs">{d.id}</td>

                {/* User — Feature #2: public_id above name */}
                <td className="px-3 py-3">
                  {d.public_id ? (
                    <>
                      <div className="font-mono text-xs font-semibold text-blue-600">{d.public_id}</div>
                      <div className="text-sm">{d.first_name}</div>
                    </>
                  ) : (
                    <>
                      <div className="font-medium text-sm">{d.first_name}</div>
                      <div className="text-xs text-gray-400">{d.phone}</div>
                    </>
                  )}
                </td>

                {/* Provider */}
                <td className="px-3 py-3 whitespace-nowrap">{d.provider || <span className="text-gray-300">—</span>}</td>

                {/* Deposit Amount */}
                <td className="px-3 py-3 whitespace-nowrap">RM {parseFloat(d.deposit_amount).toFixed(2)}</td>

                {/* Bonus — Feature #3: promotion name + amount */}
                <td className="px-3 py-3">
                  {d.promo_name ? (
                    <>
                      <div className="text-sm font-medium leading-snug">{d.promo_name}</div>
                      {parseFloat(d.bonus_amount) > 0 && (
                        <div className="text-xs text-gray-400">(+RM {parseFloat(d.bonus_amount).toFixed(2)})</div>
                      )}
                    </>
                  ) : parseFloat(d.bonus_amount) > 0 ? (
                    <span className="text-sm text-gray-600">RM {parseFloat(d.bonus_amount).toFixed(2)}</span>
                  ) : (
                    <span className="text-xs text-gray-400">No Bonus</span>
                  )}
                </td>

                {/* Receiving Bank */}
                <td className="px-3 py-3">
                  {d.receiving_bank_id ? (
                    <>
                      <div className="text-sm font-medium leading-snug">{d.receiving_bank_name}</div>
                      <div className="text-xs text-gray-500">{d.receiving_bank_account_name}</div>
                      <div className="font-mono text-xs text-gray-600 font-medium">
                        {d.receiving_bank_account_number ?? '—'}
                      </div>
                    </>
                  ) : d.payment_bank ? (
                    <span className="text-xs text-gray-500">{d.payment_bank}</span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>

                {/* Credit Amount */}
                <td className="px-3 py-3 whitespace-nowrap">RM {parseFloat(d.credit_amount).toFixed(2)}</td>

                {/* Status */}
                <td className="px-3 py-3">
                  <Badge variant={STATUS_VARIANT[d.status]}>{d.status}</Badge>
                </td>

                {/* Reject Reason */}
                <td className="px-3 py-3 max-w-[140px]">
                  {d.reject_reason ? (
                    <span className="text-xs text-gray-600 break-words">{d.reject_reason}</span>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </td>

                {/* Created At */}
                <td className="px-3 py-3 text-gray-500 text-xs whitespace-nowrap">
                  {new Date(d.created_at).toLocaleString()}
                </td>

                {/* Actions — Feature #5: Receipt opens detail modal */}
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDetailTarget(d.id)}
                    >
                      Receipt
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

      {/* Pagination */}
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

      {/* Reject Modal */}
      {rejectTarget !== null && (
        <RejectModal
          type="deposit"
          id={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onSuccess={() => { setRejectTarget(null); load(); }}
        />
      )}

      {/* Deposit Detail Modal — Feature #5 */}
      {detailTarget !== null && (
        <DepositDetailModal
          depositId={detailTarget}
          onClose={() => setDetailTarget(null)}
        />
      )}
    </div>
  );
}
