'use client';
import { useEffect, useState } from 'react';
import { MediaPicker } from '@/components/media/MediaPicker';
import type { MediaRecord } from '@/lib/media/types';
import type { WebsiteBanner } from '@/lib/types';

interface FormState {
  title: string;
  description: string;
  image_media_id: number | null;
  mobile_image_media_id: number | null;
  link_url: string;
  button_text: string;
  display_order: string;
  is_active: boolean;
  start_at: string;
  end_at: string;
}

const BLANK: FormState = {
  title: '', description: '', image_media_id: null, mobile_image_media_id: null,
  link_url: '', button_text: '', display_order: '0',
  is_active: true, start_at: '', end_at: '',
};

function toLocalDatetimeValue(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 16); /* "YYYY-MM-DDTHH:mm" */
}

function bannerToForm(b: WebsiteBanner): FormState {
  return {
    title:                 b.title,
    description:           b.description ?? '',
    image_media_id:        b.image_media_id,
    mobile_image_media_id: b.mobile_image_media_id,
    link_url:              b.link_url ?? '',
    button_text:           b.button_text ?? '',
    display_order:         String(b.display_order),
    is_active:             b.is_active,
    start_at:              toLocalDatetimeValue(b.start_at),
    end_at:                toLocalDatetimeValue(b.end_at),
  };
}

function StatusBadge({ banner }: { banner: WebsiteBanner }) {
  const now = new Date();
  if (!banner.is_active)
    return <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-500">已停用</span>;
  if (banner.start_at && new Date(banner.start_at) > now)
    return <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-700">未开始</span>;
  if (banner.end_at && new Date(banner.end_at) < now)
    return <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-600">已过期</span>;
  return <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">显示中</span>;
}

