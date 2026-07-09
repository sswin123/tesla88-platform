'use client';
import { useEffect, useState } from 'react';
import { MediaPicker } from '@/components/media/MediaPicker';
import type { MediaRecord } from '@/lib/media/types';
import type { WebsiteGameProvider } from '@/lib/types';

const CATEGORY_LABELS: Record<string, string> = {
  slot:    '老虎机 (Slot)',
  live:    '真人 (Live)',
  sport:   '体育 (Sports)',
  fishing: '捕鱼 (Fishing)',
};

interface FormState {
  provider_code: string;
  provider_name: string;
  category: 'slot' | 'live' | 'sport' | 'fishing';
  logo_media_id: number | null;
  banner_media_id: number | null;
  is_hot: boolean;
  is_new: boolean;
  is_active: boolean;
  display_order: string;
}

const BLANK: FormState = {
  provider_code: '', provider_name: '', category: 'slot',
  logo_media_id: null, banner_media_id: null,
  is_hot: false, is_new: false, is_active: true, display_order: '0',
};

function providerToForm(p: WebsiteGameProvider): FormState {
  return {
    provider_code:   p.provider_code,
    provider_name:   p.provider_name,
    category:        p.category,
    logo_media_id:   p.logo_media_id,
    banner_media_id: p.banner_media_id,
    is_hot:          p.is_hot,
    is_new:          p.is_new,
    is_active:       p.is_active,
    display_order:   String(p.display_order),
  };
}

function StatusBadge({ p }: { p: WebsiteGameProvider }) {
  if (!p.is_active)
    return <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-500">已停用</span>;
  return <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">显示中</span>;
}

