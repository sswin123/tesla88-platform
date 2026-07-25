'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import RejectModal from '@/components/RejectModal';
import TransactionHeader from '@/components/transactions/TransactionHeader';
import StatusCard from '@/components/transactions/StatusCard';
import MemberCard from '@/components/transactions/MemberCard';
import { DepositPaymentCard, WithdrawalPaymentCard } from '@/components/transactions/PaymentCard';
import TurnoverCard from '@/components/transactions/TurnoverCard';
import ReceiptCard from '@/components/transactions/ReceiptCard';
import ActionPanel from '@/components/transactions/ActionPanel';
import WorkspacePanel from '@/components/transactions/WorkspacePanel';
import type { HandleDetail } from '@/components/transactions/types';

export default function HandlePage() {
  const params = useParams<{ type: string; id: string }>();
  const { type, id } = params;

  const [detail,     setDetail]     = useState<HandleDetail | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [meId,       setMeId]       = useState<number | null>(null);
  const [acting,     setActing]     = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [error,      setError]      = useState('');
  const [uploading,  setUploading]  = useState(false);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  const fetchDetail = useCallback(() => {
    setLoading(true);
    fetch(`/api/transactions/${type}/${id}`)
      .then(r => r.json())
      .then((d: HandleDetail) => { setDetail(d); setLoading(false); })
      .catch(() => { setLoading(false); });
  }, [type, id]);

  useEffect(() => {
    fetchDetail();
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then((d: { sub: number } | null) => { if (d) setMeId(d.sub); })
      .catch(() => {});
  }, [fetchDetail]);

  // Ctrl+V paste support for receipt upload
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!detail) return;
      const isWithdrawal = detail.type === 'withdrawal';
      const isAwaitingOrPaid = detail.status === 'AWAITING_RECEIPT' || detail.status === 'PAID';
      if (!isWithdrawal || !isAwaitingOrPaid) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) { void handleReceiptUpload(file); break; }
        }
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  async function handleProcess() {
    setActing(true);
    setError('');
    const url = type === 'deposit' ? `/api/deposits/${id}/process` : `/api/withdrawals/${id}/process`;
    const res = await fetch(url, { method: 'POST' });
    const body = await res.json().catch(() => ({})) as { error?: string };
    if (!res.ok) { setError(body.error ?? 'Failed to start processing'); setActing(false); return; }
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

  async function handleDone() {
    setActing(true);
    setError('');
    const res = await fetch(`/api/withdrawals/${id}/done`, { method: 'POST' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      setError(body.error ?? 'Failed to complete payment');
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
    const data = await res.json().catch(() => ({})) as { error?: string };
    if (res.ok) { fetchDetail(); } else { setError(data.error ?? 'Upload failed'); }
    setUploading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400">
        Loading…
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-4 text-red-600">Transaction not found</div>
    );
  }

  const isDeposit  = detail.type === 'deposit';
  const turnoverRequired  = parseFloat(detail.active_turnover_required ?? '0');
  const turnoverCompleted = parseFloat(detail.active_turnover_completed ?? '0');

  return (
    <div className="flex gap-0 xl:gap-6 flex-col xl:flex-row xl:items-start">

      {/* ── LEFT PANEL (Master) ─────────────────────────────────────────────── */}
      <div className="
        w-full xl:w-[38%] xl:shrink-0
        xl:sticky xl:top-0
        xl:max-h-[calc(100vh-48px)]
        xl:overflow-y-auto
        xl:flex xl:flex-col
        space-y-3 xl:space-y-0 xl:gap-3
        mb-4 xl:mb-0
      ">
        <TransactionHeader
          id={detail.id}
          type={detail.type}
          status={detail.status}
          createdAt={detail.created_at}
        />

        <StatusCard
          status={detail.status}
          processingByName={detail.processing_by_name}
          processingAt={detail.processing_at}
          approvedAt={detail.approved_at}
          rejectedAt={detail.rejected_at}
          rejectReason={detail.reject_reason}
        />

        <MemberCard
          userId={detail.user_id}
          firstName={detail.first_name}
          phone={detail.phone}
          publicId={detail.public_id}
          availableBalance={detail.available_balance}
        />

        {isDeposit ? (
          <DepositPaymentCard
            depositAmount={detail.deposit_amount ?? '0'}
            bonusAmount={detail.bonus_amount ?? '0'}
            creditAmount={detail.credit_amount ?? '0'}
            promoName={detail.promo_name}
            receivingBankName={detail.receiving_bank_name}
            receivingBankAccountName={detail.receiving_bank_account_name}
            receivingBankAccountNumber={detail.receiving_bank_account_number}
            receivingBankQrMediaId={detail.receiving_bank_qr_media_id}
            paymentBank={detail.payment_bank}
          />
        ) : (
          <WithdrawalPaymentCard
            withdrawAmount={detail.withdraw_amount ?? '0'}
            provider={detail.provider}
            gameUsername={detail.game_username}
            bankName={detail.bank_name}
            bankAccount={detail.bank_account}
            bankHolderName={detail.bank_holder_name}
          />
        )}

        {!isDeposit && turnoverRequired > 0 && (
          <TurnoverCard required={turnoverRequired} completed={turnoverCompleted} />
        )}

        {!isDeposit && (
          <ReceiptCard
            transactionId={detail.id}
            status={detail.status}
            receiptMediaId={detail.receipt_media_id}
            uploading={uploading}
            onTriggerUpload={() => receiptInputRef.current?.click()}
            onUpload={handleReceiptUpload}
            inputRef={receiptInputRef}
          />
        )}

        {/* Spacer — pushes ActionPanel to bottom on xl */}
        <div className="hidden xl:block xl:flex-1" />

        <ActionPanel
          detail={detail}
          meId={meId}
          acting={acting}
          uploading={uploading}
          error={error}
          onProcess={handleProcess}
          onApprove={handleApprove}
          onDone={handleDone}
          onReject={() => setRejectOpen(true)}
        />
      </div>

      {/* ── RIGHT PANEL (Workspace) ─────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        <WorkspacePanel />
      </div>

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
