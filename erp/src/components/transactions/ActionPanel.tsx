'use client';

import { Button } from '@/components/ui/button';
import { HandleDetail, timeAgo } from './types';
import TransactionSummary from './TransactionSummary';

interface ActionPanelProps {
  detail: HandleDetail;
  meId: number | null;
  acting: boolean;
  uploading: boolean;
  error: string;
  onProcess: () => void;
  onApprove: () => void;
  onDone: () => void;
  onReject: () => void;
}

export default function ActionPanel({
  detail,
  meId,
  acting,
  uploading,
  error,
  onProcess,
  onApprove,
  onDone,
  onReject,
}: ActionPanelProps) {
  const isDeposit         = detail.type === 'deposit';
  const isAwaitingReceipt = detail.status === 'AWAITING_RECEIPT';
  const isPaid            = detail.status === 'PAID';
  const isFinal           = ['APPROVED', 'PAID', 'REJECTED', 'AWAITING_RECEIPT'].includes(detail.status);
  const isProcessing      = detail.status === 'PROCESSING';
  const isPending         = detail.status === 'PENDING';
  const myLock            = detail.processing_by !== null && meId !== null && Number(detail.processing_by) === Number(meId);
  const otherLock         = detail.processing_by !== null && (meId === null || Number(detail.processing_by) !== Number(meId));

  const showProcess       = isPending && !detail.processing_by;
  const showApproveReject = isProcessing && myLock;

  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-4">
      {/* Transaction Summary — always visible */}
      <TransactionSummary detail={detail} />

      <div className="border-t" />

      {/* Processing lock banner */}
      {otherLock && (
        <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2">
          <p className="text-xs font-semibold text-blue-800">
            Being handled by {detail.processing_by_name}
          </p>
          {detail.processing_at && (
            <p className="text-xs text-blue-600 mt-0.5">
              Since {timeAgo(detail.processing_at)}
            </p>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* AWAITING_RECEIPT actions */}
      {isAwaitingReceipt && !isDeposit && (
        <div className="flex flex-col gap-2">
          <Button
            size="sm"
            onClick={onDone}
            disabled={acting || uploading}
            className="w-full bg-green-600 hover:bg-green-700 text-white"
          >
            {acting ? 'Processing…' : '✓ Done — Mark as PAID'}
          </Button>
        </div>
      )}

      {/* PENDING / PROCESSING actions */}
      {!isFinal && !isAwaitingReceipt && (
        <div className="flex flex-col gap-2">
          {showProcess && (
            <Button
              size="sm"
              onClick={onProcess}
              disabled={acting}
              className="w-full"
            >
              {acting ? 'Processing…' : 'Start Processing'}
            </Button>
          )}

          {showApproveReject && (
            <>
              <Button
                size="sm"
                onClick={onApprove}
                disabled={acting}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                {acting ? 'Approving…' : '✓ Approve'}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={onReject}
                disabled={acting}
                className="w-full"
              >
                ✕ Reject
              </Button>
            </>
          )}

          {otherLock && (
            <p className="text-xs text-muted-foreground italic text-center">
              Actions disabled — another CS is handling this
            </p>
          )}
        </div>
      )}

      {/* Final state */}
      {(isFinal && !isAwaitingReceipt) && (
        <p className="text-xs text-muted-foreground text-center">
          {isPaid ? 'Transaction paid.' : 'Transaction finalized.'}
        </p>
      )}

      {/* Processing info */}
      {detail.processing_by_name && myLock && (
        <p className="text-xs text-muted-foreground text-center">
          Processed by: {detail.processing_by_name}
        </p>
      )}
    </div>
  );
}
