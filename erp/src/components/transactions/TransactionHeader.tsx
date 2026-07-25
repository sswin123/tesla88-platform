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
    <div className="rounded-lg border bg-white p-4 space-y-2">
      <Link href="/transactions" className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1">
        ← Back to Transactions
      </Link>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {type === 'deposit' ? 'Deposit' : 'Withdrawal'} #{id}
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {new Date(createdAt).toLocaleString()}
          </p>
        </div>
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${STATUS_CLASS[status] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}
        >
          {status === 'AWAITING_RECEIPT' ? 'AWAITING RECEIPT' : status}
        </span>
      </div>
    </div>
  );
}
