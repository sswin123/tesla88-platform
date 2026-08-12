'use client';

import { useRef, useState } from 'react';

export function ImageUploadField({ label, mediaId, previewUrl, onUpload, onRemove, hint }: {
  label: string;
  mediaId?: number | null;
  previewUrl?: string | null;
  onUpload: (mediaId: number, url: string) => void;
  onRemove: () => void;
  hint?: React.ReactNode;
}) {
  const inputRef   = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');

  const displayUrl = mediaId ? `/api/public/media/${mediaId}` : (previewUrl ?? undefined);

  async function handleFile(file: File) {
    setUploading(true); setErr('');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('display_name', file.name);
    try {
      const res  = await fetch('/api/media/upload', { method: 'POST', body: fd });
      const json = await res.json() as { ok?: boolean; media?: { id: number }; error?: string };
      if (!res.ok || !json.media?.id) {
        setErr(json.error ? `${res.status} ${json.error}` : `${res.status} Upload failed`);
        return;
      }
      onUpload(json.media.id, `/api/public/media/${json.media.id}`);
    } catch (e) { setErr(String(e)); }
    finally { setUploading(false); }
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-muted-foreground">{label}</label>
      {displayUrl ? (
        <div className="relative group">
          <img src={displayUrl} alt="logo" className="h-14 object-contain rounded-lg bg-gray-800 px-2 py-1" />
          <div className="absolute inset-0 hidden group-hover:flex items-center justify-center gap-2 rounded-lg bg-black/60">
            <button type="button" onClick={() => inputRef.current?.click()}
              className="text-xs px-2 py-1 bg-white/20 hover:bg-white/30 rounded text-white">Replace</button>
            <button type="button" onClick={onRemove}
              className="text-xs px-2 py-1 bg-red-500/80 hover:bg-red-500 rounded text-white">Remove</button>
          </div>
        </div>
      ) : (
        <button type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full flex flex-col items-center justify-center gap-1 h-16 rounded-lg border-2 border-dashed border-gray-600 hover:border-violet-500 bg-gray-800 transition-colors text-muted-foreground hover:text-violet-400 disabled:opacity-50"
        >
          {uploading ? <span className="text-xs">Uploading…</span> : (
            <>
              <span className="text-lg">📁</span>
              <span className="text-xs">Click to upload</span>
            </>
          )}
        </button>
      )}
      {err && <p className="text-xs text-red-400">{err}</p>}
      {hint}
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }} />
    </div>
  );
}
