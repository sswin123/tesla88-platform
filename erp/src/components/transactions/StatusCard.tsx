'use client';

import { STATUS_CLASS, timeAgo } from './types';

interface StatusCardProps {
  status: string;
  processingByName: string | null;
  processingAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectReason: string | null;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs font-medium text-gray-700">{value}</span>
    </div>
  );
}

export default function StatusCard({
  status,
  processingByName,
  processingAt,
  approvedAt,
  rejectedAt,
  rejectReason,
}: StatusCardProps) {
  return (
    <div className="rounded-lg border bg-white p-4 space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Status</h2>
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${STATUS_CLASS[status] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}
        >
          {status === 'AWAITING_RECEIPT' ? 'AWAITING RECEIPT' : status}
        </span>
      </div>
      <div className="space-y-1.5">
        {processingByName && processingAt && (
          <Row label="Processing by" value={`${processingByName} · ${timeAgo(processingAt)}`} />
        )}
        {approvedAt && (
          <Row label="Approved at" value={new Date(approvedAt).toLocaleString()} />
        )}
        {rejectedAt && (
          <Row label="Rejected at" value={new Date(rejectedAt).toLocaleString()} />
        )}
      </div>
      {rejectReason && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2">
          <p className="text-xs text-red-600 font-medium">Rejection Reason</p>
          <p className="text-xs text-red-700 mt-0.5">{rejectReason}</p>
        </div>
      )}
    </div>
  );
}
