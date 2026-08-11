'use client';

import Link from 'next/link';
import { STATUS_CLASS } from './types';

interface TransactionHeaderProps {
  id: number;
  type: 'deposit' | 'withdrawal';
  status: string;
  createdAt: string;
}

export default function TransactionHeader({ id, type, status, createdAt }: TransactionHeaderProps) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <Link href="/transactions" className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1">
        ← Back to Transactions
      </Link>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            {type === 'deposit' ? 'Deposit' : 'Withdrawal'} #{id}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(createdAt).toLocaleString()}
          </p>
        </div>
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${STATUS_CLASS[status] ?? 'bg-muted text-foreground border-border'}`}
        >
          {status === 'AWAITING_RECEIPT' ? 'AWAITING RECEIPT' : status}
        </span>
      </div>
    </div>
  );
}