export default function WebsiteBannersPage() {
  const [banners, setBanners]     = useState<WebsiteBanner[]>([]);
  const [editId, setEditId]       = useState<number | null>(null);
  const [form, setForm]           = useState<FormState>(BLANK);
  const [showForm, setShowForm]   = useState(false);
  const [pickerFor, setPickerFor] = useState<'image' | 'mobile' | null>(null);
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState('');
  const [error, setError]         = useState('');

  async function load() {
    const res = await fetch('/api/website/banners');
    if (res.ok) setBanners(await res.json() as WebsiteBanner[]);
  }

  useEffect(() => { void load(); }, []);

  function startCreate() {
    setEditId(null);
    setForm(BLANK);
    setShowForm(true);
    setMsg(''); setError('');
  }

  function startEdit(b: WebsiteBanner) {
    setEditId(b.id);
    setForm(bannerToForm(b));
    setShowForm(true);
    setMsg(''); setError('');
  }

  function cancelForm() {
    setShowForm(false);
    setEditId(null);
  }

  function setField(key: keyof FormState, value: string | boolean | number | null) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function handleMediaSelect(field: 'image_media_id' | 'mobile_image_media_id', m: MediaRecord | MediaRecord[]) {
    const picked = Array.isArray(m) ? m[0] : m;
    if (picked) setField(field, picked.id);
    setPickerFor(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg(''); setError('');

    const body = {
      title:                 form.title.trim(),
      description:           form.description.trim() || null,
      image_media_id:        form.image_media_id,
      mobile_image_media_id: form.mobile_image_media_id,
      link_url:              form.link_url.trim() || null,
      button_text:           form.button_text.trim() || null,
      display_order:         parseInt(form.display_order) || 0,
      is_active:             form.is_active,
      start_at:              form.start_at ? new Date(form.start_at).toISOString() : null,
      end_at:                form.end_at   ? new Date(form.end_at).toISOString()   : null,
    };

    const url    = editId ? `/api/website/banners/${editId}` : '/api/website/banners';
    const method = editId ? 'PATCH' : 'POST';

    const res = await fetch(url, {
      method,
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
    setSaving(false);

    if (res.ok) {
      setMsg(editId ? 'Banner 已更新' : 'Banner 已创建');
      setShowForm(false);
      setEditId(null);
      void load();
    } else {
      const d = await res.json() as { error: string };
      setError(d.error ?? '保存失败');
    }
  }

  async function toggleActive(b: WebsiteBanner) {
    await fetch(`/api/website/banners/${b.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: !b.is_active }),
      headers: { 'Content-Type': 'application/json' },
    });
    void load();
  }

  async function reorder(b: WebsiteBanner, dir: -1 | 1) {
    const newOrder = b.display_order + dir;
    await fetch(`/api/website/banners/${b.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ display_order: newOrder }),
      headers: { 'Content-Type': 'application/json' },
    });
    void load();
  }

  async function remove(b: WebsiteBanner) {
    if (!confirm(`Delete banner "${b.title}"?`)) return;
    await fetch(`/api/website/banners/${b.id}`, { method: 'DELETE' });
    void load();
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Website Banners</h1>
        <button
          onClick={startCreate}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          + New Banner
        </button>
      </div>

      {msg   && <div className="mb-4 text-green-700 text-sm bg-green-50 border border-green-200 rounded p-3">{msg}</div>}
      {error && <div className="mb-4 text-red-600 text-sm bg-red-50 border border-red-200 rounded p-3">{error}</div>}

      {/* ── Create / Edit Form ── */}
      {showForm && (
        <div className="mb-6 bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-base font-semibold mb-4">{editId ? 'Edit Banner' : 'New Banner'}</h2>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Title */}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
                <input
                  value={form.title} onChange={e => setField('title', e.target.value)}
                  required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Banner headline"
                />
              </div>

              {/* Description */}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={form.description} onChange={e => setField('description', e.target.value)}
                  rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Subtitle / body text"
                />
              </div>

              {/* Image */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Desktop Image</label>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setPickerFor('image')}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                    {form.image_media_id ? `Media #${form.image_media_id}` : 'Pick Image'}
                  </button>
                  {form.image_media_id && (
                    <button type="button" onClick={() => setField('image_media_id', null)}
                      className="text-xs text-red-500 hover:underline">Clear</button>
                  )}
                </div>
              </div>

              {/* Mobile image */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Mobile Image</label>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setPickerFor('mobile')}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                    {form.mobile_image_media_id ? `Media #${form.mobile_image_media_id}` : 'Pick Image'}
                  </button>
                  {form.mobile_image_media_id && (
                    <button type="button" onClick={() => setField('mobile_image_media_id', null)}
                      className="text-xs text-red-500 hover:underline">Clear</button>
                  )}
                </div>
              </div>

              {/* Link URL */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Link URL</label>
                <input
                  value={form.link_url} onChange={e => setField('link_url', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="/promotions"
                />
              </div>

              {/* Button text */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Button Text</label>
                <input
                  value={form.button_text} onChange={e => setField('button_text', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="立即领取"
                />
              </div>

              {/* Display order */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Display Order</label>
                <input
                  type="number" value={form.display_order}
                  onChange={e => setField('display_order', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  min="0"
                />
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-2 pt-5">
                <input type="checkbox" id="is_active" checked={form.is_active}
                  onChange={e => setField('is_active', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300" />
                <label htmlFor="is_active" className="text-sm font-medium text-gray-700">Active</label>
              </div>

              {/* Date scheduling */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Start At (optional)</label>
                <input
                  type="datetime-local" value={form.start_at}
                  onChange={e => setField('start_at', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">End At (optional)</label>
                <input
                  type="datetime-local" value={form.end_at}
                  onChange={e => setField('end_at', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={saving}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving…' : editId ? 'Update Banner' : 'Create Banner'}
              </button>
              <button type="button" onClick={cancelForm}
                className="px-5 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Banner list ── */}
      {banners.length === 0 && !showForm ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🖼</p>
          <p>No banners yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {banners.map((b, idx) => (
            <div key={b.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-4">
              {/* Image preview */}
              <div className="w-24 h-14 rounded-lg overflow-hidden shrink-0 bg-gray-100 flex items-center justify-center">
                {b.image_media_id ? (
                  <img
                    src={`/api/public/media/${b.image_media_id}`}
                    alt={b.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-2xl">🖼</span>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm truncate">{b.title}</span>
                  <StatusBadge banner={b} />
                  <span className="text-xs text-gray-400 ml-1">#{b.display_order}</span>
                </div>
                {b.description && (
                  <p className="text-xs text-gray-500 truncate mb-1">{b.description}</p>
                )}
                {b.link_url && (
                  <p className="text-xs text-blue-500 truncate">{b.link_url}</p>
                )}
                {(b.start_at || b.end_at) && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {b.start_at ? `Start: ${new Date(b.start_at).toLocaleString()}` : ''}
                    {b.start_at && b.end_at ? ' · ' : ''}
                    {b.end_at ? `End: ${new Date(b.end_at).toLocaleString()}` : ''}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                {/* Reorder */}
                <button onClick={() => reorder(b, -1)} disabled={idx === 0}
                  className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  title="Move up">↑</button>
                <button onClick={() => reorder(b, 1)} disabled={idx === banners.length - 1}
                  className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  title="Move down">↓</button>

                {/* Toggle */}
                <button onClick={() => toggleActive(b)}
                  className={`px-2.5 py-1 text-xs rounded-full font-medium ml-1 ${
                    b.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}>
                  {b.is_active ? 'Enabled' : 'Disabled'}
                </button>

                {/* Edit */}
                <button onClick={() => startEdit(b)}
                  className="px-3 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 ml-1">
                  Edit
                </button>

                {/* Delete */}
                <button onClick={() => remove(b)}
                  className="px-3 py-1 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50 ml-1">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Media pickers ── */}
      {pickerFor === 'image' && (
        <MediaPicker
          onSelect={m => handleMediaSelect('image_media_id', m)}
          onClose={() => setPickerFor(null)}
          typeFilter={['IMAGE']}
        />
      )}
      {pickerFor === 'mobile' && (
        <MediaPicker
          onSelect={m => handleMediaSelect('mobile_image_media_id', m)}
          onClose={() => setPickerFor(null)}
          typeFilter={['IMAGE']}
        />
      )}
    </div>
  );
}
