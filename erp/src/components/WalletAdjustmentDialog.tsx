'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

const TYPE_OPTIONS = [
  { value: 'MANUAL_DEPOSIT',    label: 'Manual Deposit',      dir: 'C' as const },
  { value: 'MANUAL_WITHDRAWAL', label: 'Manual Withdrawal',   dir: 'D' as const },
  { value: 'PAYMENT_GATEWAY',   label: 'Payment Gateway',     dir: 'C' as const },
  { value: 'PROMOTION_BONUS',   label: 'Promotion Bonus',     dir: 'C' as const },
  { value: 'CASHBACK',          label: 'Cashback',            dir: 'C' as const },
  { value: 'REBATE',            label: 'Rebate',              dir: 'C' as const },
  { value: 'REFERRAL_BONUS',    label: 'Referral Bonus',      dir: 'C' as const },
  { value: 'VIP_BONUS',         label: 'VIP Bonus',           dir: 'C' as const },
  { value: 'LOSS_CREDIT',       label: 'Loss Credit',         dir: 'C' as const },
  { value: 'COMPENSATION',      label: 'Compensation',        dir: 'C' as const },
  { value: 'CORRECTION',        label: 'Correction',          dir: null },
  { value: 'OTHERS',            label: 'Others',              dir: null },
] as const;

interface Gateway { name: string; display_name: string }

interface Props {
  memberId:       number;
  memberName:     string;
  currentBalance: string;
  onClose:        () => void;
  onSuccess:      () => void;
}

