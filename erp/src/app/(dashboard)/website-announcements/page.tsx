'use client';
import { useEffect, useState } from 'react';
import type { WebsiteAnnouncement } from '@/lib/types';

const TYPE_LABELS: Record<string, string> = {
  info:      'Info',
  promotion: 'Promotion',
  warning:   'Warning',
};

const TYPE_COLORS: Record<string, string> = {
  info:      'bg-blue-50 text-blue-700 border-blue-200',
  promotion: 'bg-purple-50 text-purple-700 border-purple-200',
  warning:   'bg-yellow-50 text-yellow-700 border-yellow-200',
};

interface FormState {
  title: string;
  message: string;
  type: 'info' | 'promotion' | 'warning';
  link_url: string;
  display_order: string;
  is_active: boolean;
  start_at: string;
  end_at: string;
}

const BLANK: FormState = {
  title: '', message: '', type: 'info', link_url: '',
  display_order: '0', is_active: true, start_at: '', end_at: '',
};

function toLocalDatetimeValue(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 16);
}

function announcementToForm(a: WebsiteAnnouncement): FormState {
  return {
    title:         a.title,
    message:       a.message,
    type:          a.type,
    link_url:      a.link_url ?? '',
    display_order: String(a.display_order),
    is_active:     a.is_active,
    start_at:      toLocalDatetimeValue(a.start_at),
    end_at:        toLocalDatetimeValue(a.end_at),
  };
}

function StatusBadge({ item }: { item: WebsiteAnnouncement }) {
  const now = new Date();
  if (!item.is_active)
    return <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-500">已停用</span>;
  if (item.start_at && new Date(item.start_at) > now)
    return <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-700">未开始</span>;
  if (item.end_at && new Date(item.end_at) < now)
    return <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-600">已过期</span>;
  return <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">显示中</span>;
}

