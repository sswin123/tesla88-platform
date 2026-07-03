'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  MessageSquare, Image, Film, Music, FileText, File, Package, Archive,
  Star, Copy, Trash2, Eye, EyeOff, Plus, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { QuickReply, QuickReplyCategory, QuickReplyContentType } from '@/lib/types';
import type { MediaRecord } from '@/lib/media/types';
import { formatBytes } from '@/lib/utils/format-bytes';
import { MediaPicker } from '@/components/media/MediaPicker';

// ── Content type config ───────────────────────────────────────────────────────

const CONTENT_TYPES: { value: QuickReplyContentType; label: string; icon: React.ElementType }[] = [
  { value: 'TEXT',     label: 'Text',     icon: MessageSquare },
  { value: 'IMAGE',    label: 'Image',    icon: Image },
  { value: 'GIF',      label: 'GIF',      icon: Image },
  { value: 'VIDEO',    label: 'Video',    icon: Film },
  { value: 'AUDIO',    label: 'Audio',    icon: Music },
  { value: 'VOICE',    label: 'Voice',    icon: Music },
  { value: 'DOCUMENT', label: 'Document', icon: FileText },
  { value: 'PDF',      label: 'PDF',      icon: FileText },
  { value: 'APK',      label: 'APK',      icon: Package },
  { value: 'ZIP',      label: 'ZIP',      icon: Archive },
  { value: 'RAR',      label: 'RAR',      icon: Archive },
];

const TYPE_ICON: Record<string, React.ElementType> = {
  TEXT: MessageSquare, IMAGE: Image, GIF: Image, VIDEO: Film, AUDIO: Music, VOICE: Music,
  DOCUMENT: FileText, PDF: FileText, APK: Package, ZIP: Archive, RAR: Archive,
};

const TYPE_BADGE: Record<string, string> = {
  TEXT: 'bg-gray-100 text-gray-600', IMAGE: 'bg-blue-100 text-blue-700',
  GIF: 'bg-purple-100 text-purple-700', VIDEO: 'bg-red-100 text-red-700',
  AUDIO: 'bg-green-100 text-green-700', VOICE: 'bg-teal-100 text-teal-700',
  DOCUMENT: 'bg-gray-100 text-gray-700', PDF: 'bg-orange-100 text-orange-700',
  APK: 'bg-yellow-100 text-yellow-700', ZIP: 'bg-indigo-100 text-indigo-700',
  RAR: 'bg-indigo-100 text-indigo-700',
};

const SORT_OPTIONS = [
  { label: 'Sort Order',   value: 'sort_order' },
  { label: 'Newest First', value: 'newest' },
  { label: 'A → Z',        value: 'alpha' },
];

// ── Blank form ────────────────────────────────────────────────────────────────

interface FormState {
  title: string;
  body: string;
  caption: string;
  contentType: QuickReplyContentType;
  mediaId: number | null;
  mediaRecord: MediaRecord | null;
  categoryId: number | null;
  sortOrder: number;
  isActive: boolean;
}

function blankForm(): FormState {
  return {
    title: '', body: '', caption: '', contentType: 'TEXT',
    mediaId: null, mediaRecord: null, categoryId: null, sortOrder: 0, isActive: true,
  };
}

function replyToForm(r: QuickReply): FormState {
  return {
    title:       r.title,
    body:        r.body,
    caption:     r.caption ?? '',
    contentType: r.content_type,
    mediaId:     r.media_id,
    mediaRecord: r.media ?? null,
    categoryId:  r.category_id,
    sortOrder:   r.sort_order,
    isActive:    r.is_active,
  };
}

// ── Page component ────────────────────────────────────────────────────────────

