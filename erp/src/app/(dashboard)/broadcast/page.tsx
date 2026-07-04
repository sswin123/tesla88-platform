'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Send, Plus, X, Radio, MessageSquare, Image, Film, Music,
  FileText, Package, Archive, File, Eye, Trash2, Copy, Clock,
  CheckCircle, AlertCircle, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Broadcast, BroadcastContentType, BroadcastAudienceType, BroadcastChannel } from '@/lib/types';
import type { MediaRecord } from '@/lib/media/types';
import { formatBytes } from '@/lib/utils/format-bytes';
import { MediaPicker } from '@/components/media/MediaPicker';

// ── Constants ─────────────────────────────────────────────────────────────────

const CONTENT_TYPES: { value: BroadcastContentType; label: string; icon: React.ElementType }[] = [
  { value: 'TEXT',     label: 'Text',     icon: MessageSquare },
  { value: 'IMAGE',    label: 'Image',    icon: Image },
  { value: 'GIF',      label: 'GIF',      icon: Image },
  { value: 'VIDEO',    label: 'Video',    icon: Film },
  { value: 'AUDIO',    label: 'Audio',    icon: Music },
  { value: 'DOCUMENT', label: 'Document', icon: FileText },
  { value: 'PDF',      label: 'PDF',      icon: FileText },
  { value: 'APK',      label: 'APK',      icon: Package },
  { value: 'ZIP',      label: 'ZIP',      icon: Archive },
  { value: 'RAR',      label: 'RAR',      icon: Archive },
];

