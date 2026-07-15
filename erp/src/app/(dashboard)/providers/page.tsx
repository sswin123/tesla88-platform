'use client';

import { useEffect, useState } from 'react';
import type { Provider } from '@/lib/types';

// Existing dashboard pages use simple Tailwind styling — follow that pattern
// No special imports needed beyond React and types

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<Provider>>({});
  const [addForm, setAddForm] = useState({ name: '', display_name: '', description: '', logo_url: '', sort_order: 0 });
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch('/api/providers');
      const d = await r.json() as { providers: Provider[] };
      setProviders(d.providers);
    } catch { setError('Failed to load providers'); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function toggleStatus(p: Provider) {
    const next = p.status === 'ACTIVE' ? 'MAINTENANCE' : p.status === 'MAINTENANCE' ? 'DISABLED' : 'ACTIVE';
    await fetch(`/api/providers/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    await load();
  }

  function startEdit(p: Provider) {
    setEditingId(p.id);
    setEditForm({ display_name: p.display_name, description: p.description, logo_url: p.logo_url, sort_order: p.sort_order });
  }

  async function saveEdit() {
    if (!editingId) return;
    setSaving(true);
    await fetch(`/api/providers/${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    setEditingId(null);
    setSaving(false);
    await load();
  }

  async function addProvider() {
    if (!addForm.name || !addForm.display_name) return;
    setSaving(true);
    await fetch('/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm),
    });
    setAddForm({ name: '', display_name: '', description: '', logo_url: '', sort_order: 0 });
    setAdding(false);
    setSaving(false);
    await load();
  }

  function statusBadge(status: Provider['status']) {
    const map = {
      ACTIVE: 'bg-green-100 text-green-800',
      DISABLED: 'bg-red-100 text-red-800',
      MAINTENANCE: 'bg-yellow-100 text-yellow-800',
    };
    return (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${map[status]}`}>
        {status}
      </span>
    );
  }

  if (loading) return <div className="p-8 text-gray-500">Loading providers...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Provider Management</h1>
        <button
          onClick={() => setAdding(!adding)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {adding ? 'Cancel' : '+ Add Provider'}
        </button>
      </div>

      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* Edit Modal */}
      {editingId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Edit Provider</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Display Name</label>
                <input
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  value={editForm.display_name ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Description</label>
                <textarea
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  rows={2}
                  value={editForm.description ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Logo URL</label>
                <input
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  value={editForm.logo_url ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, logo_url: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Sort Order</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  value={editForm.sort_order ?? 0}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '' || /^-?\d*$/.test(v)) setEditForm({ ...editForm, sort_order: v === '' ? 0 : parseInt(v, 10) });
                  }}
                  onBlur={(e) => {
                    const n = parseInt(e.target.value, 10);
                    setEditForm({ ...editForm, sort_order: isNaN(n) ? 0 : n });
                  }}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditingId(null)} className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
              <button onClick={saveEdit} disabled={saving} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Providers Table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              {['Logo', 'Name', 'Display Name', 'Status', 'Sort', 'Description', 'Actions'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
            {providers.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                <td className="px-4 py-3">
                  {p.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.logo_url} alt={p.name} className="h-8 w-8 rounded object-cover" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-gray-200 text-xs font-bold text-gray-600 dark:bg-gray-700">
                      {p.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{p.name}</td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{p.display_name}</td>
                <td className="px-4 py-3">{statusBadge(p.status)}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{p.sort_order}</td>
                <td className="max-w-xs px-4 py-3 text-sm text-gray-500 dark:text-gray-400 truncate">{p.description ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(p)} className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300">Edit</button>
                    <button onClick={() => toggleStatus(p)} className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300">
                      {p.status === 'ACTIVE' ? '⏸ Maintenance' : p.status === 'MAINTENANCE' ? '🚫 Disable' : '✓ Enable'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {providers.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">No providers found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Provider Form */}
      {adding && (
        <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-white">Add New Provider</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Name (unique key)*</label>
              <input className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Display Name*</label>
              <input className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                value={addForm.display_name} onChange={(e) => setAddForm({ ...addForm, display_name: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Logo URL</label>
              <input className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                value={addForm.logo_url} onChange={(e) => setAddForm({ ...addForm, logo_url: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Sort Order</label>
              <input
                type="text"
                inputMode="numeric"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                value={addForm.sort_order}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '' || /^-?\d*$/.test(v)) setAddForm({ ...addForm, sort_order: v === '' ? 0 : parseInt(v, 10) });
                }}
                onBlur={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setAddForm({ ...addForm, sort_order: isNaN(n) ? 0 : n });
                }}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Description</label>
              <textarea rows={2} className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                value={addForm.description} onChange={(e) => setAddForm({ ...addForm, description: e.target.value })} />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setAdding(false)} className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
            <button onClick={addProvider} disabled={saving || !addForm.name || !addForm.display_name}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Adding...' : 'Add Provider'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
