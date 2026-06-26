'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type { Announcement } from '@/lib/types';

type AnnType = 'POPUP' | 'BANNER' | 'TICKER' | 'BROADCAST';
type AnnTarget = 'ALL' | 'VIP' | 'TAG';
type AnnStatus = 'DRAFT' | 'ACTIVE' | 'SCHEDULED' | 'ENDED';

interface FormState {
  title: string;
  content: string;
  type: AnnType;
  target: AnnTarget;
  target_tag_id: string;
  status: AnnStatus;
  start_at: string;
  end_at: string;
}

const EMPTY: FormState = {
  title: '',
  content: '',
  type: 'BANNER',
  target: 'ALL',
  target_tag_id: '',
  status: 'DRAFT',
  start_at: '',
  end_at: '',
};

const TYPE_COLORS: Record<AnnType, string> = {
  POPUP: 'bg-purple-100 text-purple-700',
  BANNER: 'bg-blue-100 text-blue-700',
  TICKER: 'bg-cyan-100 text-cyan-700',
  BROADCAST: 'bg-orange-100 text-orange-700',
};

const STATUS_COLORS: Record<AnnStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  ACTIVE: 'bg-green-100 text-green-700',
  SCHEDULED: 'bg-yellow-100 text-yellow-700',
  ENDED: 'bg-red-100 text-red-600',
};

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: 'All', value: '' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Scheduled', value: 'SCHEDULED' },
  { label: 'Ended', value: 'ENDED' },
];

