'use client';

import { useState } from 'react';
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
  const [imgFailed, setImgFailed] = useState(false);

  const isProcessing      = status === 'PROCESSING';
  const isAwaitingReceipt = status === 'AWAITING_RECEIPT';
  const isPaid            = status === 'PAID';

  // Visible for PROCESSING (upload ahead of Approve), AWAITING_RECEIPT, and PAID (read-only view).
  if (!isProcessing && !isAwaitingReceipt && !isPaid) return null;

  // Upload is allowed only before Done (not after PAID).
  const canUpload = isProcessing || isAwaitingReceipt;

  const receiptUrl = receiptMediaId ? `/api/public/media/${receiptMediaId}` : null;

  // Border colour: amber when action is expected, blue as a soft reminder during PROCESSING.
  const borderClass = isAwaitingReceipt && !receiptMediaId
    ? 'border-amber-300 bg-amber-50'
    : isProcessing && !receiptMediaId
      ? 'border-blue-200 bg-blue-50/40'
      : 'bg-card';

  return (
    <div className={`rounded-lg border p-4 ${borderClass}`}>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        Payment Receipt
        {isPaid && <span className="ml-2 text-muted-foreground/50 font-normal normal-case tracking-normal">(read-only)</span>}
      </h2>

      {/* Hidden file input — only rendered when uploads are allowed */}
      {canUpload && (
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
      )}

      {receiptUrl ? (
        <div className="space-y-2">
          {/* Preview: image thumbnail or PDF indicator */}
          {!imgFailed ? (
            <a href={receiptUrl} target="_blank" rel="noopener noreferrer" title="View full size">
              <img
                src={receiptUrl}
                alt="Payment receipt"
                className="max-h-36 max-w-full rounded border object-contain cursor-zoom-in"
                onError={() => setImgFailed(true)}
              />
            </a>
          ) : (
            <a
              href={receiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded border border-border bg-muted w-fit hover:bg-muted/80 transition-colors"
            >
              <span className="text-2xl">📄</span>
              <span className="text-sm text-foreground font-medium">PDF Document</span>
              <span className="text-xs text-muted-foreground">↗ Open</span>
            </a>
          )}

          {/* Action links */}
          <div className="flex flex-wrap items-center gap-3">
            <a href={receiptUrl} target="_blank" rel="noopener noreferrer"
              className="text-blue-600 hover:underline text-sm font-medium">
              View Full Size ↗
            </a>
            <a href={receiptUrl} download={`receipt-wd-${transactionId}`}
              className="text-sm font-medium text-muted-foreground hover:text-foreground underline">
              Download
            </a>
            {canUpload && (
              <>
                <Button size="sm" variant="outline" disabled={uploading} onClick={onTriggerUpload}>
                  {uploading ? 'Uploading…' : 'Replace Receipt'}
                </Button>
                {!uploading && <span className="text-xs text-muted-foreground">or paste (Ctrl+V)</span>}
              </>
            )}
          </div>
        </div>
      ) : isProcessing ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-blue-700">
            Upload payment receipt after transferring funds
          </span>
          <Button size="sm" variant="outline" disabled={uploading} onClick={onTriggerUpload}>
            {uploading ? 'Uploading…' : 'Upload Receipt'}
          </Button>
          {!uploading && <span className="text-xs text-muted-foreground">or paste (Ctrl+V)</span>}
        </div>
      ) : isAwaitingReceipt ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-amber-700">
            Upload payment receipt before marking Done
          </span>
          <Button size="sm" variant="outline" disabled={uploading} onClick={onTriggerUpload}>
            {uploading ? 'Uploading…' : 'Upload Receipt'}
          </Button>
          {!uploading && <span className="text-xs text-muted-foreground">or paste (Ctrl+V)</span>}
        </div>
      ) : (
        /* isPaid, no receipt — read-only empty state */
        <p className="text-sm text-muted-foreground">No payment receipt was uploaded.</p>
      )}
    </div>
  );
}