export default function WebsiteGameProvidersPage() {
  const [providers, setProviders] = useState<WebsiteGameProvider[]>([]);
  const [editId, setEditId]       = useState<number | null>(null);
  const [form, setForm]           = useState<FormState>(BLANK);
  const [showForm, setShowForm]   = useState(false);
  const [pickerFor, setPickerFor] = useState<'logo' | 'banner' | null>(null);
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState('');
  const [error, setError]         = useState('');

  async function load() {
    const res = await fetch('/api/website/game-providers');
    if (res.ok) setProviders(await res.json() as WebsiteGameProvider[]);
  }

  useEffect(() => { void load(); }, []);

  function startCreate() {
    setEditId(null); setForm(BLANK);
    setShowForm(true); setMsg(''); setError('');
  }

  function startEdit(p: WebsiteGameProvider) {
    setEditId(p.id); setForm(providerToForm(p));
    setShowForm(true); setMsg(''); setError('');
  }

  function cancelForm() { setShowForm(false); setEditId(null); }

  function setField(key: keyof FormState, value: string | boolean | number | null) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function handleMediaSelect(field: 'logo_media_id' | 'banner_media_id', m: MediaRecord | MediaRecord[]) {
    const picked = Array.isArray(m) ? m[0] : m;
    if (picked) setField(field, picked.id);
    setPickerFor(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg(''); setError('');

    const body = {
      provider_code:   form.provider_code.trim(),
      provider_name:   form.provider_name.trim(),
      category:        form.category,
      logo_media_id:   form.logo_media_id,
      banner_media_id: form.banner_media_id,
      is_hot:          form.is_hot,
      is_new:          form.is_new,
      is_active:       form.is_active,
      display_order:   parseInt(form.display_order) || 0,
    };

    const url    = editId ? `/api/website/game-providers/${editId}` : '/api/website/game-providers';
    const method = editId ? 'PATCH' : 'POST';

    const res = await fetch(url, {
      method,
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
    setSaving(false);

    if (res.ok) {
      setMsg(editId ? 'Provider 已更新' : 'Provider 已创建');
      setShowForm(false); setEditId(null);
      void load();
    } else {
      const d = await res.json() as { error: string };
      setError(d.error ?? '保存失败');
    }
  }

  async function toggleActive(p: WebsiteGameProvider) {
    await fetch(`/api/website/game-providers/${p.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: !p.is_active }),
      headers: { 'Content-Type': 'application/json' },
    });
    void load();
  }

  async function toggleHot(p: WebsiteGameProvider) {
    await fetch(`/api/website/game-providers/${p.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_hot: !p.is_hot }),
      headers: { 'Content-Type': 'application/json' },
    });
    void load();
  }

  async function reorder(p: WebsiteGameProvider, dir: -1 | 1) {
    await fetch(`/api/website/game-providers/${p.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ display_order: p.display_order + dir }),
      headers: { 'Content-Type': 'application/json' },
    });
    void load();
  }

  async function remove(p: WebsiteGameProvider) {
    if (!confirm(`Delete provider "${p.provider_name}"?`)) return;
    await fetch(`/api/website/game-providers/${p.id}`, { method: 'DELETE' });
    void load();
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Website Game Providers</h1>
        <button onClick={startCreate}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          + Add Provider
        </button>
      </div>

      {msg   && <div className="mb-4 text-green-700 text-sm bg-green-50 border border-green-200 rounded p-3">{msg}</div>}
      {error && <div className="mb-4 text-red-600 text-sm bg-red-50 border border-red-200 rounded p-3">{error}</div>}

      {/* ── Form ── */}
      {showForm && (
        <div className="mb-6 bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-base font-semibold mb-4">
            {editId ? 'Edit Provider' : 'New Provider'}
          </h2>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Provider Code * <span className="text-gray-400">(unique key)</span></label>
                <input
                  value={form.provider_code} onChange={e => setField('provider_code', e.target.value)}
                  required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="mega888"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Provider Name *</label>
                <input
                  value={form.provider_name} onChange={e => setField('provider_name', e.target.value)}
                  required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Mega888"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                <select value={form.category}
                  onChange={e => setField('category', e.target.value as FormState['category'])}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Display Order</label>
                <input type="number" value={form.display_order}
                  onChange={e => setField('display_order', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" min="0" />
              </div>

              {/* Logo */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Logo</label>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setPickerFor('logo')}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                    {form.logo_media_id ? `Media #${form.logo_media_id}` : 'Pick Logo'}
                  </button>
                  {form.logo_media_id && (
                    <button type="button" onClick={() => setField('logo_media_id', null)}
                      className="text-xs text-red-500 hover:underline">Clear</button>
                  )}
                </div>
              </div>

              {/* Banner */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Banner</label>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setPickerFor('banner')}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                    {form.banner_media_id ? `Media #${form.banner_media_id}` : 'Pick Banner'}
                  </button>
                  {form.banner_media_id && (
                    <button type="button" onClick={() => setField('banner_media_id', null)}
                      className="text-xs text-red-500 hover:underline">Clear</button>
                  )}
                </div>
              </div>

              {/* Toggles */}
              <div className="flex items-center gap-6 col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_hot}
                    onChange={e => setField('is_hot', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300" />
                  <span className="text-sm font-medium text-gray-700">🔥 HOT</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_new}
                    onChange={e => setField('is_new', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300" />
                  <span className="text-sm font-medium text-gray-700">✨ NEW</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_active}
                    onChange={e => setField('is_active', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300" />
                  <span className="text-sm font-medium text-gray-700">Active</span>
                </label>
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
      {pickerFor && (
        <MediaPicker
          onSelect={m => handleMediaSelect(pickerFor === 'logo' ? 'logo_media_id' : 'banner_media_id', m)}
          onClose={() => setPickerFor(null)}
        />
      )}

      {/* ── Provider List ── */}
      <div className="space-y-2">
        {providers.length === 0 && (
          <div className="text-center py-12 text-gray-500 text-sm">
            No providers yet. Click &quot;+ Add Provider&quot; to create one.
          </div>
        )}
        {providers.map((p, idx) => (
          <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4">

            {/* Reorder */}
            <div className="flex flex-col gap-0.5 shrink-0">
              <button disabled={idx === 0} onClick={() => reorder(p, -1)}
                className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs">▲</button>
              <button disabled={idx === providers.length - 1} onClick={() => reorder(p, 1)}
                className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs">▼</button>
            </div>

            {/* Logo preview */}
            <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
              {p.logo_media_id ? (
                <img src={`/api/public/media/${p.logo_media_id}`} alt={p.provider_name}
                  className="w-full h-full object-contain" />
              ) : (
                <span className="text-xl">🎮</span>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <StatusBadge p={p} />
                <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  {CATEGORY_LABELS[p.category] ?? p.category}
                </span>
                {p.is_hot && <span className="text-xs">🔥 HOT</span>}
                {p.is_new && <span className="text-xs">✨ NEW</span>}
                <span className="text-xs text-gray-400">#{p.display_order}</span>
              </div>
              <p className="font-semibold text-sm text-gray-900">{p.provider_name}</p>
              <p className="text-xs text-gray-400">{p.provider_code}</p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => toggleHot(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  p.is_hot
                    ? 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'
                    : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                }`}>
                🔥 HOT
              </button>
              <button onClick={() => toggleActive(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  p.is_active
                    ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                    : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                }`}>
                {p.is_active ? '启用' : '停用'}
              </button>
              <button onClick={() => startEdit(p)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 hover:bg-gray-50">
                Edit
              </button>
              <button onClick={() => remove(p)}
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
