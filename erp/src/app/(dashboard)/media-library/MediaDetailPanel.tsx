'use client';

import { useRef, useState } from 'react';
import { X, Download, RefreshCw, Archive, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { MediaRecord } from '@/lib/media/types';
import { formatBytes } from '@/lib/utils/format-bytes';

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function MediaDetailPanel({
  item,
  onUpdated,
  onDeleted,
  onClose,
}: {
  item: MediaRecord;
  onUpdated: (updated: MediaRecord) => void;
  onDeleted: () => void;
  onClose: () => void;
}) {
  const [displayName, setDisplayName] = useState(item.displayName);
  const [editingName, setEditingName] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const replaceRef = useRef<HTMLInputElement>(null);

  const isImage  = item.mediaType === 'IMAGE' || item.mediaType === 'GIF';
  const isVideo  = item.mediaType === 'VIDEO';
  const isPDF    = item.mediaType === 'PDF';
  const isAudio  = item.mediaType === 'AUDIO' || item.mediaType === 'VOICE';
  const isDeleted = item.deletedAt !== null;

  async function saveName() {
    const name = displayName.trim();
    if (!name) return;
    setSaving(true);
    const r = await fetch(`/api/media/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: name }),
    });
    if (r.ok) {
      const d = await r.json() as { media: MediaRecord };
      onUpdated(d.media);
      setEditingName(false);
    } else {
      setActionMsg('Save failed.');
    }
    setSaving(false);
  }

  async function replaceFile(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    setActionMsg('Replacing…');
    const r = await fetch(`/api/media/${item.id}/replace`, { method: 'POST', body: fd });
    if (r.ok) {
      const d = await r.json() as { media: MediaRecord };
      onUpdated(d.media);
      setActionMsg('File replaced.');
    } else {
      const d = await r.json().catch(() => ({})) as { error?: string };
      setActionMsg(d.error ?? 'Replace failed.');
    }
    if (replaceRef.current) replaceRef.current.value = '';
  }

  async function archive() {
    if (!confirm('Archive this file? It can be restored later.')) return;
    setActionMsg('Archiving…');
    const r = await fetch(`/api/media/${item.id}`, { method: 'DELETE' });
    if (r.ok) {
      onDeleted();
    } else {
      const d = await r.json().catch(() => ({})) as { error?: string; referenceCount?: number };
      if (d.error === 'REFERENCED') {
        setActionMsg(`Cannot archive: ${d.referenceCount ?? 0} reference(s) still active.`);
      } else {
        setActionMsg('Archive failed.');
      }
    }
  }

  async function restore() {
    setActionMsg('Restoring…');
    const r = await fetch(`/api/media/${item.id}/restore`, { method: 'POST' });
    if (r.ok) {
      const d = await r.json() as { media: MediaRecord };
      onUpdated(d.media);
      setActionMsg('Restored.');
    } else {
      setActionMsg(r.status === 403 ? 'Permission denied (SUPER_ADMIN only).' : 'Restore failed.');
    }
  }

  async function permanentDelete() {
    if (!confirm('Permanently delete this file? This CANNOT be undone.')) return;
    setActionMsg('Deleting…');
    const r = await fetch(`/api/media/${item.id}/permanent`, { method: 'DELETE' });
    if (r.ok) {
      onDeleted();
    } else if (r.status === 403) {
      setActionMsg('Permission denied (SUPER_ADMIN only).');
    } else {
      const d = await r.json().catch(() => ({})) as { error?: string };
      setActionMsg(d.error ?? 'Permanent delete failed.');
    }
  }

  return (
    <div className="rounded-lg border bg-card flex flex-col overflow-hidden" style={{ maxHeight: 'calc(100vh - 180px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted flex-shrink-0">
        <span className="text-sm font-semibold text-foreground truncate flex-1 min-w-0 mr-2">
          {item.displayName}
        </span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground flex-shrink-0">
          <X size={16} />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">

        {/* Preview */}
        <div className="rounded-md bg-muted border flex items-center justify-center overflow-hidden" style={{ minHeight: 140, maxHeight: 240 }}>
          {isImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/media/${item.id}/file`}
              alt={item.displayName}
              className="max-w-full max-h-60 object-contain"
            />
          )}
          {isVideo && (
            <video
              src={`/api/media/${item.id}/file`}
              controls
              className="max-w-full max-h-60"
            />
          )}
          {isAudio && (
            <audio src={`/api/media/${item.id}/file`} controls className="w-full mx-2" />
          )}
          {isPDF && (
            <iframe
              src={`/api/media/${item.id}/file`}
              title={item.displayName}
              className="w-full"
              style={{ height: 240 }}
            />
          )}
          {!isImage && !isVideo && !isAudio && !isPDF && (
            <div className="text-muted-foreground text-sm py-6">{item.mediaType} — no preview</div>
          )}
        </div>

        {/* Display name */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Display Name</Label>
          {editingName ? (
            <div className="flex gap-1">
              <Input
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void saveName(); if (e.key === 'Escape') { setEditingName(false); setDisplayName(item.displayName); } }}
                className="h-7 text-sm flex-1"
                autoFocus
              />
              <Button size="sm" onClick={saveName} disabled={saving}>Save</Button>
              <Button size="sm" variant="outline" onClick={() => { setEditingName(false); setDisplayName(item.displayName); }}>✕</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-foreground flex-1">{item.displayName}</span>
              {!isDeleted && (
                <button
                  onClick={() => setEditingName(true)}
                  className="text-xs text-muted-foreground hover:text-foreground flex-shrink-0"
                >
                  Edit
                </button>
              )}
            </div>
          )}
        </div>

        {/* Metadata table */}
        <div className="space-y-1.5 text-xs">
          {[
            ['Filename',    item.originalFilename],
            ['Type',        item.mediaType],
            ['MIME',        item.mimeType],
            ['Extension',   `.${item.extension}`],
            ['Size',        formatBytes(item.fileSize)],
            item.width && item.height ? ['Dimensions', `${item.width} × ${item.height}px`] : null,
            item.duration  ? ['Duration', `${item.duration}s`] : null,
            ['Uploaded',    fmtDate(item.createdAt)],
            ['Usage',       `${item.usageCount}×`],
            ['Downloads',   `${item.downloadCount}×`],
            ['References',  String(item.referenceCount)],
            item.lastUsedAt ? ['Last used', fmtDate(item.lastUsedAt)] : null,
            isDeleted ? ['Archived', fmtDate(item.deletedAt)] : null,
          ]
            .filter((row): row is [string, string] => row !== null)
            .map(([label, value]) => (
              <div key={label} className="flex justify-between gap-2">
                <span className="text-muted-foreground flex-shrink-0">{label}</span>
                <span className="text-foreground text-right truncate max-w-[60%]" title={String(value)}>{value}</span>
              </div>
            ))
          }
        </div>

        {/* Image URL — shown for image/GIF media */}
        {isImage && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Image URL</Label>
            {[
              {
                label: 'ERP Public URL',
                url: `https://erp.apidemo.club/api/public/media/${item.id}`,
              },
              {
                label: 'Website URL',
                url: `https://apidemo.club/api/public/image-proxy?url=${encodeURIComponent(`https://erp.apidemo.club/api/public/media/${item.id}`)}`,
              },
            ].map(({ label, url }) => (
              <div key={label} className="space-y-0.5">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="flex items-center gap-1">
                  <input
                    readOnly
                    value={url}
                    className="flex-1 h-6 text-xs bg-background border rounded px-1.5 text-muted-foreground min-w-0"
                  />
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(url);
                      setActionMsg(`已复制 ${label}`);
                      setTimeout(() => setActionMsg(''), 1500);
                    }}
                    className="flex-shrink-0 h-6 px-2 text-xs rounded border bg-card hover:bg-muted text-muted-foreground"
                  >
                    Copy
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action feedback */}
        {actionMsg && (
          <p className="text-xs text-muted-foreground bg-muted rounded p-2 border">{actionMsg}</p>
        )}
      </div>

      {/* Action buttons */}
      <div className="border-t p-3 space-y-2 flex-shrink-0 bg-card">
        {/* Download — always available */}
        <a
          href={`/api/media/${item.id}/file?download=1`}
          className="flex items-center gap-2 w-full rounded px-3 py-1.5 text-sm text-foreground hover:bg-muted border transition-colors"
        >
          <Download size={14} />
          Download
        </a>

        {!isDeleted && (
          <>
            {/* Replace */}
            <button
              onClick={() => replaceRef.current?.click()}
              className="flex items-center gap-2 w-full rounded px-3 py-1.5 text-sm text-foreground hover:bg-muted border transition-colors"
            >
              <RefreshCw size={14} />
              Replace File
            </button>
            <input
              ref={replaceRef}
              type="file"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) void replaceFile(file);
              }}
            />

            {/* Archive (soft delete) */}
            <button
              onClick={archive}
              className="flex items-center gap-2 w-full rounded px-3 py-1.5 text-sm text-orange-700 hover:bg-orange-50 border border-orange-200 transition-colors"
            >
              <Archive size={14} />
              Archive
            </button>
          </>
        )}

        {isDeleted && (
          <>
            {/* Restore */}
            <button
              onClick={restore}
              className="flex items-center gap-2 w-full rounded px-3 py-1.5 text-sm text-green-700 hover:bg-green-50 border border-green-200 transition-colors"
            >
              <RotateCcw size={14} />
              Restore
            </button>

            {/* Permanent delete — SUPER_ADMIN only; 403 is handled gracefully */}
            <button
              onClick={permanentDelete}
              className="flex items-center gap-2 w-full rounded px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 border border-red-200 transition-colors"
            >
              <Trash2 size={14} />
              Permanent Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}
