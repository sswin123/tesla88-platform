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
  maintenance_mode: boolean;
  maintenance_message: string;
  provider_binding: string;
  priority: string;
};

const EMPTY: FormData = {
  bank_name: '', account_number: '', account_name: '',
  qr_image: '', display_order: '0',
  maintenance_mode: false, maintenance_message: '',
  provider_binding: '', priority: '0',
};

export default function BankManagerPage() {
  const [banks, setBanks]         = useState<PaymentBank[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState<PaymentBank | null>(null);
  const [form, setForm]           = useState<FormData>(EMPTY);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [cmsProviders, setCmsProviders] = useState<string[]>([]);
  const fileRef                   = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const [banksRes, providersRes] = await Promise.all([
        fetch('/api/banks'),
        fetch('/api/website/game-providers/names'),
      ]);
      if (banksRes.ok) {
        setBanks(await banksRes.json());
      }
      if (providersRes.ok) {
        const provData = await providersRes.json();
        if (Array.isArray(provData)) {
          setCmsProviders(provData.map((p: { provider_name: string }) => p.provider_name));
        }
      }
    } finally {
      setLoading(false);
    }
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
      bank_name:           b.bank_name,
      account_number:      b.account_number,
      account_name:        b.account_name,
      qr_image:            b.qr_image ?? '',
      display_order:       String(b.display_order),
      maintenance_mode:    b.maintenance_mode,
      maintenance_message: b.maintenance_message ?? '',
      provider_binding:    b.provider_binding ?? '',
      priority:            String(b.priority),
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
      bank_name:           form.bank_name,
      account_number:      form.account_number,
      account_name:        form.account_name,
      qr_image:            form.qr_image || null,
      display_order:       parseInt(form.display_order, 10) || 0,
      maintenance_mode:    form.maintenance_mode,
      maintenance_message: form.maintenance_message || null,
      provider_binding:    form.provider_binding || null,
      priority:            parseInt(form.priority, 10) || 0,
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
      setError((d as { error?: string }).error ?? 'Save failed');
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
      alert((d as { error?: string }).error ?? 'Failed to update bank status');
      return;
    }
    await load();
  }

  async function toggleMaintenance(b: PaymentBank) {
    const r = await fetch(`/api/banks/${b.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maintenance_mode: !b.maintenance_mode }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert((d as { error?: string }).error ?? 'Failed to toggle maintenance mode');
      return;
    }
    await load();
  }

  async function handleDelete(b: PaymentBank) {
    if (!confirm(`Delete bank "${b.bank_name}"? This cannot be undone.`)) return;
    const r = await fetch(`/api/banks/${b.id}`, { method: 'DELETE' });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert((d as { error?: string }).error ?? 'Failed to delete bank');
      return;
    }
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bank Manager</h1>
          <p className="text-sm text-gray-500 mt-0.5">单一数据源 — Website 与 Telegram Bot 均从此处读取</p>
        </div>
        <Button onClick={openCreate}>+ Add Bank</Button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-gray-400">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                {['P','Order','Bank','Account Name','Account Number','Provider','QR','Status','Maintenance','Actions'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {banks.map((b) => (
                <tr key={b.id} className={`hover:bg-gray-50 ${b.maintenance_mode ? 'bg-yellow-50' : ''}`}>
                  <td className="px-3 py-2 text-gray-400 font-mono text-xs">{b.priority}</td>
                  <td className="px-3 py-2 text-gray-500">{b.display_order}</td>
                  <td className="px-3 py-2 font-medium">{b.bank_name}</td>
                  <td className="px-3 py-2">{b.account_name}</td>
                  <td className="px-3 py-2 font-mono">{b.account_number}</td>
                  <td className="px-3 py-2">
                    {b.provider_binding
                      ? <Badge variant="secondary" className="text-xs">{b.provider_binding}</Badge>
                      : <span className="text-gray-300 text-xs">All</span>}
                  </td>
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
                    {b.maintenance_mode ? (
                      <div>
                        <Badge variant="destructive">Maintenance</Badge>
                        {b.maintenance_message && (
                          <div className="mt-0.5 text-xs text-gray-500 max-w-[140px] truncate">{b.maintenance_message}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Normal</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => openEdit(b)}>Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => toggleActive(b)}>
                        {b.is_active ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        size="sm"
                        variant={b.maintenance_mode ? 'outline' : 'secondary'}
                        onClick={() => toggleMaintenance(b)}
                      >
                        {b.maintenance_mode ? 'End Maint.' : 'Maintenance'}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(b)}>Del</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {banks.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-gray-400">No banks yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
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

              {/* Provider Binding */}
              <div>
                <Label className="mb-1 block">Provider Binding (optional)</Label>
                <select
                  value={form.provider_binding}
                  onChange={(e) => setForm((f) => ({ ...f, provider_binding: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">All Providers</option>
                  {cmsProviders.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">If set, this bank only appears when customer deposits into that provider.</p>
              </div>

              {/* Priority */}
              <div>
                <Label className="mb-1 block">Priority (higher = shown first)</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                />
              </div>

              {/* Maintenance Mode */}
              <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    id="maintenance_mode"
                    type="checkbox"
                    checked={form.maintenance_mode}
                    onChange={(e) => setForm((f) => ({ ...f, maintenance_mode: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="maintenance_mode" className="text-sm font-medium text-yellow-800">
                    Maintenance Mode (hide from website & bot)
                  </Label>
                </div>
                {form.maintenance_mode && (
                  <div>
                    <Input
                      placeholder="Maintenance message shown to users (optional)"
                      value={form.maintenance_message}
                      onChange={(e) => setForm((f) => ({ ...f, maintenance_message: e.target.value }))}
                      className="text-sm"
                    />
                  </div>
                )}
              </div>

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