const AUDIENCE_OPTIONS: { value: BroadcastAudienceType; label: string; desc: string }[] = [
  { value: 'ALL',           label: 'All Members',      desc: 'Every registered user with a Telegram ID' },
  { value: 'ACTIVE',        label: 'Active Members',   desc: 'Seen in last 30 days' },
  { value: 'INACTIVE',      label: 'Inactive Members', desc: 'Not seen in 30+ days' },
  { value: 'VIP',           label: 'VIP Members',      desc: 'Users tagged as VIP' },
  { value: 'TAG',           label: 'By Tag',           desc: 'Members with a specific tag' },
  { value: 'DEPOSITED',     label: 'Deposited Users',  desc: 'At least one deposit' },
  { value: 'NEVER_DEPOSIT', label: 'Never Deposited',  desc: 'No deposits yet' },
  { value: 'SELECTED',      label: 'Selected Members', desc: 'Manually entered Telegram IDs' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  DRAFT:          { label: 'Draft',     color: 'bg-gray-100 text-gray-600',       icon: File },
  SCHEDULED:      { label: 'Scheduled', color: 'bg-yellow-100 text-yellow-700',   icon: Clock },
  SENDING:        { label: 'Sending…',  color: 'bg-blue-100 text-blue-700',       icon: Loader2 },
  SENT:           { label: 'Sent',      color: 'bg-green-100 text-green-700',     icon: CheckCircle },
  PARTIALLY_SENT: { label: 'Partial',   color: 'bg-orange-100 text-orange-700',   icon: AlertCircle },
  FAILED:         { label: 'Failed',    color: 'bg-red-100 text-red-600',         icon: AlertCircle },
  CANCELLED:      { label: 'Cancelled', color: 'bg-gray-100 text-gray-500',       icon: X },
};

// ── Form state ────────────────────────────────────────────────────────────────

interface FormState {
  title: string;
  channels: BroadcastChannel[];
  contentType: BroadcastContentType;
  body: string;
  caption: string;
  mediaId: number | null;
  mediaRecord: MediaRecord | null;
  audienceType: BroadcastAudienceType;
  audienceTagId: number | null;
  audienceUserIds: string; // comma-separated telegram_ids for SELECTED type
  scheduledAt: string;    // ISO string or ''
}

function blankForm(): FormState {
  return {
    title: '', channels: ['TELEGRAM'], contentType: 'TEXT',
    body: '', caption: '', mediaId: null, mediaRecord: null,
    audienceType: 'ALL', audienceTagId: null, audienceUserIds: '', scheduledAt: '',
  };
}

function broadcastToForm(b: Broadcast): FormState {
  return {
    title:           b.title,
    channels:        b.channels,
    contentType:     b.content_type,
    body:            b.body,
    caption:         b.caption ?? '',
    mediaId:         b.media_id,
    mediaRecord:     b.media ?? null,
    audienceType:    b.audience_type,
    audienceTagId:   b.audience_tag_id,
    audienceUserIds: '',
    scheduledAt:     b.scheduled_at
      ? new Date(b.scheduled_at).toISOString().slice(0, 16)
      : '',
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BroadcastPage() {
  const [broadcasts, setBroadcasts]       = useState<Broadcast[]>([]);
  const [total, setTotal]                 = useState(0);
  const [loading, setLoading]             = useState(true);
  const [statusFilter, setStatusFilter]   = useState('');
  const [showForm, setShowForm]           = useState(false);
  const [editingId, setEditingId]         = useState<number | null>(null);
  const [form, setForm]                   = useState<FormState>(blankForm());
  const [formBusy, setFormBusy]           = useState(false);
  const [formError, setFormError]         = useState('');
  const [showPicker, setShowPicker]       = useState(false);
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [countLoading, setCountLoading]   = useState(false);
  const [previewTab, setPreviewTab]       = useState<'compose' | 'preview'>('compose');
  const [sendingId, setSendingId]         = useState<number | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: '1', limit: '50' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/broadcast?${params}`);
      if (res.ok) {
        const d = await res.json() as { data: Broadcast[]; total: number };
        setBroadcasts(d.data);
        setTotal(d.total);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { void loadData(); }, [loadData]);

  // ── Audience count preview ────────────────────────────────────────────────

  const fetchAudienceCount = useCallback(async (type: BroadcastAudienceType, tagId?: number | null) => {
    setCountLoading(true);
    try {
      const params = new URLSearchParams({ type });
      if (tagId) params.set('tag_id', String(tagId));
      const res = await fetch(`/api/broadcast/audience-count?${params}`);
      if (res.ok) {
        const d = await res.json() as { count: number };
        setAudienceCount(d.count);
      }
    } finally {
      setCountLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showForm) {
      void fetchAudienceCount(form.audienceType, form.audienceTagId);
    }
  }, [form.audienceType, form.audienceTagId, showForm, fetchAudienceCount]);

  // ── Form open/close ───────────────────────────────────────────────────────

  function openNew() {
    setEditingId(null);
    setForm(blankForm());
    setFormError('');
    setPreviewTab('compose');
    setShowForm(true);
  }

  function openEdit(b: Broadcast) {
    if (!['DRAFT', 'SCHEDULED'].includes(b.status)) return;
    setEditingId(b.id);
    setForm(broadcastToForm(b));
    setFormError('');
    setPreviewTab('compose');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(blankForm());
    setFormError('');
    setAudienceCount(null);
  }

  // ── Save draft ────────────────────────────────────────────────────────────

  const saveDraft = async () => {
    if (!form.title.trim()) { setFormError('Title is required.'); return; }
    if (form.channels.length === 0) { setFormError('Select at least one channel.'); return; }
    setFormBusy(true); setFormError('');
    try {
      const payload = {
        title:             form.title.trim(),
        content_type:      form.contentType,
        body:              form.body.trim(),
        caption:           form.caption.trim() || null,
        media_id:          form.mediaId,
        channels:          form.channels,
        audience_type:     form.audienceType,
        audience_tag_id:   form.audienceTagId,
        audience_user_ids: form.audienceType === 'SELECTED' && form.audienceUserIds
          ? form.audienceUserIds.split(',').map(s => s.trim()).filter(Boolean).map(Number)
          : null,
      };
      const isEdit = editingId !== null;
      const res = await fetch(
        isEdit ? `/api/broadcast/${editingId}` : '/api/broadcast',
        { method: isEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      );
      if (res.ok) {
        closeForm();
        await loadData();
      } else {
        const d = await res.json() as { error?: string };
        setFormError(d.error ?? 'Failed to save.');
      }
    } finally {
      setFormBusy(false);
    }
  };

  // ── Send Now / Schedule (two-step: save → send) ───────────────────────────

  const handleSendNow = async () => {
    if (!form.title.trim()) { setFormError('Title is required.'); return; }
    if (form.channels.length === 0) { setFormError('Select at least one channel.'); return; }
    setFormBusy(true); setFormError('');
    try {
      // 1. Save/update draft
      const savePayload = {
        title:             form.title.trim(),
        content_type:      form.contentType,
        body:              form.body.trim(),
        caption:           form.caption.trim() || null,
        media_id:          form.mediaId,
        channels:          form.channels,
        audience_type:     form.audienceType,
        audience_tag_id:   form.audienceTagId,
        audience_user_ids: form.audienceType === 'SELECTED' && form.audienceUserIds
          ? form.audienceUserIds.split(',').map(s => s.trim()).filter(Boolean).map(Number)
          : null,
      };
      const isEdit = editingId !== null;
      const saveRes = await fetch(
        isEdit ? `/api/broadcast/${editingId}` : '/api/broadcast',
        { method: isEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(savePayload) }
      );
      if (!saveRes.ok) {
        const d = await saveRes.json() as { error?: string };
        setFormError(d.error ?? 'Failed to save.'); return;
      }
      const saved = await saveRes.json() as { id?: number; broadcast?: { id: number } };
      const targetId = isEdit
        ? editingId!
        : ((saved as { id: number }).id ?? (saved as { broadcast: { id: number } }).broadcast?.id);
      if (!targetId) { setFormError('Could not get broadcast ID.'); return; }

      // 2. Send / schedule
      const sendBody = form.scheduledAt ? { scheduled_at: new Date(form.scheduledAt).toISOString() } : {};
      const sendRes = await fetch(`/api/broadcast/${targetId}/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sendBody),
      });
      if (sendRes.ok) {
        closeForm(); await loadData();
      } else {
        const d = await sendRes.json() as { error?: string };
        setFormError(d.error ?? 'Send failed.');
      }
    } finally {
      setFormBusy(false);
    }
  };

  // ── Send from list row ────────────────────────────────────────────────────

  const handleSend = async (id: number, scheduledAt?: string) => {
    setSendingId(id);
    try {
      const res = await fetch(`/api/broadcast/${id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scheduledAt ? { scheduled_at: scheduledAt } : {}),
      });
      if (res.ok) {
        closeForm();
        await loadData();
      } else {
        const d = await res.json() as { error?: string };
        setFormError(d.error ?? 'Send failed.');
      }
    } finally {
      setSendingId(null);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this draft?')) return;
    const res = await fetch(`/api/broadcast/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setBroadcasts(prev => prev.filter(b => b.id !== id));
      if (editingId === id) closeForm();
    }
  };

  // ── Duplicate ─────────────────────────────────────────────────────────────

  const handleDuplicate = async (b: Broadcast) => {
    setEditingId(null);
    setForm({ ...broadcastToForm(b), title: `${b.title} (copy)`, scheduledAt: '' });
    setFormError('');
    setPreviewTab('compose');
    setShowForm(true);
  };

  // ── Media picker ──────────────────────────────────────────────────────────

  function handleMediaSelected(media: MediaRecord | MediaRecord[]) {
    const m = Array.isArray(media) ? media[0] : media;
    if (!m) return;
    setForm(f => ({ ...f, mediaId: m.id, mediaRecord: m }));
  }

  // ── Toggle channel ────────────────────────────────────────────────────────

  function toggleChannel(ch: BroadcastChannel) {
    setForm(f => ({
      ...f,
      channels: f.channels.includes(ch)
        ? f.channels.filter(c => c !== ch)
        : [...f.channels, ch],
    }));
  }

  // ── Analytics summary (from loaded data) ─────────────────────────────────

  const analytics = {
    total:   broadcasts.length,
    sent:    broadcasts.filter(b => b.status === 'SENT').reduce((s, b) => s + b.success_count, 0),
    failed:  broadcasts.filter(b => b.status !== 'DRAFT').reduce((s, b) => s + b.failed_count, 0),
    pending: broadcasts.filter(b => ['DRAFT', 'SCHEDULED'].includes(b.status)).length,
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0">
      {/* ── Left: History ────────────────────────────────────────────────── */}
      <div className={`flex flex-col min-h-0 overflow-hidden ${showForm ? 'flex-1' : 'w-full'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-white shrink-0">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Radio className="w-5 h-5 text-blue-600" />
            Broadcast Center
          </h1>
          <Button size="sm" onClick={openNew}>
            <Plus className="w-4 h-4 mr-1" /> New Broadcast
          </Button>
        </div>

        {/* Analytics strip */}
        <div className="grid grid-cols-4 gap-0 border-b bg-gray-50 shrink-0">
          {[
            { label: 'Total',   value: analytics.total,   color: 'text-gray-700' },
            { label: 'Sent',    value: analytics.sent,    color: 'text-green-700' },
            { label: 'Failed',  value: analytics.failed,  color: 'text-red-600' },
            { label: 'Pending', value: analytics.pending, color: 'text-yellow-700' },
          ].map(a => (
            <div key={a.label} className="flex flex-col items-center py-2 border-r last:border-r-0">
              <span className={`text-lg font-bold ${a.color}`}>{a.value}</span>
              <span className="text-xs text-gray-400">{a.label}</span>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div className="flex gap-2 px-4 py-2 border-b bg-white shrink-0">
          {['', 'DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'PARTIALLY_SENT', 'FAILED'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                statusFilter === s
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
              }`}
            >{s || 'All'}</button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-32 items-center justify-center text-gray-400 text-sm">Loading…</div>
          ) : broadcasts.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-gray-400 text-sm">No broadcasts yet.</div>
          ) : (
            <div className="divide-y">
              {broadcasts.map(b => {
                const cfg = STATUS_CONFIG[b.status] ?? STATUS_CONFIG.DRAFT;
                const StatusIcon = cfg.icon;
                return (
                  <div
                    key={b.id}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => openEdit(b)}
                  >
                    <div className="mt-0.5 shrink-0">
                      <StatusIcon className="w-4 h-4 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        <span className="text-sm font-medium truncate">{b.title}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                        <span>{b.channels.join(' + ')}</span>
                        <span>{b.audience_type}</span>
                        {b.status !== 'DRAFT' && (
                          <span className="text-green-600">✓ {b.success_count}</span>
                        )}
                        {b.failed_count > 0 && (
                          <span className="text-red-500">✗ {b.failed_count}</span>
                        )}
                        <span>{new Date(b.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      {['DRAFT', 'SCHEDULED'].includes(b.status) && (
                        <button
                          onClick={() => void handleSend(b.id)}
                          disabled={sendingId === b.id}
                          title="Send Now"
                          className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-40"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => void handleDuplicate(b)}
                        title="Duplicate"
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {b.status === 'DRAFT' && (
                        <button
                          onClick={() => void handleDelete(b.id)}
                          title="Delete"
                          className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t bg-gray-50 text-xs text-gray-400 shrink-0">
          {broadcasts.length} of {total} broadcasts
        </div>
      </div>

      {/* ── Right: Composer ───────────────────────────────────────────────── */}
      {showForm && (
        <div className="w-96 border-l bg-white flex flex-col shrink-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
            <h2 className="font-semibold text-sm">
              {editingId !== null ? 'Edit Broadcast' : 'New Broadcast'}
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPreviewTab('compose')}
                className={`text-xs px-2 py-1 rounded ${previewTab === 'compose' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'}`}
              >Compose</button>
              <button
                onClick={() => setPreviewTab('preview')}
                className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${previewTab === 'preview' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'}`}
              ><Eye className="w-3 h-3" /> Preview</button>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-700 ml-1">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {previewTab === 'preview' ? (
            /* ── Preview panel ─────────────────────────────────────────── */
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Telegram Preview</p>
              <div className="bg-[#effdde] rounded-2xl rounded-br-none px-4 py-2 max-w-xs ml-auto shadow-sm">
                {form.contentType !== 'TEXT' && form.mediaRecord && (
                  <div className="mb-2 text-xs text-gray-500 italic">
                    [{form.contentType} — {form.mediaRecord.displayName} ({formatBytes(form.mediaRecord.fileSize)})]
                  </div>
                )}
                <p className="text-sm whitespace-pre-wrap break-words">
                  {form.contentType === 'TEXT'
                    ? (form.body || <span className="text-gray-400 italic">No message yet</span>)
                    : (form.caption || form.title || <span className="text-gray-400 italic">No caption</span>)
                  }
                </p>
                <p className="text-[10px] text-gray-400 text-right mt-1">
                  {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} ✓✓
                </p>
              </div>

              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-4">Live Chat Preview</p>
              <div className="bg-blue-50 rounded-2xl rounded-br-none px-4 py-2 max-w-xs ml-auto border border-blue-100">
                <p className="text-[10px] text-blue-500 font-medium mb-1">Support Agent</p>
                {form.contentType !== 'TEXT' && form.mediaRecord && (
                  <div className="mb-2 text-xs text-gray-500 italic">
                    [{form.contentType}] {form.mediaRecord.displayName}
                  </div>
                )}
                <p className="text-sm whitespace-pre-wrap break-words text-gray-800">
                  {form.contentType === 'TEXT'
                    ? (form.body || <span className="text-gray-400 italic">No message</span>)
                    : (form.caption || form.title || '')
                  }
                </p>
              </div>
            </div>
          ) : (
            /* ── Compose panel ─────────────────────────────────────────── */
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Title */}
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Title <span className="text-red-500">*</span></Label>
                <Input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Weekend Promotion"
                  className="text-sm"
                />
              </div>

              {/* Channels */}
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Channels <span className="text-red-500">*</span></Label>
                <div className="flex gap-2">
                  {(['TELEGRAM', 'LIVECHAT'] as BroadcastChannel[]).map(ch => (
                    <button
                      key={ch}
                      onClick={() => toggleChannel(ch)}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                        form.channels.includes(ch)
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                      }`}
                    >
                      {ch === 'TELEGRAM' ? <Send className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />}
                      {ch === 'TELEGRAM' ? 'Telegram' : 'Live Chat'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Content type */}
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Content Type</Label>
                <div className="flex flex-wrap gap-1">
                  {CONTENT_TYPES.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setForm(f => ({
                        ...f,
                        contentType: t.value,
                        ...(t.value === 'TEXT' ? { mediaId: null, mediaRecord: null } : {}),
                      }))}
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

              {/* Body (TEXT) or Media (non-TEXT) */}
              {form.contentType === 'TEXT' ? (
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Message <span className="text-red-500">*</span></Label>
                  <textarea
                    value={form.body}
                    onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                    rows={4}
                    placeholder="Message to broadcast…"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 resize-none"
                  />
                </div>
              ) : (
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Media <span className="text-red-500">*</span></Label>
                  {form.mediaRecord ? (
                    <div className="rounded-lg border p-3 space-y-2">
                      {(form.contentType === 'IMAGE' || form.contentType === 'GIF') && (
                        <img
                          src={`/api/media/${form.mediaRecord.id}/thumbnail`}
                          alt=""
                          className="w-full rounded object-cover max-h-24"
                        />
                      )}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{form.mediaRecord.displayName}</p>
                          <p className="text-[10px] text-gray-400">{formatBytes(form.mediaRecord.fileSize)}</p>
                        </div>
                        <button
                          onClick={() => setForm(f => ({ ...f, mediaId: null, mediaRecord: null }))}
                          className="text-gray-400 hover:text-red-500 shrink-0"
                        >
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

              {/* Caption */}
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Caption <span className="text-gray-400">(optional)</span></Label>
                <Input
                  value={form.caption}
                  onChange={e => setForm(f => ({ ...f, caption: e.target.value }))}
                  placeholder="Caption shown with media…"
                  className="text-sm"
                />
              </div>

              {/* Audience */}
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Audience</Label>
                <select
                  value={form.audienceType}
                  onChange={e => setForm(f => ({ ...f, audienceType: e.target.value as BroadcastAudienceType, audienceTagId: null }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                >
                  {AUDIENCE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label} — {o.desc}</option>
                  ))}
                </select>

                {/* Audience count preview */}
                <p className="text-xs text-gray-400 mt-1">
                  {countLoading ? 'Counting…' : audienceCount !== null ? `≈ ${audienceCount} recipients` : ''}
                </p>

                {/* SELECTED: textarea for telegram IDs */}
                {form.audienceType === 'SELECTED' && (
                  <div className="mt-2">
                    <Label className="text-xs text-gray-500 mb-1 block">User IDs (comma-separated)</Label>
                    <textarea
                      value={form.audienceUserIds}
                      onChange={e => setForm(f => ({ ...f, audienceUserIds: e.target.value }))}
                      rows={3}
                      placeholder="123456789, 987654321"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-gray-400 resize-none"
                    />
                  </div>
                )}
              </div>

              {/* Schedule */}
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">
                  Schedule <span className="text-gray-400">(leave blank to send immediately)</span>
                </Label>
                <Input
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))}
                  className="text-sm"
                />
              </div>

              {formError && <p className="text-xs text-red-500">{formError}</p>}
            </div>
          )}

          {/* Footer actions */}
          <div className="flex gap-2 px-4 py-3 border-t shrink-0">
            <Button variant="outline" size="sm" onClick={closeForm} className="flex-1">Cancel</Button>
            <Button
              variant="outline" size="sm"
              onClick={() => void saveDraft()}
              disabled={formBusy}
            >
              {formBusy ? 'Saving…' : 'Save Draft'}
            </Button>
            <Button
              size="sm"
              onClick={() => void handleSendNow()}
              disabled={formBusy || sendingId !== null}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {form.scheduledAt ? (
                <><Clock className="w-3.5 h-3.5 mr-1" />Schedule</>
              ) : (
                <><Send className="w-3.5 h-3.5 mr-1" />Send Now</>
              )}
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