function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function toDatetimeLocal(s: string | null) {
  if (!s) return '';
  // Convert ISO string to datetime-local format (YYYY-MM-DDTHH:mm)
  return new Date(s).toISOString().slice(0, 16);
}

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [broadcastingId, setBroadcastingId] = useState<number | null>(null);
  const [broadcastResult, setBroadcastResult] = useState<Record<number, string>>({});

  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (statusFilter) params.set('status', statusFilter);
    const r = await fetch(`/api/announcements?${params}`);
    if (r.ok) {
      const d = await r.json() as { data: Announcement[]; total: number };
      setAnnouncements(d.data);
      setTotal(d.total);
    }
    setLoading(false);
  }, [page, statusFilter]);

  useEffect(() => { void load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setFormError('');
    setShowForm(true);
  }

  function openEdit(a: Announcement) {
    setEditing(a);
    setForm({
      title: a.title,
      content: a.content,
      type: a.type,
      target: a.target,
      target_tag_id: a.target_tag_id != null ? String(a.target_tag_id) : '',
      status: a.status,
      start_at: toDatetimeLocal(a.start_at),
      end_at: toDatetimeLocal(a.end_at),
    });
    setFormError('');
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditing(null);
    setForm(EMPTY);
    setFormError('');
  }

  async function handleSave() {
    if (!form.title.trim()) { setFormError('Title is required.'); return; }
    if (!form.content.trim()) { setFormError('Content is required.'); return; }
    setSaving(true);
    setFormError('');

    const body = {
      title: form.title.trim(),
      content: form.content.trim(),
      type: form.type,
      target: form.target,
      target_tag_id: form.target === 'TAG' && form.target_tag_id
        ? parseInt(form.target_tag_id, 10)
        : null,
      status: form.status,
      start_at: form.start_at || null,
      end_at: form.end_at || null,
    };

    const url = editing ? `/api/announcements/${editing.id}` : '/api/announcements';
    const method = editing ? 'PATCH' : 'POST';
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (r.ok) {
      cancelForm();
      await load();
    } else {
      const d = await r.json().catch(() => ({})) as { error?: string };
      setFormError(d.error ?? 'Save failed');
    }
    setSaving(false);
  }

  async function handleDelete(a: Announcement) {
    if (!confirm(`Delete announcement "${a.title}"?`)) return;
    await fetch(`/api/announcements/${a.id}`, { method: 'DELETE' });
    await load();
  }

  async function handleBroadcast(a: Announcement) {
    if (!confirm(`Send broadcast for "${a.title}" to ${a.target} users?`)) return;
    setBroadcastingId(a.id);
    setBroadcastResult(prev => ({ ...prev, [a.id]: '' }));

    const r = await fetch(`/api/announcements/${a.id}/broadcast`, { method: 'POST' });
    const d = await r.json() as {
      ok?: boolean;
      sent?: number;
      total?: number;
      message?: string;
      telegram_ids?: string[];
      errors?: string[];
    };

    if (d.ok) {
      if (d.message) {
        setBroadcastResult(prev => ({ ...prev, [a.id]: d.message ?? '' }));
      } else {
        setBroadcastResult(prev => ({
          ...prev,
          [a.id]: `Sent to ${d.sent ?? 0} / ${d.total ?? 0} users`,
        }));
      }
      await load();
    } else {
      setBroadcastResult(prev => ({ ...prev, [a.id]: 'Broadcast failed' }));
    }
    setBroadcastingId(null);
  }

  function F(field: keyof FormState) {
    return (
      e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
    ) => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Announcement Center</h1>
        <Button onClick={openCreate}>+ New Announcement</Button>
      </div>

      {/* Status filter pills */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => { setStatusFilter(f.value); setPage(1); }}
            className={`rounded-full px-4 py-1 text-sm font-medium border transition-colors ${
              statusFilter === f.value
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-sm text-gray-400 self-center">{total} total</span>
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="rounded-lg border bg-gray-50 p-4 space-y-4">
          <h2 className="font-semibold text-lg">
            {editing ? 'Edit Announcement' : 'New Announcement'}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 space-y-1">
              <Label htmlFor="ann-title">Title *</Label>
              <Input id="ann-title" value={form.title} onChange={F('title')} placeholder="Announcement title" />
            </div>

            <div className="md:col-span-2 space-y-1">
              <Label htmlFor="ann-content">Content *</Label>
              <textarea
                id="ann-content"
                value={form.content}
                onChange={F('content')}
                rows={4}
                placeholder="Announcement content / message body"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="ann-type">Type</Label>
              <select
                id="ann-type"
                value={form.type}
                onChange={F('type')}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              >
                <option value="BANNER">Banner</option>
                <option value="POPUP">Popup</option>
                <option value="TICKER">Ticker</option>
                <option value="BROADCAST">Broadcast (Telegram)</option>
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="ann-status">Status</Label>
              <select
                id="ann-status"
                value={form.status}
                onChange={F('status')}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              >
                <option value="DRAFT">Draft</option>
                <option value="ACTIVE">Active</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="ENDED">Ended</option>
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="ann-target">Target Audience</Label>
              <select
                id="ann-target"
                value={form.target}
                onChange={F('target')}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              >
                <option value="ALL">All Members</option>
                <option value="VIP">VIP Members</option>
                <option value="TAG">By Tag</option>
              </select>
            </div>

            {form.target === 'TAG' && (
              <div className="space-y-1">
                <Label htmlFor="ann-tag-id">Tag ID</Label>
                <Input
                  id="ann-tag-id"
                  type="number"
                  min={1}
                  value={form.target_tag_id}
                  onChange={F('target_tag_id')}
                  placeholder="e.g. 3"
                />
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="ann-start">Start At</Label>
              <Input
                id="ann-start"
                type="datetime-local"
                value={form.start_at}
                onChange={F('start_at')}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="ann-end">End At</Label>
              <Input
                id="ann-end"
                type="datetime-local"
                value={form.end_at}
                onChange={F('end_at')}
              />
            </div>
          </div>

          {formError && (
            <p className="text-sm text-red-600">{formError}</p>
          )}

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
            </Button>
            <Button variant="outline" onClick={cancelForm} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex h-40 items-center justify-center text-gray-400">Loading…</div>
      ) : announcements.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-gray-400">
          No announcements found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                {['Title', 'Type', 'Target', 'Status', 'Start', 'End', 'Sent', 'Created By', 'Actions'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {announcements.map(a => (
                <tr key={a.id} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-2 max-w-[200px]">
                    <div className="font-medium truncate">{a.title}</div>
                    <div className="text-xs text-gray-400 truncate max-w-[180px]">{a.content}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[a.type]}`}>
                      {a.type}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {a.target === 'TAG'
                      ? `Tag: ${a.target_tag_name ?? a.target_tag_id ?? '?'}`
                      : a.target}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[a.status]}`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">{fmtDate(a.start_at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">{fmtDate(a.end_at)}</td>
                  <td className="px-3 py-2 text-center">{a.sent_count}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{a.created_by}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1 min-w-[120px]">
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEdit(a)}
                          className="rounded px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(a)}
                          className="rounded px-2 py-1 text-xs bg-red-50 text-red-600 hover:bg-red-100"
                        >
                          Delete
                        </button>
                      </div>
                      {a.type === 'BROADCAST' && (
                        <button
                          onClick={() => handleBroadcast(a)}
                          disabled={broadcastingId === a.id}
                          className="rounded px-2 py-1 text-xs bg-orange-100 text-orange-700 hover:bg-orange-200 disabled:opacity-50"
                        >
                          {broadcastingId === a.id ? 'Sending…' : 'Send Now'}
                        </button>
                      )}
                      {broadcastResult[a.id] && (
                        <span className="text-xs text-gray-500 break-words max-w-[200px]">
                          {broadcastResult[a.id]}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2 justify-end text-sm">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded px-3 py-1 border disabled:opacity-40 hover:bg-gray-50"
          >
            Prev
          </button>
          <span className="text-gray-500">Page {page} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded px-3 py-1 border disabled:opacity-40 hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
