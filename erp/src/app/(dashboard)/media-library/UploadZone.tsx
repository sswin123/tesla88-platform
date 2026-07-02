'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface UploadEntry {
  id: string;
  filename: string;
  status: 'uploading' | 'done' | 'duplicate' | 'error';
  error?: string;
}

const STATUS_LABEL: Record<UploadEntry['status'], string> = {
  uploading: '⏳',
  done:      '✓',
  duplicate: '⊙',
  error:     '✗',
};

const STATUS_COLOR: Record<UploadEntry['status'], string> = {
  uploading: 'text-gray-400',
  done:      'text-green-600',
  duplicate: 'text-blue-500',
  error:     'text-red-600',
};

export function UploadZone({ onUploadComplete }: { onUploadComplete: () => void }) {
  const [dragging, setDragging] = useState(false);
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = useCallback(async (files: File[]) => {
    const batch: UploadEntry[] = files.map(f => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      filename: f.name,
      status: 'uploading',
    }));
    setEntries(prev => [...batch, ...prev]);

    await Promise.allSettled(
      files.map(async (file, idx) => {
        const entryId = batch[idx].id;
        const fd = new FormData();
        fd.append('file', file);
        try {
          const r = await fetch('/api/media/upload', { method: 'POST', body: fd });
          const body = await r.json().catch(() => ({})) as { isDuplicate?: boolean; error?: string };
          if (r.ok) {
            setEntries(prev => prev.map(e =>
              e.id === entryId
                ? { ...e, status: body.isDuplicate ? 'duplicate' : 'done' }
                : e
            ));
          } else {
            setEntries(prev => prev.map(e =>
              e.id === entryId
                ? { ...e, status: 'error', error: body.error ?? 'Upload failed' }
                : e
            ));
          }
        } catch {
          setEntries(prev => prev.map(e =>
            e.id === entryId
              ? { ...e, status: 'error', error: 'Network error' }
              : e
          ));
        }
      })
    );

    onUploadComplete();
  }, [onUploadComplete]);

  // Ctrl+V paste from clipboard
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (files && files.length > 0) void uploadFiles(Array.from(files));
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [uploadFiles]);

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault();
          setDragging(false);
          const files = Array.from(e.dataTransfer.files);
          if (files.length > 0) void uploadFiles(files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 cursor-pointer transition-colors select-none ${
          dragging
            ? 'border-gray-900 bg-gray-50'
            : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
        }`}
      >
        <p className="text-sm font-medium text-gray-600">
          Drag & drop files here, click to browse, or paste (Ctrl+V)
        </p>
        <p className="text-xs text-gray-400 mt-1">Max 50 MB per file · Multiple files supported</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={e => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) void uploadFiles(files);
            e.target.value = '';
          }}
        />
      </div>

      {/* Per-file progress list */}
      {entries.length > 0 && (
        <div className="rounded-lg border divide-y max-h-48 overflow-y-auto bg-white">
          {entries.map(entry => (
            <div key={entry.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className={`w-4 text-center font-bold ${STATUS_COLOR[entry.status]}`}>
                {STATUS_LABEL[entry.status]}
              </span>
              <span className="flex-1 truncate text-gray-700">{entry.filename}</span>
              {entry.status === 'duplicate' && (
                <span className="text-xs text-blue-500 flex-shrink-0">Already exists</span>
              )}
              {entry.status === 'error' && (
                <span className="text-xs text-red-500 flex-shrink-0">{entry.error}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
