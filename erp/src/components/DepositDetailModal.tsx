'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { DepositDetail } from '@/lib/types';

interface Props {
  depositId: number;
  onClose: () => void;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-foreground text-right break-all">{value}</span>
    </div>
  );
}

export default function DepositDetailModal({ depositId, onClose }: Props) {
  const [detail, setDetail] = useState<DepositDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setDetail(null);
    setImgError(false);
    fetch(`/api/deposits/${depositId}/detail`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: DepositDetail | null) => setDetail(d))
      .finally(() => setLoading(false));
  }, [depositId]);

  const bonusAmt = detail ? parseFloat(detail.bonus_amount) : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card rounded-lg w-full max-w-md max-h-[90vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <h2 className="text-base font-semibold">Deposit Detail</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-lg leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="px-5 py-10 text-center text-muted-foreground text-sm">Loading…</div>
          ) : !detail ? (
            <div className="px-5 py-10 text-center text-muted-foreground text-sm">Failed to load deposit details.</div>
          ) : (
            <div className="px-5 py-3">
              <Row
                label="Member ID"
                value={detail.public_id ?? <span className="text-muted-foreground">—</span>}
              />
              <Row label="Customer Name" value={detail.first_name} />
              <Row label="Phone" value={detail.phone} />
              <Row
                label="Promotion"
                value={detail.promo_name ?? <span className="text-muted-foreground">No Bonus</span>}
              />
              <Row
                label="Bonus Amount"
                value={bonusAmt > 0
                  ? `RM ${bonusAmt.toFixed(2)}`
                  : <span className="text-muted-foreground">—</span>
                }
              />
              <Row
                label="Deposit Amount"
                value={`RM ${parseFloat(detail.deposit_amount).toFixed(2)}`}
              />
              <Row
                label="Credit Amount"
                value={`RM ${parseFloat(detail.credit_amount).toFixed(2)}`}
              />
              {detail.game_username && (
                <Row label="Game Account" value={detail.game_username} />
              )}
              <Row
                label="Customer Bank"
                value={detail.payment_bank || <span className="text-muted-foreground">—</span>}
              />

              {/* Receiving Bank section */}
              <div className="pt-2 pb-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Receiving Bank</p>
                {detail.receiving_bank_id ? (
                  <>
                    <Row label="Bank Name"    value={detail.receiving_bank_name ?? '—'} />
                    <Row label="Account Name" value={detail.receiving_bank_account_name ?? '—'} />
                    <Row label="Account No."  value={detail.receiving_bank_account_number ?? '—'} />
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground py-1">No receiving bank recorded</div>
                )}
              </div>

              <Row
                label="Created Time"
                value={new Date(detail.created_at).toLocaleString()}
              />

              {/* Receipt Image */}
              <div className="pt-4 pb-2">
                <p className="text-sm font-medium text-muted-foreground mb-3">Receipt Image</p>
                {imgError ? (
                  <div className="rounded border border-dashed border-border bg-muted p-6 text-center text-sm text-muted-foreground">
                    No receipt image available
                  </div>
                ) : (
                  <img
                    src={`/api/deposits/${depositId}/receipt`}
                    alt="Receipt"
                    className="w-full rounded border border-border object-contain max-h-96"
                    onError={() => setImgError(true)}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t shrink-0">
          <Button variant="outline" className="w-full" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
