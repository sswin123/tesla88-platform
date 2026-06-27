'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { QuickReply, QuickReplyCategory } from '@/lib/types';

type ContentType = 'TEXT' | 'PHOTO' | 'VIDEO' | 'DOCUMENT';

const CONTENT_TYPE_LABEL: Record<ContentType, string> = {
  TEXT:     '💬 Text',
  PHOTO:    '🖼️ Photo',
  VIDEO:    '🎬 Video',
  DOCUMENT: '📎 Document',
};

const CONTENT_TYPE_ACCEPT: Record<ContentType, string> = {
  TEXT:     '',
  PHOTO:    'image/jpeg,image/png,image/gif,image/webp',
  VIDEO:    'video/mp4,video/mpeg,video/quicktime',
  DOCUMENT: '.pdf,.zip,.docx',
};

// ── Blank form state ──────────────────────────────────────────────────────────

function blankForm() {
  return {
    title: '',
    body: '',
    categoryId: null as number | null,
    contentType: 'TEXT' as ContentType,
    mediaDataUri: null as string | null,
    mediaFileName: '',
  };
}

export default function LiveChatSettingsPage() {
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [categories, setCategories] = useState<QuickReplyCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<number | null>(null);

  // Form state (shared between add and edit)
  const [form, setForm] = useState(blankForm());
  const [editingId, setEditingId] = useState<number | null>(null);  // null = adding
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/livechat/quick-replies?admin=1');
      if (res.ok) {
        const data = (await res.json()) as { replies: QuickReply[]; categories: QuickReplyCategory[] };
        setReplies(data.replies);
        setCategories(data.categories);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  // ── File picker → data URI ──────────────────────────────────────────────────
  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setFormError('File too large (max 20 MB)'); return; }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({
      ...f,
      mediaDataUri: reader.result as string,
      mediaFileName: file.name,
    }));
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ── Toggle active ───────────────────────────────────────────────────────────
  const handleToggleActive = async (reply: QuickReply) => {
    const next = !reply.is_active;
    setReplies((prev) => prev.map((r) => r.id === reply.id ? { ...r, is_active: next } : r));
    const res = await fetch(`/api/livechat/quick-replies/${reply.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: next }),
    });
    if (!res.ok) setReplies((prev) => prev.map((r) => r.id === reply.id ? { ...r, is_active: reply.is_active } : r));
  };

  // ── Favorite toggle ─────────────────────────────────────────────────────────
  const handleToggleFavorite = async (reply: QuickReply) => {
    const newFav = !reply.is_favorite;
    setReplies((prev) => prev.map((r) => r.id === reply.id ? { ...r, is_favorite: newFav } : r));
    const res = await fetch(`/api/livechat/quick-replies/${reply.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_favorite: newFav }),
    });
    if (!res.ok) setReplies((prev) => prev.map((r) => r.id === reply.id ? { ...r, is_favorite: reply.is_favorite } : r));
  };

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = async (id: number) => {
    if (!confirm('Delete this quick reply?')) return;
    const res = await fetch(`/api/livechat/quick-replies/${id}`, { method: 'DELETE' });
    if (res.ok) setReplies((prev) => prev.filter((r) => r.id !== id));
  };

  // ── Start editing ───────────────────────────────────────────────────────────
  const startEdit = (reply: QuickReply) => {
    setEditingId(reply.id);
    setForm({
      title:        reply.title,
      body:         reply.body,
      categoryId:   reply.category_id,
      contentType:  reply.content_type,
      mediaDataUri: null,  // don't load existing blob — re-upload to change
      mediaFileName: '',
    });
    setFormError('');
  };

  const cancelForm = () => {
    setEditingId(null);
    setForm(blankForm());
    setFormError('');
  };

  // ── Submit (add or edit) ────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setFormError('');
    if (!form.title.trim()) { setFormError('Title is required.'); return; }
    if (form.contentType === 'TEXT' && !form.body.trim()) { setFormError('Body is required for Text type.'); return; }
    if (form.contentType !== 'TEXT' && editingId === null && !form.mediaDataUri) {
      setFormError('Please upload a file.'); return;
    }

    setFormBusy(true);
    try {
      const payload: Record<string, unknown> = {
        title:        form.title.trim(),
        body:         form.body.trim(),
        category_id:  form.categoryId,
        content_type: form.contentType,
        sort_order:   0,
      };
      if (form.mediaDataUri) payload.media_content = form.mediaDataUri;

      const isEdit = editingId !== null;
      const res = await fetch(
        isEdit ? `/api/livechat/quick-replies/${editingId}` : '/api/livechat/quick-replies',
        {
          method:  isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
        }
      );
      if (res.ok) {
        cancelForm();
        await loadData();
      } else {
        const d = (await res.json()) as { error?: string };
        setFormError(d.error ?? 'Failed');
      }
    } finally {
      setFormBusy(false);
    }
  };

  const filtered = replies.filter((r) => {
    const matchesSearch =
      search === '' ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.body.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === null || r.category_id === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Quick Replies</h1>

      <Input
        placeholder="Search by title or body…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {/* Category tabs */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setActiveCategory(null)}
          className={`px-3 py-1 rounded-full text-sm border transition-colors ${
            activeCategory === null ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}>All</button>
        {categories.map((cat) => (
          <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
            className={`px-3 py-1 rounded-full text-sm border transition-colors ${
              activeCategory === cat.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}>{cat.name}</button>
        ))}
      </div>

      {/* Reply list */}
      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-400 text-sm">No quick replies found.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((reply) => (
            <div key={reply.id}
              className={`rounded-lg border bg-white p-3 shadow-sm ${!reply.is_active ? 'opacity-50' : ''}`}>
              <div className="flex items-start gap-3">
                {/* Favorite */}
                <button onClick={() => void handleToggleFavorite(reply)}
                  className={`mt-0.5 text-xl leading-none transition-colors ${reply.is_favorite ? 'text-yellow-400' : 'text-gray-300 hover:text-yellow-300'}`}
                  title={reply.is_favorite ? 'Remove from favorites' : 'Add to favorites'}>★</button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">
                      {CONTENT_TYPE_LABEL[reply.content_type] ?? reply.content_type}
                    </span>
                    {reply.category_name && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                        {reply.category_name}
                      </span>
                    )}
                    <span className="font-medium text-sm">{reply.title}</span>
                    {!reply.is_active && (
                      <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">disabled</span>
                    )}
                  </div>
                  {reply.body && <p className="text-xs text-gray-500 truncate">{reply.body}</p>}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => void handleToggleActive(reply)}
                    className="text-xs text-gray-500 hover:text-gray-700 border border-gray-300 rounded px-2 py-0.5">
                    {reply.is_active ? 'Disable' : 'Enable'}
                  </button>
                  <button onClick={() => startEdit(reply)}
                    className="text-xs text-blue-500 hover:text-blue-700 font-medium">Edit</button>
                  <button onClick={() => void handleDelete(reply.id)}
                    className="text-xs text-red-400 hover:text-red-600 font-medium">Delete</button>
                </div>
              </div>

              {/* Inline edit form */}
              {editingId === reply.id && (
                <div className="mt-3 border-t pt-3 space-y-2">
                  <QuickReplyForm
                    form={form} setForm={setForm} categories={categories}
                    fileInputRef={fileInputRef} onFilePick={handleFilePick}
                    error={formError} busy={formBusy}
                    onSubmit={() => void handleSubmit()} onCancel={cancelForm}
                    submitLabel="Save Changes"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add new form (only shown when not editing) */}
      {editingId === null && (
        <div className="rounded-lg border bg-gray-50 p-4 space-y-3">
          <h2 className="font-semibold text-sm">Add New Quick Reply</h2>
          <QuickReplyForm
            form={form} setForm={setForm} categories={categories}
            fileInputRef={fileInputRef} onFilePick={handleFilePick}
            error={formError} busy={formBusy}
            onSubmit={() => void handleSubmit()} onCancel={null}
            submitLabel="Add Reply"
          />
        </div>
      )}
    </div>
  );
}

