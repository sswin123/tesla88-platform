'use client';
import { useEffect, useState } from 'react';
import { MediaPicker } from '@/components/media/MediaPicker';
import type { MediaRecord } from '@/lib/media/types';
import type { PaymentBank } from '@/lib/types';

interface FormState {
  bank_name: string;
  account_name: string;
  account_number: string;
  qr_media_id: number | null;
  instructions: string;
  display_order: string;
  is_active: boolean;
}

const BLANK: FormState = {
  bank_name: '', account_name: '', account_number: '',
  qr_media_id: null, instructions: '',
  display_order: '0', is_active: true,
};

function bankToForm(b: PaymentBank): FormState {
  return {
    bank_name:      b.bank_name,
    account_name:   b.account_name,
    account_number: b.account_number,
    qr_media_id:    b.qr_media_id,
    instructions:   b.instructions ?? '',
    display_order:  String(b.display_order),
    is_active:      b.is_active,
  };
}

export default function WebsitePaymentBanksPage() {
  const [banks, setBanks]         = useState<PaymentBank[]>([]);
  const [editId, setEditId]       = useState<number | null>(null);
  const [form, setForm]           = useState<FormState>(BLANK);
  const [showForm, setShowForm]   = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState('');
  const [error, setError]         = useState('');

  async function load() {
    const res = await fetch('/api/website/payment-banks');
    if (res.ok) setBanks(await res.json() as PaymentBank[]);
  }

  useEffect(() => { void load(); }, []);

  function startCreate() {
    setEditId(null); setForm(BLANK);
    setShowForm(true); setMsg(''); setError('');
  }

  function startEdit(b: PaymentBank) {
    setEditId(b.id); setForm(bankToForm(b));
    setShowForm(true); setMsg(''); setError('');
  }

  function cancelForm() { setShowForm(false); setEditId(null); }

  function setField(key: keyof FormState, value: string | boolean | number | null) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function handleQRSelect(m: MediaRecord | MediaRecord[]) {
    const picked = Array.isArray(m) ? m[0] : m;
    if (picked) setField('qr_media_id', picked.id);
    setShowPicker(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg(''); setError('');

    const body = {
      bank_name:      form.bank_name.trim(),
      account_name:   form.account_name.trim(),
      account_number: form.account_number.trim(),
      qr_media_id:    form.qr_media_id,
      instructions:   form.instructions.trim() || null,
      display_order:  parseInt(form.display_order) || 0,
      is_active:      form.is_active,
    };

    const url    = editId ? `/api/website/payment-banks/${editId}` : '/api/website/payment-banks';
    const method = editId ? 'PATCH' : 'POST';

    const res = await fetch(url, {
      method,
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
    setSaving(false);

    if (res.ok) {
      setMsg(editId ? '银行账户已更新' : '银行账户已创建');
      setShowForm(false); setEditId(null);
      void load();
    } else {
      const d = await res.json() as { error: string };
      setError(d.error ?? '保存失败');
    }
  }

  async function toggleActive(b: PaymentBank) {
    await fetch(`/api/website/payment-banks/${b.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: !b.is_active }),
      headers: { 'Content-Type': 'application/json' },
    });
    void load();
  }

  async function reorder(b: PaymentBank, dir: -1 | 1) {
    await fetch(`/api/website/payment-banks/${b.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ display_order: b.display_order + dir }),
      headers: { 'Content-Type': 'application/json' },
    });
    void load();
  }

  async function remove(b: PaymentBank) {
    if (!confirm(`Delete bank "${b.bank_name}"?`)) return;
    await fetch(`/api/website/payment-banks/${b.id}`, { method: 'DELETE' });
    void load();
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Website Payment Banks</h1>
        <button onClick={startCreate}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          + Add Bank
        </button>
      </div>

      {msg   && <div className="mb-4 text-green-700 text-sm bg-green-50 border border-green-200 rounded p-3">{msg}</div>}
      {error && <div className="mb-4 text-red-600 text-sm bg-red-50 border border-red-200 rounded p-3">{error}</div>}

      {/* ── Form ── */}
      {showForm && (
        <div className="mb-6 bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-base font-semibold mb-4">
            {editId ? 'Edit Bank Account' : 'New Bank Account'}
          </h2>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Bank Name *</label>
                <input value={form.bank_name} onChange={e => setField('bank_name', e.target.value)}
                  required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Maybank" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Account Name *</label>
                <input value={form.account_name} onChange={e => setField('account_name', e.target.value)}
                  required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="ACME Sdn Bhd" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Account Number *</label>
                <input value={form.account_number} onChange={e => setField('account_number', e.target.value)}
                  required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="1234567890" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Display Order</label>
                <input type="number" value={form.display_order}
                  onChange={e => setField('display_order', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" min="0" />
              </div>

              {/* QR Code */}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">QR Code Image (optional)</label>
                <div className="flex items-center gap-3">
                  {form.qr_media_id && (
                    <img src={`/api/public/media/${form.qr_media_id}`} alt="QR"
                      className="w-16 h-16 object-contain border border-gray-200 rounded-lg" />
                  )}
                  <button type="button" onClick={() => setShowPicker(true)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                    {form.qr_media_id ? 'Change QR Image' : 'Upload QR Image'}
                  </button>
                  {form.qr_media_id && (
                    <button type="button" onClick={() => setField('qr_media_id', null)}
                      className="text-xs text-red-500 hover:underline">Clear</button>
                  )}
                </div>
              </div>

              {/* Instructions */}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Instructions (optional)</label>
                <textarea value={form.instructions} onChange={e => setField('instructions', e.target.value)}
                  rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="转账时请备注用户名" />
              </div>

              {/* Active */}
              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_active" checked={form.is_active}
                  onChange={e => setField('is_active', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300" />
                <label htmlFor="is_active" className="text-sm font-medium text-gray-700">Active</label>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving...' : editId ? 'Update' : 'Create'}
              </button>
              <button type="button" onClick={cancelForm}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Media Picker ── */}
      {showPicker && (
        <MediaPicker onSelect={handleQRSelect} onClose={() => setShowPicker(false)} />
      )}

      {/* ── Bank List ── */}
      <div className="space-y-3">
        {banks.length === 0 && (
          <div className="text-center py-12 text-gray-500 text-sm">
            No banks configured. Click &quot;+ Add Bank&quot; to create one.
          </div>
        )}
        {banks.map((b, idx) => (
          <div key={b.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-4">

            {/* Reorder */}
            <div className="flex flex-col gap-0.5 shrink-0">
              <button disabled={idx === 0} onClick={() => reorder(b, -1)}
                className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs">▲</button>
              <button disabled={idx === banks.length - 1} onClick={() => reorder(b, 1)}
                className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs">▼</button>
            </div>

            {/* QR preview */}
            {b.qr_media_id && (
              <img src={`/api/public/media/${b.qr_media_id}`} alt="QR"
                className="w-12 h-12 object-contain border border-gray-100 rounded-lg shrink-0" />
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                  b.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {b.is_active ? '启用' : '停用'}
                </span>
                <span className="text-xs text-gray-400">#{b.display_order}</span>
              </div>
              <p className="font-semibold text-sm text-gray-900">{b.bank_name}</p>
              <p className="text-xs text-gray-600">{b.account_name}</p>
              <p className="text-xs font-mono text-gray-800 mt-0.5">{b.account_number}</p>
              {b.instructions && (
                <p className="text-xs text-gray-400 mt-1 truncate">{b.instructions}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => toggleActive(b)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  b.is_active
                    ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                    : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                }`}>
                {b.is_active ? '停用' : '启用'}
              </button>
              <button onClick={() => startEdit(b)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 hover:bg-gray-50">
                Edit
              </button>
              <button onClick={() => remove(b)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-600 hover:bg-red-50">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
