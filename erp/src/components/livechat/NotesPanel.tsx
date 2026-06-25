'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import type { SessionNote } from '@/lib/types';

/** Render a small subset of markdown: **bold**, *italic*, `code`, and line breaks */
function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-yellow-100 rounded px-0.5 text-xs font-mono">$1</code>')
    .replace(/\n/g, '<br />');
}

export function NotesPanel({ sessionId }: { sessionId: number }) {
  const [notes, setNotes]       = useState<SessionNote[]>([]);
  const [body, setBody]         = useState('');
  const [saving, setSaving]     = useState(false);
  const [loading, setLoading]   = useState(false);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/livechat/sessions/${sessionId}/notes`);
    const d = await r.json();
    setNotes(d.notes ?? []);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => { void loadNotes(); }, [loadNotes]);

  async function handleAdd() {
    if (!body.trim() || saving) return;
    setSaving(true);
    const r = await fetch(`/api/livechat/sessions/${sessionId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    if (r.ok) {
      const d = await r.json();
      setNotes((prev) => [...prev, d.note as SessionNote]);
      setBody('');
    }
    setSaving(false);
  }

  async function handleDelete(id: number) {
    await fetch(`/api/livechat/sessions/${sessionId}/notes/${id}`, { method: 'DELETE' });
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  return (
    <div className="border-t bg-yellow-50">
      <div className="px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-yellow-700 mb-2">
          📝 Internal Notes
        </p>

        {loading && <p className="text-xs text-gray-400">Loading…</p>}

        <div className="space-y-2 max-h-48 overflow-y-auto mb-2">
          {notes.map((n) => (
            <div
              key={n.id}
              className="rounded border border-yellow-200 bg-yellow-100 px-3 py-2 text-xs shadow-sm"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-yellow-800">@{n.author}</span>
                <div className="flex items-center gap-1 text-yellow-600">
                  <span>{new Date(n.created_at).toLocaleDateString()}</span>
                  <button
                    onClick={() => handleDelete(n.id)}
                    className="ml-1 hover:text-red-500 text-base leading-none"
                    title="Delete note"
                    aria-label="Delete note"
                  >
                    ×
                  </button>
                </div>
              </div>
              {/* eslint-disable-next-line react/no-danger */}
              <div
                className="text-yellow-900 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(n.body) }}
              />
            </div>
          ))}
          {notes.length === 0 && !loading && (
            <p className="text-xs text-yellow-600 italic">No notes yet. Add one below.</p>
          )}
        </div>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a note… (supports **bold**, *italic*, `code`)"
          className="w-full rounded border border-yellow-300 bg-white px-2 py-1.5 text-xs resize-none h-16 focus:outline-none focus:ring-1 focus:ring-yellow-400"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void handleAdd();
          }}
        />
        <Button
          size="sm"
          variant="outline"
          className="mt-1 w-full text-xs border-yellow-300 hover:bg-yellow-100"
          disabled={saving || !body.trim()}
          onClick={handleAdd}
        >
          {saving ? 'Saving…' : 'Add Note (Ctrl+Enter)'}
        </Button>
      </div>
    </div>
  );
}
