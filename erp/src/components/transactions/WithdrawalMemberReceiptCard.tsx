'use client';

import { useState } from 'react';

interface WithdrawalMemberReceiptCardProps {
  withdrawalId: number;
  memberReceiptMediaId?: number | null;
}

export default function WithdrawalMemberReceiptCard({
  withdrawalId,
  memberReceiptMediaId,
}: WithdrawalMemberReceiptCardProps) {
  const [imgState, setImgState] = useState<'loading' | 'loaded' | 'error'>('loading');

  if (!memberReceiptMediaId) return null;

  const receiptUrl = `/api/public/media/${memberReceiptMediaId}`;

  return (
    <div className="rounded-lg border bg-white p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
        Member Receipt (Submitted at Request)
      </h2>

      {imgState === 'error' ? (
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
              download={`withdrawal-member-receipt-${withdrawalId}`}
              className="text-sm font-medium text-gray-600 hover:text-gray-900 underline"
            >
              Download
            </a>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <a
            href={receiptUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
            title="View full size"
          >
            {imgState === 'loading' && (
              <div className="h-32 rounded border bg-gray-100 animate-pulse" />
            )}
            <img
              src={receiptUrl}
              alt="Member submitted receipt"
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
                download={`withdrawal-member-receipt-${withdrawalId}`}
                className="text-sm font-medium text-gray-600 hover:text-gray-900 underline"
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
