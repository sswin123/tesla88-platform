'use client';

import { useState } from 'react';

interface DepositReceiptCardProps {
  depositId: number;
  receiptMediaId?: number | null;
  receiptFileId?: string | null;
}

export default function DepositReceiptCard({
  depositId,
  receiptMediaId,
  receiptFileId,
}: DepositReceiptCardProps) {
  const [imgState, setImgState] = useState<'loading' | 'loaded' | 'error'>('loading');

  const hasReceipt = !!(receiptMediaId || receiptFileId);
  const receiptUrl = `/api/deposits/${depositId}/receipt`;

  return (
    <div className="rounded-lg border bg-card p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        Deposit Receipt
      </h2>

      {!hasReceipt ? (
        <p className="text-sm text-muted-foreground italic">
          No receipt uploaded by customer
        </p>
      ) : imgState === 'error' ? (
        <div className="space-y-2">
          <p className="text-sm text-red-500">Unable to load receipt preview</p>
          <div className="flex flex-wrap gap-3">
            <a
              href={receiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              View Receipt ↗
            </a>
            <a
              href={receiptUrl}
              download={`deposit-receipt-${depositId}`}
              className="text-sm font-medium text-muted-foreground hover:text-foreground underline"
            >
              Download
            </a>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Thumbnail — hidden until loaded; clicking opens full size */}
          <a
            href={receiptUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
            title="View full size"
          >
            {imgState === 'loading' && (
              <div className="h-32 rounded border bg-muted animate-pulse" />
            )}
            {/* img is always mounted so onLoad/onError fire correctly */}
            <img
              src={receiptUrl}
              alt="Deposit receipt"
              onLoad={() => setImgState('loaded')}
              onError={() => setImgState('error')}
              className={`max-w-full max-h-48 rounded border object-contain cursor-zoom-in ${
                imgState === 'loaded' ? 'block' : 'hidden'
              }`}
            />
          </a>

          {imgState === 'loaded' && (
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-blue-600 hover:underline"
              >
                View Full Size ↗
              </a>
              <a
                href={receiptUrl}
                download={`deposit-receipt-${depositId}`}
                className="text-sm font-medium text-muted-foreground hover:text-foreground underline"
              >
                Download
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
