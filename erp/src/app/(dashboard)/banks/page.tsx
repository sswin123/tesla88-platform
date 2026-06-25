'use client';

import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type { PaymentBank } from '@/lib/types';

type FormData = {
  bank_name: string;
  account_number: string;
  account_name: string;
  qr_image: string;
  display_order: string;
};

const EMPTY: FormData = {
  bank_name: '', account_number: '', account_name: '',
  qr_image: '', display_order: '0',
};

export default function BankManagerPage() {
  const [banks, setBanks]         = useState<PaymentBank[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState<PaymentBank | null>(null);
  const [form, setForm]           = useState<FormData>(EMPTY);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const fileRef                   = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const r = await fetch('/api/banks');
    setBanks(await r.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setError('');
    setShowModal(true);
  }

  function openEdit(b: PaymentBank) {
    setEditing(b);
    setForm({
      bank_name:      b.bank_name,
      account_number: b.account_number,
      account_name:   b.account_name,
      qr_image:       b.qr_image ?? '',
      display_order:  String(b.display_order),
    });
    setError('');
    setShowModal(true);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, qr_image: reader.result as string }));
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    if (!form.bank_name || !form.account_number || !form.account_name) {
      setError('Bank name, account number, and account name are required.');
      return;
    }
    setSaving(true);
    setError('');
    const body = {
      bank_name:      form.bank_name,
      account_number: form.account_number,
      account_name:   form.account_name,
      qr_image:       form.qr_image || null,
      display_order:  parseInt(form.display_order, 10) || 0,
    };
    const url    = editing ? `/api/banks/${editing.id}` : '/api/banks';
    const method = editing ? 'PATCH' : 'POST';
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      setShowModal(false);
      await load();
    } else {
      const d = await r.json().catch(() => ({}));
      setError(d.error ?? 'Save failed');
    }
    setSaving(false);
  }

  async function toggleActive(b: PaymentBank) {
    const r = await fetch(`/api/banks/${b.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !b.is_active }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(d.error ?? 'Failed to update bank status');
      return;
    }
    await load();
  }

  async function handleDelete(b: PaymentBank) {
    if (!confirm(`Delete bank "${b.bank_name}"? This cannot be undone.`)) return;
    const r = await fetch(`/api/banks/${b.id}`, { method: 'DELETE' });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(d.error ?? 'Failed to delete bank');
      return;
    }
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Bank Manager</h1>
        <Button onClick={openCreate}>+ Add Bank</Button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-gray-400">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                {['Order','Bank','Account Name','Account Number','QR','Status','Actions'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {banks.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-500">{b.display_order}</td>
                  <td className="px-3 py-2 font-medium">{b.bank_name}</td>
                  <td className="px-3 py-2">{b.account_name}</td>
                  <td className="px-3 py-2 font-mono">{b.account_number}</td>
                  <td className="px-3 py-2">
                    {b.qr_image
                      ? <img src={b.qr_image} alt="QR" className="h-10 w-10 object-contain rounded" />
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={b.is_active ? 'default' : 'secondary'}>
                      {b.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => openEdit(b)}>Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => toggleActive(b)}>
                        {b.is_active ? 'Disable' : 'Enable'}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(b)}>Del</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {banks.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">No banks yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold">{editing ? 'Edit Bank' : 'Add Bank'}</h2>
            <div className="space-y-3">
              {([
                ['bank_name',      'Bank Name',       'e.g. CIMB Bank'],
                ['account_name',   'Account Name',    'e.g. ABC Company Sdn Bhd'],
                ['account_number', 'Account Number',  'e.g. 1234567890'],
                ['display_order',  'Display Order',   '0'],
              ] as const).map(([field, label, placeholder]) => (
                <div key={field}>
                  <Label className="mb-1 block">{label}</Label>
                  <Input
                    placeholder={placeholder}
                    value={form[field]}
                    onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                  />
                </div>
              ))}
              <div>
                <Label className="mb-1 block">QR Code Image (optional)</Label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFile}
                  className="block w-full text-sm text-gray-500 file:mr-2 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1 file:text-sm"
                />
                {form.qr_image && (
                  <img src={form.qr_image} alt="QR preview" className="mt-2 h-24 w-24 rounded border object-contain" />
                )}
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
