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
import type { WithdrawalRow, PaginatedResponse } from '@/lib/types';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  PAID:             'default',
  AWAITING_RECEIPT: 'secondary',
  PENDING:          'secondary',
  REJECTED:         'destructive',
};

// ── Receipt Cell ───────────────────────────────────────────────────────────────
function ReceiptCell({
  row,
  onUploaded,
}: {
  row: WithdrawalRow;
  onUploaded: (id: number, mediaId: number) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (row.status !== 'PAID' && row.status !== 'AWAITING_RECEIPT') {
    return <span className="text-xs text-gray-300">—</span>;
  }

  const receiptUrl = row.receipt_media_id ? `/api/public/media/${row.receipt_media_id}` : null;

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/withdrawals/${row.id}/receipt`, { method: 'POST', body: form });
      const data = await res.json() as { ok?: boolean; receipt_media_id?: number; error?: string };
      if (res.ok && data.receipt_media_id) {
        onUploaded(row.id, data.receipt_media_id);
      } else {
        alert(data.error ?? 'Upload failed');
      }
    } catch {
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  }

  if (receiptUrl) {
    return (
      <div className="flex flex-col gap-1">
        <a
          href={receiptUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 hover:underline font-medium"
        >
          View ↗
        </a>
        <a
          href={receiptUrl}
          download={`receipt-wd-${row.id}`}
          className="text-xs text-gray-500 hover:text-gray-800 underline"
        >
          Download
        </a>
      </div>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) { e.target.value = ''; void handleFile(file); }
        }}
      />
      <Button
        size="sm"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="text-xs h-7 px-2"
      >
        {uploading ? 'Uploading…' : 'Upload'}
      </Button>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function WithdrawalsPage() {
  const [data,         setData]         = useState<PaginatedResponse<WithdrawalRow> | null>(null);
  const [status,       setStatus]       = useState('');
  const [page,         setPage]         = useState(1);
  const [loading,      setLoading]      = useState(true);
  const [acting,       setActing]       = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({ page: page.toString() });
    if (status) p.set('status', status);
    fetch(`/api/withdrawals?${p}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [status, page]);

  useEffect(() => { load(); }, [load]);

  async function approve(id: number) {
    setActing(id);
    await fetch(`/api/withdrawals/${id}/approve`, { method: 'POST' });
    setActing(null);
    load();
  }

  async function done(id: number) {
    setActing(id);
    const res = await fetch(`/api/withdrawals/${id}/done`, { method: 'POST' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      alert(body.error ?? 'Failed to complete payment');
    }
    setActing(null);
    load();
  }

  function handleReceiptUploaded(withdrawalId: number, mediaId: number) {
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        data: prev.data.map(w =>
          w.id === withdrawalId ? { ...w, receipt_media_id: mediaId } : w
        ),
      };
    });
  }

  const rows  = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Withdrawal Review Center</h1>

      <Select
        value={status || 'ALL'}
        onValueChange={(v) => { setStatus(v === 'ALL' ? '' : v); setPage(1); }}
      >
        <SelectTrigger className="w-44">
          <SelectValue placeholder="All Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All Status</SelectItem>
          <SelectItem value="PENDING">Pending</SelectItem>
          <SelectItem value="AWAITING_RECEIPT">Awaiting Receipt</SelectItem>
          <SelectItem value="PAID">Paid</SelectItem>
          <SelectItem value="REJECTED">Rejected</SelectItem>
        </SelectContent>
      </Select>

      <div className="rounded-md border bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              {['ID', 'User', 'Provider', 'Amount', 'Bank', 'Status', 'Reason', 'Receipt', 'Created At', 'Actions'].map((h) => (
                <th key={h} className="px-3 py-3 text-left font-medium text-gray-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">No withdrawals found</td></tr>
            ) : rows.map((w) => (
              <tr key={w.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-3 py-3 font-mono text-xs">{w.id}</td>
                <td className="px-3 py-3">
                  <div className="font-medium">{w.first_name}</div>
                  <div className="text-xs text-gray-400">{w.phone}</div>
                </td>
                <td className="px-3 py-3">{w.provider}</td>
                <td className="px-3 py-3">RM {parseFloat(w.withdraw_amount).toFixed(2)}</td>
                <td className="px-3 py-3">
                  <div>{w.bank_name}</div>
                  <div className="text-xs text-gray-400">{w.bank_account}</div>
                </td>
                <td className="px-3 py-3">
                  <Badge variant={STATUS_VARIANT[w.status] ?? 'secondary'}>{w.status}</Badge>
                </td>
                <td className="px-3 py-3 max-w-[150px]">
                  {w.reject_reason ? (
                    <span className="text-xs text-gray-600 break-words">{w.reject_reason}</span>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <ReceiptCell row={w} onUploaded={handleReceiptUploaded} />
                </td>
                <td className="px-3 py-3 text-gray-500 text-xs whitespace-nowrap">
                  {new Date(w.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-3">
                  {w.status === 'PENDING' && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        onClick={() => approve(w.id)}
                        disabled={acting === w.id}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setRejectTarget(w.id)}
                        disabled={acting === w.id}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                  {w.status === 'AWAITING_RECEIPT' && (
                    <Button
                      size="sm"
                      onClick={() => done(w.id)}
                      disabled={acting === w.id}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      {acting === w.id ? 'Processing…' : '✓ Done'}
                    </Button>
                  )}
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
          type="withdrawal"
          id={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onSuccess={() => { setRejectTarget(null); load(); }}
        />
      )}
    </div>
  );
}