export default function WalletAdjustmentDialog({ memberId, memberName, currentBalance, onClose, onSuccess }: Props) {
  const [type,            setType]            = useState('');
  const [direction,       setDirection]       = useState<'C' | 'D'>('C');
  const [amount,          setAmount]          = useState('');
  const [gateway,         setGateway]         = useState('');
  const [refNumber,       setRefNumber]       = useState('');
  const [remark,          setRemark]          = useState('');
  const [attachMediaId,   setAttachMediaId]   = useState<number | null>(null);
  const [attachName,      setAttachName]      = useState('');
  const [uploading,       setUploading]       = useState(false);
  const [submitting,      setSubmitting]      = useState(false);
  const [error,           setError]           = useState('');
  const [gateways,        setGateways]        = useState<Gateway[]>([]);

  const selectedType = TYPE_OPTIONS.find(t => t.value === type);
  const fixedDir     = selectedType?.dir ?? null;
  const needsDir     = type === 'CORRECTION' || type === 'OTHERS';
  const needsGateway = type === 'PAYMENT_GATEWAY';
  const effectiveDir = fixedDir ?? direction;

  useEffect(() => {
    fetch('/api/payment-gateways')
      .then(r => r.ok ? r.json() as Promise<Gateway[]> : Promise.resolve([]))
      .then(setGateways)
      .catch(() => {});
  }, []);

  // Auto-set direction when type changes
  useEffect(() => {
    if (fixedDir) setDirection(fixedDir);
  }, [fixedDir]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('display_name', `Wallet attachment — Member #${memberId}`);
      const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
      const data = await res.json() as { id?: number; error?: string };
      if (res.ok && data.id) {
        setAttachMediaId(data.id);
        setAttachName(file.name);
      } else {
        setError(data.error ?? 'Upload failed');
      }
    } catch {
      setError('Upload failed — network error');
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!type) { setError('Please select an adjustment type'); return; }
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) { setError('Amount must be a positive number'); return; }
    if (!remark.trim()) { setError('Remark is required'); return; }
    if (needsGateway && !gateway) { setError('Payment gateway is required'); return; }
    if (needsGateway && !refNumber.trim()) { setError('Reference number is required for payment gateway'); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/members/${memberId}/wallet/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          direction:            effectiveDir,
          amount:               numAmount,
          gateway:              needsGateway ? gateway : undefined,
          reference_number:     refNumber.trim() || undefined,
          remark:               remark.trim(),
          attachment_media_id:  attachMediaId,
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        onSuccess();
        onClose();
      } else {
        setError(data.error ?? 'Adjustment failed');
      }
    } catch {
      setError('Network error — please retry');
    } finally {
      setSubmitting(false);
    }
  }

  const numAmount = parseFloat(amount) || 0;
  const balance   = parseFloat(currentBalance);
  const previewBalance = effectiveDir === 'C' ? balance + numAmount : balance - numAmount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4 bg-gray-50">
          <div>
            <h2 className="font-bold text-gray-800">Wallet Adjustment</h2>
            <p className="text-xs text-gray-500 mt-0.5">{memberName} · Current balance: <strong>RM {balance.toFixed(2)}</strong></p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none font-light"
            disabled={submitting}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Adjustment Type <span className="text-red-500">*</span>
            </label>
            <select
              value={type}
              onChange={(e) => { setType(e.target.value); setGateway(''); setRefNumber(''); }}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            >
              <option value="">— Select type —</option>
              {TYPE_OPTIONS.map(t => (
                <option key={t.value} value={t.value}>
                  {t.label}
                  {t.dir === 'C' ? ' (+Credit)' : t.dir === 'D' ? ' (−Debit)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Direction — only for CORRECTION / OTHERS */}
          {needsDir && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Direction <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setDirection('C')}
                  className={`flex-1 py-2 rounded-md border text-sm font-medium transition-colors ${
                    direction === 'C'
                      ? 'bg-green-600 border-green-600 text-white'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  + Credit (Add)
                </button>
                <button
                  type="button"
                  onClick={() => setDirection('D')}
                  className={`flex-1 py-2 rounded-md border text-sm font-medium transition-colors ${
                    direction === 'D'
                      ? 'bg-red-600 border-red-600 text-white'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  − Debit (Deduct)
                </button>
              </div>
            </div>
          )}

          {/* Payment Gateway (only for PAYMENT_GATEWAY type) */}
          {needsGateway && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Gateway <span className="text-red-500">*</span>
              </label>
              {gateways.length > 0 ? (
                <select
                  value={gateway}
                  onChange={(e) => setGateway(e.target.value)}
                  required
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                >
                  <option value="">— Select gateway —</option>
                  {gateways.map(g => (
                    <option key={g.name} value={g.name}>{g.display_name}</option>
                  ))}
                </select>
              ) : (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  No payment gateways are currently enabled. Enable them in System Settings.
                </div>
              )}
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount (RM) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">RM</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0.01"
                step="0.01"
                required
                placeholder="0.00"
                className="w-full rounded-md border border-gray-300 pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          {/* Reference Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reference Number {needsGateway && <span className="text-red-500">*</span>}
              {!needsGateway && <span className="text-gray-400 text-xs"> (optional)</span>}
            </label>
            <input
              type="text"
              value={refNumber}
              onChange={(e) => setRefNumber(e.target.value)}
              required={needsGateway}
              placeholder={needsGateway ? 'Transaction / payment reference' : 'Optional reference'}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* Remark */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Remark <span className="text-red-500">*</span>
            </label>
            <textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              required
              rows={2}
              placeholder="Describe the reason for this adjustment (recorded in audit log)"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />
          </div>

          {/* Attachment */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Attachment <span className="text-gray-400 text-xs">(optional)</span>
            </label>
            {attachMediaId ? (
              <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2">
                <span className="text-green-600 text-sm">✓</span>
                <span className="text-sm text-green-700 flex-1 truncate">{attachName}</span>
                <button
                  type="button"
                  onClick={() => { setAttachMediaId(null); setAttachName(''); }}
                  className="text-gray-400 hover:text-gray-600 text-xs"
                >
                  Remove
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2 rounded-md border border-dashed border-gray-300 px-3 py-2 cursor-pointer hover:bg-gray-50 text-sm text-gray-500">
                {uploading ? 'Uploading…' : '📎 Click to attach file'}
                <input
                  type="file"
                  className="hidden"
                  accept="image/*,application/pdf"
                  onChange={handleUpload}
                  disabled={uploading}
                />
              </label>
            )}
          </div>

          {/* Balance Preview */}
          {type && numAmount > 0 && (
            <div className={`rounded-lg border px-4 py-3 text-sm ${
              effectiveDir === 'C'
                ? 'border-green-200 bg-green-50'
                : 'border-red-200 bg-red-50'
            }`}>
              <div className="flex justify-between">
                <span className="text-gray-600">Current Balance</span>
                <span className="font-mono font-medium">RM {balance.toFixed(2)}</span>
              </div>
              <div className="flex justify-between mt-0.5">
                <span className="text-gray-600">{effectiveDir === 'C' ? '+ Credit' : '− Debit'}</span>
                <span className={`font-mono font-medium ${effectiveDir === 'C' ? 'text-green-700' : 'text-red-700'}`}>
                  {effectiveDir === 'C' ? '+' : '−'} RM {numAmount.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between mt-1 pt-1 border-t border-current/10 font-bold">
                <span>New Balance</span>
                <span className="font-mono">RM {previewBalance.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting} className="flex-1">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || uploading || !type || !amount || !remark.trim()}
              className={`flex-1 ${effectiveDir === 'D' ? 'bg-red-600 hover:bg-red-700 text-white border-red-600' : ''}`}
            >
              {submitting ? 'Processing…' : `Confirm ${effectiveDir === 'C' ? 'Credit' : 'Debit'}`}
            </Button>
          </div>

          <p className="text-xs text-center text-gray-400">
            This adjustment will be permanently recorded in the audit log with operator identity and IP address.
          </p>
        </form>
      </div>
    </div>
  );
}