export default function QuickRepliesPage() {
  const [replies, setReplies]         = useState<QuickReply[]>([]);
  const [categories, setCategories]   = useState<QuickReplyCategory[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [catFilter, setCatFilter]     = useState<number | null>(null);
  const [typeFilter, setTypeFilter]   = useState<string>('');
  const [sort, setSort]               = useState('sort_order');
  const [selected, setSelected]       = useState<QuickReply | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkMode, setBulkMode]       = useState(false);

  // Form
  const [form, setForm]               = useState<FormState>(blankForm());
  const [editingId, setEditingId]     = useState<number | null>(null); // null = new
  const [showForm, setShowForm]       = useState(false);
  const [formBusy, setFormBusy]       = useState(false);
  const [formError, setFormError]     = useState('');
  const [showPicker, setShowPicker]   = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/livechat/quick-replies?admin=1');
      if (res.ok) {
        const d = await res.json() as { replies: QuickReply[]; categories: QuickReplyCategory[] };
        setReplies(d.replies);
        setCategories(d.categories);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  // ── Filter + sort ─────────────────────────────────────────────────────────

  const filtered = replies
    .filter(r => {
      if (search && !r.title.toLowerCase().includes(search.toLowerCase()) &&
          !r.body.toLowerCase().includes(search.toLowerCase())) return false;
      if (catFilter !== null && r.category_id !== catFilter) return false;
      if (typeFilter && r.content_type !== typeFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (sort === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sort === 'alpha')  return a.title.localeCompare(b.title);
      return (a.sort_order - b.sort_order) || a.id - b.id;
    });

  // ── Form actions ──────────────────────────────────────────────────────────

  function openNew() {
    setEditingId(null);
    setForm(blankForm());
    setFormError('');
    setShowForm(true);
    setSelected(null);
  }

  function openEdit(r: QuickReply) {
    setEditingId(r.id);
    setForm(replyToForm(r));
    setFormError('');
    setShowForm(true);
    setSelected(r);
  }

  function openDuplicate(r: QuickReply) {
    setEditingId(null);
    setForm({ ...replyToForm(r), title: `${r.title} (copy)`, sortOrder: 0 });
    setFormError('');
    setShowForm(true);
    setSelected(null);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(blankForm());
    setFormError('');
  }

  const handleSubmit = async () => {
    setFormError('');
    if (!form.title.trim()) { setFormError('Title is required.'); return; }
    if (form.contentType === 'TEXT' && !form.body.trim()) {
      setFormError('Body is required for Text type.'); return;
    }
    if (form.contentType !== 'TEXT' && !form.mediaId) {
      setFormError('Please select a media file.'); return;
    }
    setFormBusy(true);
    try {
      const payload = {
        title:        form.title.trim(),
        body:         form.body.trim(),
        caption:      form.caption.trim() || null,
        content_type: form.contentType,
        media_id:     form.mediaId,
        category_id:  form.categoryId,
        sort_order:   form.sortOrder,
        is_active:    form.isActive,
      };
      const isEdit = editingId !== null;
      const res = await fetch(
        isEdit ? `/api/livechat/quick-replies/${editingId}` : '/api/livechat/quick-replies',
        { method: isEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      );
      if (res.ok) {
        closeForm();
        await loadData();
      } else {
        const d = await res.json() as { error?: string };
        setFormError(d.error ?? 'Failed');
      }
    } finally {
      setFormBusy(false);
    }
  };

  // ── Card actions ──────────────────────────────────────────────────────────

  const handleToggleActive = async (r: QuickReply) => {
    const next = !r.is_active;
    setReplies(prev => prev.map(x => x.id === r.id ? { ...x, is_active: next } : x));
    const res = await fetch(`/api/livechat/quick-replies/${r.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: next }),
    });
    if (!res.ok) setReplies(prev => prev.map(x => x.id === r.id ? { ...x, is_active: r.is_active } : x));
  };

  const handleToggleFavorite = async (r: QuickReply) => {
    const next = !r.is_favorite;
    setReplies(prev => prev.map(x => x.id === r.id ? { ...x, is_favorite: next } : x));
    await fetch(`/api/livechat/quick-replies/${r.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_favorite: next }),
    });
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this quick reply?')) return;
    const res = await fetch(`/api/livechat/quick-replies/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setReplies(prev => prev.filter(r => r.id !== id));
      if (selected?.id === id) closeForm();
    }
  };

  // ── Bulk actions ──────────────────────────────────────────────────────────

  const handleBulkDelete = async () => {
    if (!confirm(`Archive ${selectedIds.size} quick replies?`)) return;
    await fetch('/api/livechat/quick-replies/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'archive', ids: [...selectedIds] }),
    });
    setSelectedIds(new Set());
    setBulkMode(false);
    await loadData();
  };

  const handleBulkToggle = async (active: boolean) => {
    await fetch('/api/livechat/quick-replies/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: active ? 'enable' : 'disable', ids: [...selectedIds] }),
    });
    setSelectedIds(new Set());
    setBulkMode(false);
    await loadData();
  };

  // ── Media picker ──────────────────────────────────────────────────────────

  function handleMediaSelected(media: MediaRecord | MediaRecord[]) {
    const m = Array.isArray(media) ? media[0] : media;
    if (!m) return;
    setForm(f => ({ ...f, mediaId: m.id, mediaRecord: m }));
  }

  function clearMedia() {
    setForm(f => ({ ...f, mediaId: null, mediaRecord: null }));
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex gap-0 h-full min-h-0">
      {/* ── Left panel: list ──────────────────────────────────────────────── */}
      <div className={`flex flex-col min-h-0 overflow-hidden ${showForm ? 'flex-1' : 'w-full'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-white shrink-0">
          <h1 className="text-xl font-bold">Quick Replies</h1>
          <div className="flex gap-2">
            <Button
              variant="outline" size="sm"
              onClick={() => { setBulkMode(v => !v); setSelectedIds(new Set()); }}
            >
              {bulkMode ? 'Cancel Select' : 'Select'}
            </Button>
            <Button size="sm" onClick={openNew}>
              <Plus className="w-4 h-4 mr-1" /> New
            </Button>
          </div>
        </div>

        {/* Bulk actions bar */}
        {bulkMode && selectedIds.size > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b text-sm shrink-0">
            <span className="text-blue-700 font-medium">{selectedIds.size} selected</span>
            <Button size="sm" variant="outline" onClick={() => void handleBulkToggle(true)}>Enable</Button>
            <Button size="sm" variant="outline" onClick={() => void handleBulkToggle(false)}>Disable</Button>
            <Button size="sm" variant="outline" onClick={() => void handleBulkDelete()} className="text-red-600 border-red-200 hover:bg-red-50">Delete</Button>
          </div>
        )}

        {/* Filter bar */}
        <div className="flex flex-wrap gap-2 px-4 py-2 border-b bg-white shrink-0">
          <Input
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-44 h-8 text-sm"
          />
          {/* Category chips */}
          <div className="flex gap-1 flex-wrap items-center">
            <button
              onClick={() => setCatFilter(null)}
              className={`rounded-full px-3 py-1 text-xs font-medium border ${catFilter === null ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'}`}
            >All</button>
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => setCatFilter(c.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium border ${catFilter === c.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'}`}
              >{c.name}</button>
            ))}
          </div>
          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400"
          >
            <option value="">All Types</option>
            {CONTENT_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          {/* Sort */}
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400 ml-auto"
          >
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-gray-400 text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-gray-400 text-sm">
              {search || catFilter || typeFilter ? 'No results.' : 'No quick replies yet.'}
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map(r => {
                const Icon = TYPE_ICON[r.content_type] ?? File;
                const isChecked = selectedIds.has(r.id);
                return (
                  <div
                    key={r.id}
                    className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer ${!r.is_active ? 'opacity-60' : ''} ${selected?.id === r.id && showForm ? 'bg-blue-50 hover:bg-blue-50' : ''}`}
                    onClick={() => { if (bulkMode) { setSelectedIds(prev => { const s = new Set(prev); s.has(r.id) ? s.delete(r.id) : s.add(r.id); return s; }); } else { openEdit(r); } }}
                  >
                    {/* Checkbox / favorite */}
                    {bulkMode ? (
                      <input type="checkbox" checked={isChecked} readOnly className="mt-1 shrink-0" />
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); void handleToggleFavorite(r); }}
                        className={`mt-0.5 shrink-0 text-xl leading-none ${r.is_favorite ? 'text-yellow-400' : 'text-gray-200 hover:text-yellow-300'}`}
                      >★</button>
                    )}

                    {/* Thumbnail / icon */}
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center">
                      {r.media_id && (r.content_type === 'IMAGE' || r.content_type === 'GIF') ? (
                        <img
                          src={`/api/media/${r.media_id}/thumbnail`}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <Icon className="w-5 h-5 text-gray-400" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${TYPE_BADGE[r.content_type] ?? 'bg-gray-100 text-gray-600'}`}>
                          {r.content_type}
                        </span>
                        {r.category_name && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                            {r.category_name}
                          </span>
                        )}
                        <span className="font-medium text-sm truncate">{r.title}</span>
                        {!r.is_active && <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Disabled</span>}
                      </div>
                      <p className="text-xs text-gray-400 truncate">
                        {r.body || r.caption || (r.media ? r.media.displayName : '—')}
                      </p>
                    </div>

                    {/* Actions */}
                    {!bulkMode && (
                      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => void handleToggleActive(r)}
                          title={r.is_active ? 'Disable' : 'Enable'}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                        >
                          {r.is_active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => openDuplicate(r)}
                          title="Duplicate"
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => void handleDelete(r.id)}
                          title="Delete"
                          className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer: item count */}
        <div className="px-4 py-2 border-t bg-gray-50 text-xs text-gray-400 shrink-0">
          {filtered.length} of {replies.length} replies
        </div>
      </div>

      {/* ── Right panel: form ─────────────────────────────────────────────── */}
      {showForm && (
        <div className="w-80 border-l bg-white flex flex-col shrink-0 overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
            <h2 className="font-semibold text-sm">
              {editingId !== null ? 'Edit Quick Reply' : 'New Quick Reply'}
            </h2>
            <button onClick={closeForm} className="text-gray-400 hover:text-gray-700">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Title */}
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Title <span className="text-red-500">*</span></Label>
              <Input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Welcome message"
                className="text-sm"
              />
            </div>

            {/* Content type chips */}
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Type</Label>
              <div className="flex flex-wrap gap-1">
                {CONTENT_TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => {
                      setForm(f => ({
                        ...f,
                        contentType: t.value,
                        // Clear media if switching to TEXT
                        ...(t.value === 'TEXT' ? { mediaId: null, mediaRecord: null } : {}),
                      }));
                    }}
                    className={`flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium border transition-colors ${
                      form.contentType === t.value
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                    }`}
                  >
                    <t.icon className="w-3 h-3" />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Media section (non-TEXT) */}
            {form.contentType !== 'TEXT' && (
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Media <span className="text-red-500">*</span></Label>
                {form.mediaRecord ? (
                  <div className="rounded-lg border p-3 space-y-2">
                    {/* Preview */}
                    {(form.contentType === 'IMAGE' || form.contentType === 'GIF') && (
                      <img
                        src={`/api/media/${form.mediaRecord.id}/thumbnail`}
                        alt=""
                        className="w-full rounded object-cover max-h-32"
                      />
                    )}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{form.mediaRecord.displayName}</p>
                        <p className="text-[10px] text-gray-400">{formatBytes(form.mediaRecord.fileSize)}</p>
                      </div>
                      <button onClick={clearMedia} className="text-gray-400 hover:text-red-500 shrink-0">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <button
                      onClick={() => setShowPicker(true)}
                      className="text-xs text-blue-600 hover:text-blue-800 underline"
                    >Change</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowPicker(true)}
                    className="w-full rounded-lg border-2 border-dashed border-gray-300 py-4 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
                  >
                    Choose from Library
                  </button>
                )}
              </div>
            )}

            {/* Body (TEXT only) */}
            {form.contentType === 'TEXT' && (
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Message <span className="text-red-500">*</span></Label>
                <textarea
                  value={form.body}
                  onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                  rows={4}
                  placeholder="Message text…"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 resize-none"
                />
              </div>
            )}

            {/* Caption (all types) */}
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Caption <span className="text-gray-400">(optional)</span></Label>
              <Input
                value={form.caption}
                onChange={e => setForm(f => ({ ...f, caption: e.target.value }))}
                placeholder="Caption shown under media…"
                className="text-sm"
              />
            </div>

            {/* Category */}
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Category</Label>
              <select
                value={form.categoryId ?? ''}
                onChange={e => setForm(f => ({ ...f, categoryId: e.target.value ? parseInt(e.target.value, 10) : null }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              >
                <option value="">None</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Sort Order */}
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Sort Order</Label>
              <Input
                type="number"
                value={form.sortOrder}
                onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value, 10) || 0 }))}
                className="text-sm w-24"
              />
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between">
              <Label className="text-xs text-gray-500">Active</Label>
              <button
                onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                className={`relative w-10 h-5 rounded-full transition-colors ${form.isActive ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            {formError && <p className="text-xs text-red-500">{formError}</p>}
          </div>

          {/* Form footer */}
          <div className="flex gap-2 px-4 py-3 border-t shrink-0">
            <Button variant="outline" size="sm" onClick={closeForm} className="flex-1">Cancel</Button>
            <Button size="sm" onClick={() => void handleSubmit()} disabled={formBusy} className="flex-1">
              {formBusy ? 'Saving…' : editingId !== null ? 'Save' : 'Create'}
            </Button>
          </div>
        </div>
      )}

      {/* MediaPicker modal */}
      {showPicker && (
        <MediaPicker
          onSelect={handleMediaSelected}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