export default function WebsiteAnnouncementsPage() {
  const [items, setItems]       = useState<WebsiteAnnouncement[]>([]);
  const [editId, setEditId]     = useState<number | null>(null);
  const [form, setForm]         = useState<FormState>(BLANK);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState('');
  const [error, setError]       = useState('');

  async function load() {
    const res = await fetch('/api/website/announcements');
    if (res.ok) setItems(await res.json() as WebsiteAnnouncement[]);
  }

  useEffect(() => { void load(); }, []);

  function startCreate() {
    setEditId(null);
    setForm(BLANK);
    setShowForm(true);
    setMsg(''); setError('');
  }

  function startEdit(a: WebsiteAnnouncement) {
    setEditId(a.id);
    setForm(announcementToForm(a));
    setShowForm(true);
    setMsg(''); setError('');
  }

  function cancelForm() {
    setShowForm(false);
    setEditId(null);
  }

  function setField(key: keyof FormState, value: string | boolean) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg(''); setError('');

    const body = {
      title:         form.title.trim(),
      message:       form.message.trim(),
      type:          form.type,
      link_url:      form.link_url.trim() || null,
      display_order: parseInt(form.display_order) || 0,
      is_active:     form.is_active,
      start_at:      form.start_at ? new Date(form.start_at).toISOString() : null,
      end_at:        form.end_at   ? new Date(form.end_at).toISOString()   : null,
    };

    const url    = editId ? `/api/website/announcements/${editId}` : '/api/website/announcements';
    const method = editId ? 'PATCH' : 'POST';

    const res = await fetch(url, {
      method,
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
    setSaving(false);

    if (res.ok) {
      setMsg(editId ? '公告已更新' : '公告已创建');
      setShowForm(false);
      setEditId(null);
      void load();
    } else {
      const d = await res.json() as { error: string };
      setError(d.error ?? '保存失败');
    }
  }

  async function toggleActive(a: WebsiteAnnouncement) {
    await fetch(`/api/website/announcements/${a.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: !a.is_active }),
      headers: { 'Content-Type': 'application/json' },
    });
    void load();
  }

  async function reorder(a: WebsiteAnnouncement, dir: -1 | 1) {
    await fetch(`/api/website/announcements/${a.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ display_order: a.display_order + dir }),
      headers: { 'Content-Type': 'application/json' },
    });
    void load();
  }

  async function remove(a: WebsiteAnnouncement) {
    if (!confirm(`Delete announcement "${a.title}"?`)) return;
    await fetch(`/api/website/announcements/${a.id}`, { method: 'DELETE' });
    void load();
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Website Announcements</h1>
        <button
          onClick={startCreate}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          + New Announcement
        </button>
      </div>

      {msg   && <div className="mb-4 text-green-700 text-sm bg-green-50 border border-green-200 rounded p-3">{msg}</div>}
      {error && <div className="mb-4 text-red-600 text-sm bg-red-50 border border-red-200 rounded p-3">{error}</div>}

      {/* ── Create / Edit Form ── */}
      {showForm && (
        <div className="mb-6 bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-base font-semibold mb-4">
            {editId ? 'Edit Announcement' : 'New Announcement'}
          </h2>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Title */}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
                <input
                  value={form.title} onChange={e => setField('title', e.target.value)}
                  required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Announcement title"
                />
              </div>

              {/* Message */}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Message *</label>
                <textarea
                  value={form.message} onChange={e => setField('message', e.target.value)}
                  required rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Announcement text shown in ticker"
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={form.type}
                  onChange={e => setField('type', e.target.value as 'info' | 'promotion' | 'warning')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="info">📢 Info</option>
                  <option value="promotion">🎁 Promotion</option>
                  <option value="warning">⚠️ Warning</option>
                </select>
              </div>

              {/* Link URL */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Link URL (optional)</label>
                <input
                  value={form.link_url} onChange={e => setField('link_url', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="/promotions"
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

            <div className="flex gap-3 pt-2">
              <button
                type="submit" disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : editId ? 'Update' : 'Create'}
              </button>
              <button
                type="button" onClick={cancelForm}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Announcement List ── */}
      <div className="space-y-3">
        {items.length === 0 && (
          <div className="text-center py-12 text-gray-500 text-sm">
            No announcements yet. Click &quot;+ New Announcement&quot; to create one.
          </div>
        )}
        {items.map((a, idx) => (
          <div key={a.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-4">

            {/* Reorder */}
            <div className="flex flex-col gap-1 shrink-0">
              <button
                disabled={idx === 0}
                onClick={() => reorder(a, -1)}
                className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-20"
                title="Move up"
              >▲</button>
              <button
                disabled={idx === items.length - 1}
                onClick={() => reorder(a, 1)}
                className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-20"
                title="Move down"
              >▼</button>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <StatusBadge item={a} />
                <span className={`inline-block px-2 py-0.5 text-xs rounded-full border ${TYPE_COLORS[a.type] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                  {TYPE_LABELS[a.type] ?? a.type}
                </span>
                <span className="text-xs text-gray-400">#{a.display_order}</span>
              </div>
              <p className="font-semibold text-sm text-gray-900">{a.title}</p>
              <p className="text-xs text-gray-600 mt-0.5 truncate">{a.message}</p>
              {a.link_url && (
                <p className="text-xs text-blue-600 mt-0.5 truncate">{a.link_url}</p>
              )}
              {(a.start_at || a.end_at) && (
                <p className="text-xs text-gray-400 mt-1">
                  {a.start_at ? `From: ${new Date(a.start_at).toLocaleString()}` : ''}
                  {a.start_at && a.end_at ? ' — ' : ''}
                  {a.end_at ? `Until: ${new Date(a.end_at).toLocaleString()}` : ''}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => toggleActive(a)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  a.is_active
                    ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                    : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                }`}
              >
                {a.is_active ? '启用' : '停用'}
              </button>
              <button
                onClick={() => startEdit(a)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 hover:bg-gray-50"
              >
                Edit
              </button>
              <button
                onClick={() => remove(a)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
