'use client';

import { Button } from '@/components/ui/button';

interface ReceiptCardProps {
  transactionId: number;
  status: string;
  receiptMediaId: number | null | undefined;
  uploading: boolean;
  onTriggerUpload: () => void;
  onUpload: (file: File) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export default function ReceiptCard({
  transactionId,
  status,
  receiptMediaId,
  uploading,
  onTriggerUpload,
  onUpload,
  inputRef,
}: ReceiptCardProps) {
  const isAwaitingReceipt = status === 'AWAITING_RECEIPT';
  const isPaid = status === 'PAID';

  if (!isAwaitingReceipt && !isPaid) return null;

  const receiptUrl = receiptMediaId ? `/api/public/media/${receiptMediaId}` : null;

  return (
    <div className={`rounded-lg border p-4 ${isAwaitingReceipt && !receiptMediaId ? 'border-amber-300 bg-amber-50' : 'bg-white'}`}>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
        Payment Receipt
      </h2>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) { e.target.value = ''; onUpload(f); }
        }}
      />

      {receiptUrl ? (
        <div className="flex flex-wrap items-center gap-3">
          <a href={receiptUrl} target="_blank" rel="noopener noreferrer"
            className="text-blue-600 hover:underline text-sm font-medium">
            View Receipt ↗
          </a>
          <a href={receiptUrl} download={`receipt-wd-${transactionId}`}
            className="text-sm font-medium text-gray-600 hover:text-gray-900 underline">
            Download
          </a>
          <Button size="sm" variant="outline" disabled={uploading} onClick={onTriggerUpload}>
            {uploading ? 'Uploading…' : 'Replace Receipt'}
          </Button>
          {!uploading && <span className="text-xs text-gray-400">or paste (Ctrl+V)</span>}
        </div>
      ) : isAwaitingReceipt ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-amber-700">
            Receipt is optional — upload or press Done to complete payment
          </span>
          <Button size="sm" variant="outline" disabled={uploading} onClick={onTriggerUpload}>
            {uploading ? 'Uploading…' : 'Upload Receipt'}
          </Button>
          {!uploading && <span className="text-xs text-gray-400">or paste (Ctrl+V)</span>}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">No receipt uploaded</span>
          <Button size="sm" variant="outline" disabled={uploading} onClick={onTriggerUpload}>
            {uploading ? 'Uploading…' : 'Upload Receipt'}
          </Button>
        </div>
      )}
    </div>
  );
}
