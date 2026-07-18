'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import RejectModal from '@/components/RejectModal';
import MemberLink from '@/components/MemberLink';

interface HandleDetail {
  id: number;
  type: 'deposit' | 'withdrawal';
  user_id: number;
  status: string;
  reject_reason: string | null;
  created_at: string;
  // Processing state
  processing_by: number | null;
  processing_by_name: string | null;
  processing_at: string | null;
  approved_by: number | null;
  approved_at: string | null;
  rejected_by: number | null;
  rejected_at: string | null;
  // Member
  first_name: string;
  phone: string;
  public_id: string | null;
  available_balance: string;
  // Deposit-specific
  deposit_amount?: string;
  bonus_amount?: string;
  credit_amount?: string;
  payment_bank?: string;
  promo_name?: string | null;
  receiving_bank_name?: string | null;
  receiving_bank_account_name?: string | null;
  receiving_bank_account_number?: string | null;
  receiving_bank_qr_media_id?: number | null;
  // Withdrawal-specific
  withdraw_amount?: string;
  provider?: string;
  game_username?: string;
  bank_name?: string;
  bank_account?: string;
  bank_holder_name?: string;
  receipt_media_id?: number | null;
  active_turnover_required?: string | null;
  active_turnover_completed?: string | null;
}

const STATUS_CLASS: Record<string, string> = {
  PENDING:          'bg-yellow-100 text-yellow-800 border-yellow-200',
  PROCESSING:       'bg-blue-100 text-blue-800 border-blue-200',
  AWAITING_RECEIPT: 'bg-amber-100 text-amber-800 border-amber-200',
  APPROVED:         'bg-green-100 text-green-800 border-green-200',
  PAID:             'bg-green-100 text-green-800 border-green-200',
  REJECTED:         'bg-red-100 text-red-800 border-red-200',
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)} day ago`;
}

export default function HandlePage() {
  const params = useParams<{ type: string; id: string }>();
  const { type, id } = params;
  const router = useRouter();

  const [detail,    setDetail]    = useState<HandleDetail | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [meId,      setMeId]      = useState<number | null>(null);
  const [acting,    setActing]    = useState(false);
  const [rejectOpen,setRejectOpen]= useState(false);
  const [error,     setError]     = useState('');
  const [uploading, setUploading] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  const fetchDetail = useCallback(() => {
    setLoading(true);
    fetch(`/api/transactions/${type}/${id}`)
      .then(r => r.json())
      .then((d: HandleDetail) => { setDetail(d); setLoading(false); })
      .catch(() => { setError('Failed to load'); setLoading(false); });
  }, [type, id]);

  useEffect(() => {
    fetchDetail();
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then((d: { sub: number } | null) => { if (d) setMeId(d.sub); })
      .catch(() => {});
  }, [fetchDetail]);

  async function handleProcess() {
    setActing(true);
    setError('');
    const url = type === 'deposit' ? `/api/deposits/${id}/process` : `/api/withdrawals/${id}/process`;
    const res = await fetch(url, { method: 'POST' });
    const body = await res.json().catch(() => ({})) as { error?: string };
    if (!res.ok) {
      setError(body.error ?? 'Failed to start processing');
      setActing(false);
      return;
    }
    fetchDetail();
    setActing(false);
  }

  async function handleApprove() {
    setActing(true);
    setError('');
    const url = type === 'deposit' ? `/api/deposits/${id}/approve` : `/api/withdrawals/${id}/approve`;
    const res = await fetch(url, { method: 'POST' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      setError(body.error ?? 'Failed to approve');
      setActing(false);
      return;
    }
    fetchDetail();
    setActing(false);
  }

  async function handleReceiptUpload(file: File) {
    setUploading(true);
    setError('');
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`/api/withdrawals/${id}/receipt`, { method: 'POST', body: form });
    const data = await res.json().catch(() => ({})) as { receipt_media_id?: number; error?: string };
    if (res.ok) {
      // Re-fetch full detail so status (AWAITING_RECEIPT → PAID) and balance are current
      fetchDetail();
    } else {
      setError(data.error ?? 'Upload failed');
    }
    setUploading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400">Loading…</div>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-4">
        <Link href="/transactions" className="text-sm text-blue-600 hover:underline">← Back to Transactions</Link>
        <p className="text-red-600">{error || 'Transaction not found'}</p>
      </div>
    );
  }

  const isDeposit         = detail.type === 'deposit';
  const amount            = isDeposit ? detail.deposit_amount : detail.withdraw_amount;
  const isAwaitingReceipt = detail.status === 'AWAITING_RECEIPT';
  const isFinal           = ['APPROVED', 'PAID', 'REJECTED', 'AWAITING_RECEIPT'].includes(detail.status);
  const isProcessing      = detail.status === 'PROCESSING';
  const isPending         = detail.status === 'PENDING';
  const myLock            = detail.processing_by !== null && meId !== null && Number(detail.processing_by) === Number(meId);
  const otherLock         = detail.processing_by !== null && (meId === null || Number(detail.processing_by) !== Number(meId));

  const showProcess      = isPending && !detail.processing_by;
  const showApproveReject = isProcessing && myLock;

  const turnoverRequired  = parseFloat(detail.active_turnover_required ?? '0');
  const turnoverCompleted = parseFloat(detail.active_turnover_completed ?? '0');
  const turnoverPct = turnoverRequired > 0 ? Math.min(100, (turnoverCompleted / turnoverRequired) * 100) : 0;

  /* Receipt section helpers */
  const showReceiptUpload = !isDeposit && (isAwaitingReceipt || detail.status === 'PAID');

  void router; // suppress unused warning

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Back link */}
      <Link href="/transactions" className="text-sm text-blue-600 hover:underline">
        ← Back to Transactions
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {isDeposit ? 'Deposit' : 'Withdrawal'} #{detail.id}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">{new Date(detail.created_at).toLocaleString()}</p>
        </div>
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border ${STATUS_CLASS[detail.status] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}>
          {detail.status === 'AWAITING_RECEIPT' ? 'AWAITING RECEIPT' : detail.status}
        </span>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Member Info */}
        <div className="rounded-lg border bg-white p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Member</h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Name</span>
              <MemberLink userId={detail.user_id} name={detail.first_name} />
            </div>
            {detail.public_id && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">ID</span>
                <span className="font-mono text-sm text-blue-600">{detail.public_id}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Phone</span>
              <span className="text-sm">{detail.phone}</span>
            </div>
            <div className="flex items-center justify-between border-t pt-2">
              <span className="text-sm font-medium text-gray-500">Balance</span>
              <span className="font-semibold text-gray-900">
                RM {parseFloat(detail.available_balance ?? '0').toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Transaction Info */}
        <div className="rounded-lg border bg-white p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            {isDeposit ? 'Deposit Details' : 'Withdrawal Details'}
          </h2>
          {isDeposit ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Amount</span>
                <span className="font-semibold text-gray-900">RM {parseFloat(amount ?? '0').toFixed(2)}</span>
              </div>
              {parseFloat(detail.bonus_amount ?? '0') > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Bonus</span>
                  <span className="text-sm text-emerald-600">
                    +RM {parseFloat(detail.bonus_amount ?? '0').toFixed(2)}
                    {detail.promo_name ? ` (${detail.promo_name})` : ''}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between border-t pt-2">
                <span className="text-sm font-medium text-gray-500">Total Credit</span>
                <span className="font-semibold text-emerald-600">RM {parseFloat(detail.credit_amount ?? '0').toFixed(2)}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Amount</span>
                <span className="font-semibold text-gray-900">RM {parseFloat(amount ?? '0').toFixed(2)}</span>
              </div>
              {detail.provider && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Provider</span>
                  <span className="text-sm">{detail.provider}</span>
                </div>
              )}
              {detail.game_username && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Game Account</span>
                  <span className="font-mono text-sm">{detail.game_username}</span>
                </div>
              )}
              <div className="border-t pt-2 space-y-1">
                <span className="text-xs text-gray-400 uppercase">Bank Account</span>
                <div className="text-sm font-medium">{detail.bank_name}</div>
                <div className="font-mono text-sm">{detail.bank_account}</div>
                <div className="text-xs text-gray-500">{detail.bank_holder_name}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Deposit Bank — company receiving account from Bank Manager */}
      {isDeposit && (detail.receiving_bank_name || detail.payment_bank) && (
        <div className="rounded-lg border bg-white p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Deposit Bank</h2>
          <div className="space-y-2">
            {[
              { label: 'Bank Name',       value: detail.receiving_bank_name   ?? detail.payment_bank ?? '—' },
              { label: 'Account Name',    value: detail.receiving_bank_account_name   ?? '—' },
              { label: 'Account Number',  value: detail.receiving_bank_account_number ?? '—' },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-sm text-gray-500">{row.label}</span>
                <span className="font-mono text-sm font-medium text-gray-900">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deposit QR code */}
      {isDeposit && detail.receiving_bank_qr_media_id && (
        <div className="rounded-lg border bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Deposit QR Code</h2>
          <img
            src={`/api/public/media/${detail.receiving_bank_qr_media_id}`}
            alt="QR"
            className="max-h-40 rounded border"
          />
        </div>
      )}

      {/* Payment Receipt (withdrawal only) */}
      {showReceiptUpload && (
        <div className={`rounded-lg border p-4 ${isAwaitingReceipt && !detail.receipt_media_id ? 'border-amber-300 bg-amber-50' : 'bg-white'}`}>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Payment Receipt</h2>

          {/* Hidden file input — shared for upload and replace */}
          <input
            ref={receiptInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) { e.target.value = ''; void handleReceiptUpload(f); }
            }}
          />

          {detail.receipt_media_id ? (
            /* Receipt uploaded — show view link + replace option */
            <div className="flex items-center gap-3 flex-wrap">
              <a
                href={`/api/public/media/${detail.receipt_media_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-sm font-medium"
              >
                View Receipt ↗
              </a>
              <Button
                size="sm"
                variant="outline"
                disabled={uploading}
                onClick={() => receiptInputRef.current?.click()}
              >
                {uploading ? 'Uploading…' : 'Replace Receipt'}
              </Button>
            </div>
          ) : isAwaitingReceipt ? (
            /* Required — must upload to complete payment */
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium text-amber-700">
                Upload receipt to complete payment
              </span>
              <Button
                size="sm"
                disabled={uploading}
                className="bg-amber-500 hover:bg-amber-600 text-white"
                onClick={() => receiptInputRef.current?.click()}
              >
                {uploading ? 'Uploading…' : 'Upload Receipt'}
              </Button>
            </div>
          ) : (
            /* PAID but no receipt — optional replacement */
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400">No receipt uploaded</span>
              <Button
                size="sm"
                variant="outline"
                disabled={uploading}
                onClick={() => receiptInputRef.current?.click()}
              >
                {uploading ? 'Uploading…' : 'Upload Receipt'}
              </Button>
            </div>
          )}
        </div>
      )}

      {!isDeposit && !showReceiptUpload && (
        <div className="rounded-lg border bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Payment Receipt</h2>
          <span className="text-sm text-gray-400">Receipt will be available after approval</span>
        </div>
      )}

      {/* Active turnover (withdrawal only) */}
      {!isDeposit && turnoverRequired > 0 && (
        <div className="rounded-lg border bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Active Turnover Requirement</h2>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Required: RM {turnoverRequired.toFixed(2)}</span>
              <span className="text-gray-500">Completed: RM {turnoverCompleted.toFixed(2)}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{ width: `${turnoverPct}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-400">
              <span>{turnoverPct.toFixed(0)}% completed</span>
              <span>Remaining: RM {Math.max(0, turnoverRequired - turnoverCompleted).toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Reject reason */}
      {detail.reject_reason && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-red-400 mb-1">Rejection Reason</h2>
          <p className="text-sm text-red-700">{detail.reject_reason}</p>
        </div>
      )}

      {/* Processing state banner */}
      {otherLock && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-800">
              Being handled by {detail.processing_by_name}
            </p>
            {detail.processing_at && (
              <p className="text-xs text-blue-600 mt-0.5">
                Processing since {timeAgo(detail.processing_at)}
              </p>
            )}
          </div>
          <span className="text-blue-400 text-2xl">🔒</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Action buttons — hidden once AWAITING_RECEIPT/PAID/APPROVED/REJECTED */}
      {!isFinal && (
        <div className="flex items-center gap-3">
          {showProcess && (
            <Button
              size="lg"
              onClick={handleProcess}
              disabled={acting}
              className="px-10"
            >
              {acting ? 'Processing…' : 'Start Processing'}
            </Button>
          )}

          {showApproveReject && (
            <>
              <Button
                size="lg"
                onClick={handleApprove}
                disabled={acting}
                className="px-10 bg-green-600 hover:bg-green-700 text-white"
              >
                {acting ? 'Approving…' : '✓ Approve'}
              </Button>
              <Button
                size="lg"
                variant="destructive"
                onClick={() => setRejectOpen(true)}
                disabled={acting}
                className="px-10"
              >
                ✕ Reject
              </Button>
            </>
          )}

          {otherLock && (
            <p className="text-sm text-gray-400 italic">
              Actions disabled — another CS is handling this transaction
            </p>
          )}
        </div>
      )}

      {/* Reject Modal */}
      {rejectOpen && (
        <RejectModal
          type={isDeposit ? 'deposit' : 'withdrawal'}
          id={detail.id}
          onClose={() => setRejectOpen(false)}
          onSuccess={() => { setRejectOpen(false); fetchDetail(); }}
        />
      )}
    </div>
  );
}
