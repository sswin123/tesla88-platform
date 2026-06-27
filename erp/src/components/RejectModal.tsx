'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

const DEPOSIT_REASONS = [
  'Not Our Bank',
  'Amount Mismatch',
  'Duplicate Receipt',
  'Invalid Receipt',
  'Expired Receipt',
  'Already Credited',
  'Promotion Not Eligible',
  'Suspected Fraud',
  'Other',
];

const WITHDRAWAL_REASONS = [
  'Wrong Bank Account',
  'Account Holder Mismatch',
  'Insufficient Turnover',
  'Daily Limit Exceeded',
  'Duplicate Withdrawal',
  'Promotion Restriction',
  'Suspected Fraud',
  'Other',
];

interface RejectModalProps {
  type: 'deposit' | 'withdrawal';
  id: number;
  onClose: () => void;
  onSuccess: () => void;
}

export default function RejectModal({ type, id, onClose, onSuccess }: RejectModalProps) {
  const reasons = type === 'deposit' ? DEPOSIT_REASONS : WITHDRAWAL_REASONS;
  const endpoint = type === 'deposit' ? `/api/deposits/${id}/reject` : `/api/withdrawals/${id}/reject`;
  const title = type === 'deposit' ? 'Reject Deposit' : 'Reject Withdrawal';

  const [selected, setSelected]   = useState('');
  const [custom,   setCustom]     = useState('');
  const [loading,  setLoading]    = useState(false);
  const [error,    setError]      = useState('');

  const effectiveReason = selected === 'Other' ? custom.trim() : selected;

  async function submit() {
    if (!selected) { setError('Please select a reason.'); return; }
    if (selected === 'Other' && !custom.trim()) { setError('Please enter a reason.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: effectiveReason }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? 'Failed to reject. Please try again.');
        return;
      }
      onSuccess();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-base font-semibold">{title} #{id}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 space-y-2">
          <p className="text-sm text-gray-600 mb-3">Select a reason for rejection:</p>

          {reasons.map((r) => (
            <label key={r} className="flex items-center gap-3 cursor-pointer group">
              <input
                type="radio"
                name="reject-reason"
                value={r}
                checked={selected === r}
                onChange={() => { setSelected(r); setError(''); }}
                className="accent-red-600"
              />
              <span className="text-sm group-hover:text-gray-900">{r}</span>
            </label>
          ))}

          {selected === 'Other' && (
            <textarea
              autoFocus
              value={custom}
              onChange={(e) => { setCustom(e.target.value); setError(''); }}
              placeholder="Enter reason…"
              rows={3}
              className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
            />
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t bg-gray-50 rounded-b-lg">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={submit} disabled={loading || !selected}>
            {loading ? 'Rejecting…' : 'Confirm Reject'}
          </Button>
        </div>
      </div>
    </div>
  );
}