// ── Shared form component ─────────────────────────────────────────────────────

function QuickReplyForm({
  form, setForm, categories, fileInputRef, onFilePick,
  error, busy, onSubmit, onCancel, submitLabel,
}: {
  form: ReturnType<typeof blankForm>;
  setForm: React.Dispatch<React.SetStateAction<ReturnType<typeof blankForm>>>;
  categories: QuickReplyCategory[];
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFilePick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error: string;
  busy: boolean;
  onSubmit: () => void;
  onCancel: (() => void) | null;
  submitLabel: string;
}) {
  const isMedia = form.contentType !== 'TEXT';
  return (
    <div className="space-y-2">
      {/* Content type */}
      <div className="flex gap-2 items-center">
        <label className="text-xs text-gray-600 w-20 shrink-0">Type</label>
        <select
          value={form.contentType}
          onChange={(e) => setForm((f) => ({ ...f, contentType: e.target.value as ContentType, mediaDataUri: null, mediaFileName: '' }))}
          className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          {(Object.keys(CONTENT_TYPE_LABEL) as ContentType[]).map((t) => (
            <option key={t} value={t}>{CONTENT_TYPE_LABEL[t]}</option>
          ))}
        </select>
      </div>

      {/* Category */}
      <div className="flex gap-2 items-center">
        <label className="text-xs text-gray-600 w-20 shrink-0">Category</label>
        <select
          value={form.categoryId ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value ? Number(e.target.value) : null }))}
          className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          <option value="">None</option>
          {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
        </select>
      </div>

      {/* Title */}
      <div className="flex gap-2 items-center">
        <label className="text-xs text-gray-600 w-20 shrink-0">Title</label>
        <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="e.g. Please wait" className="flex-1" />
      </div>

      {/* Media upload (for non-TEXT types) */}
      {isMedia && (
        <div className="flex gap-2 items-center">
          <label className="text-xs text-gray-600 w-20 shrink-0">File</label>
          <div className="flex-1 flex items-center gap-2">
            <Button variant="outline" size="sm" type="button"
              onClick={() => { fileInputRef.current && (fileInputRef.current.accept = CONTENT_TYPE_ACCEPT[form.contentType]); fileInputRef.current?.click(); }}>
              Upload
            </Button>
            <span className="text-xs text-gray-500 truncate">
              {form.mediaDataUri ? form.mediaFileName || 'File selected' : 'No file (keep existing if editing)'}
            </span>
          </div>
          <input ref={fileInputRef} type="file" className="hidden" onChange={onFilePick} />
        </div>
      )}

      {/* Body / Caption */}
      <div className="flex gap-2 items-start">
        <label className="text-xs text-gray-600 w-20 shrink-0 mt-2">
          {isMedia ? 'Caption' : 'Body'}
        </label>
        <textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
          placeholder={isMedia ? 'Optional caption…' : 'e.g. Please wait a moment.'}
          rows={3}
          className="flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2">
        <Button onClick={onSubmit} disabled={busy} size="sm">
          {busy ? 'Saving…' : submitLabel}
        </Button>
        {onCancel && (
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        )}
      </div>
    </div>
  );
}
