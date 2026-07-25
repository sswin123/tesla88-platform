'use client';

import { HandleDetail, STATUS_CLASS } from './types';

interface TransactionSummaryProps {
  detail: HandleDetail;
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-400">{label}</span>
      <span className="font-medium text-gray-800">{children}</span>
    </div>
  );
}

export default function TransactionSummary({ detail }: TransactionSummaryProps) {
  const isDeposit = detail.type === 'deposit';
  const amount = isDeposit ? detail.deposit_amount : detail.withdraw_amount;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        Transaction Summary
      </p>
      <div className="space-y-1.5">
        <SummaryRow label="Amount">
          RM {parseFloat(amount ?? '0').toFixed(2)}
        </SummaryRow>

        {isDeposit && parseFloat(detail.bonus_amount ?? '0') > 0 && (
          <SummaryRow label="Bonus">
            <span className="text-emerald-600">
              +RM {parseFloat(detail.bonus_amount ?? '0').toFixed(2)}
            </span>
          </SummaryRow>
        )}

        {isDeposit && (
          <SummaryRow label="Credit">
            <span className="text-emerald-600">
              RM {parseFloat(detail.credit_amount ?? '0').toFixed(2)}
            </span>
          </SummaryRow>
        )}

        <SummaryRow label="Status">
          <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-semibold ${STATUS_CLASS[detail.status] ?? 'bg-gray-100 text-gray-700'}`}>
            {detail.status === 'AWAITING_RECEIPT' ? 'AWAITING' : detail.status}
          </span>
        </SummaryRow>

        {isDeposit
          ? (detail.receiving_bank_name ?? detail.payment_bank) && (
              <SummaryRow label="Bank">
                {detail.receiving_bank_name ?? detail.payment_bank ?? '—'}
              </SummaryRow>
            )
          : detail.provider && (
              <SummaryRow label="Provider">{detail.provider}</SummaryRow>
            )
        }
      </div>
    </div>
  );
}
