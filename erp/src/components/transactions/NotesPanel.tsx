'use client';

import { useState, useEffect, useCallback, useRef, useId } from 'react';
import WorkspaceSection from './WorkspaceSection';
import { timeAgo } from './types';

const MAX_CHARS = 2000;

// ── Types ────────────────────────────────────────────────────────────────────

interface Note {
  id: number;
  admin_id: number;
  content: string;
  created_at: string;
  updated_at: string;
}

// ── Toast ─────────────────────────────────────────────────────────────────────

interface ToastMessage {
  id: number;
  message: string;
  kind: 'success' | 'error';
}

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          role="status"
          aria-live="polite"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg text-sm pointer-events-auto transition-opacity ${
            t.kind === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          <span>{t.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss notification"
            className="text-white/70 hover:text-white leading-none ml-1 text-base"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

// ── ConfirmDialog ─────────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-white rounded-lg shadow-xl p-5 max-w-sm w-full mx-4">
        <p id={titleId} className="text-sm text-gray-700 mb-5">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 text-sm rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CharCounter ───────────────────────────────────────────────────────────────

function CharCounter({ current }: { current: number }) {
  const remaining = MAX_CHARS - current;
  const isWarning = remaining < 200;
  return (
    <span className={`text-xs tabular-nums ${isWarning ? 'text-red-500' : 'text-gray-400'}`}>
      {remaining}/{MAX_CHARS}
    </span>
  );
}

// ── InlineNoteEditor ──────────────────────────────────────────────────────────

interface InlineNoteEditorProps {
  initialValue: string;
  onSave: (content: string) => void;
  onCancel: () => void;
  saving: boolean;
}

function InlineNoteEditor({ initialValue, onSave, onCancel, saving }: InlineNoteEditorProps) {
  const [value, setValue] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const trimmed = value.trim();
  const canSave =
    trimmed.length > 0 &&
    trimmed.length <= MAX_CHARS &&
    trimmed !== initialValue.trim();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (canSave && !saving) onSave(trimmed);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="space-y-2">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={MAX_CHARS}
        rows={3}
        disabled={saving}
        aria-label="Edit note content"
        className="w-full text-sm rounded border border-blue-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none disabled:opacity-60"
      />
      <div className="flex items-center justify-between">
        <CharCounter current={value.length} />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            Esc / Cancel
          </button>
          <button
            type="button"
            onClick={() => { if (canSave && !saving) onSave(trimmed); }}
            disabled={!canSave || saving}
            className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            {saving ? 'Saving…' : 'Save (Ctrl+↵)'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── NoteCard ──────────────────────────────────────────────────────────────────

interface NoteCardProps {
  note: Note;
  meId: number | null;
  editingId: number | null;
  savingEditId: number | null;
  onStartEdit: (id: number) => void;
  onSaveEdit: (id: number, content: string) => void;
  onCancelEdit: () => void;
  onRequestDelete: (id: number) => void;
}

function NoteCard({
  note,
  meId,
  editingId,
  savingEditId,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onRequestDelete,
}: NoteCardProps) {
  const isEditing = editingId === note.id;
  const isOwn = meId !== null && note.admin_id === meId;
  const wasEdited = note.updated_at !== note.created_at;

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3">
      {isEditing ? (
        <InlineNoteEditor
          initialValue={note.content}
          onSave={content => onSaveEdit(note.id, content)}
          onCancel={onCancelEdit}
          saving={savingEditId === note.id}
        />
      ) : (
        <>
          <div className="flex items-start gap-2">
            <p className="flex-1 text-sm text-gray-800 whitespace-pre-wrap break-words leading-relaxed">
              {note.content}
            </p>
            {isOwn && (
              <div className="flex items-center gap-1 shrink-0 pt-0.5">
                <button
                  type="button"
                  onClick={() => onStartEdit(note.id)}
                  title="Edit note"
                  aria-label="Edit note"
                  className="text-gray-400 hover:text-blue-600 transition-colors rounded p-0.5 text-sm leading-none"
                >
                  ✎
                </button>
                <button
                  type="button"
                  onClick={() => onRequestDelete(note.id)}
                  title="Delete note"
                  aria-label="Delete note"
                  className="text-gray-400 hover:text-red-600 transition-colors rounded p-0.5 text-sm leading-none"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
            <span>Admin #{note.admin_id}</span>
            <span>·</span>
            <span title={note.created_at}>{timeAgo(note.created_at)}</span>
            {wasEdited && <span className="italic">(edited)</span>}
          </div>
        </>
      )}
    </div>
  );
}

// ── NoteEditor (new note form) ────────────────────────────────────────────────

interface NoteEditorProps {
  onSubmit: (content: string) => void;
  submitting: boolean;
  editorRef: React.RefObject<HTMLTextAreaElement | null>;
}

function NoteEditor({ onSubmit, submitting, editorRef }: NoteEditorProps) {
  const [value, setValue] = useState('');

  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= MAX_CHARS;

  const commit = useCallback(() => {
    if (canSubmit && !submitting) {
      onSubmit(trimmed);
      setValue('');
    }
  }, [canSubmit, submitting, onSubmit, trimmed]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
  };

  return (
    <div className="space-y-2 pt-3 border-t border-gray-100 mt-1">
      <textarea
        ref={editorRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add an internal note… (Ctrl+Enter to submit)"
        maxLength={MAX_CHARS}
        rows={3}
        disabled={submitting}
        aria-label="New internal note"
        className="w-full text-sm rounded border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none bg-white placeholder:text-gray-400 disabled:opacity-60"
      />
      <div className="flex items-center justify-between">
        <CharCounter current={value.length} />
        <button
          type="button"
          onClick={commit}
          disabled={!canSubmit || submitting}
          className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          {submitting ? 'Adding…' : 'Add Note (Ctrl+↵)'}
        </button>
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function NotesSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[0, 1].map(i => (
        <div key={i} className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-3/4" />
          <div className="h-3 bg-gray-100 rounded w-1/2" />
          <div className="h-3 bg-gray-100 rounded w-1/3" />
        </div>
      ))}
    </div>
  );
}

// ── NotesPanel ────────────────────────────────────────────────────────────────

export interface NotesPanelProps {
  type: string;
  id: number;
}

let toastSeq = 0;

export default function NotesPanel({ type, id }: NotesPanelProps) {
  const [notes,        setNotes]        = useState<Note[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [noPermission, setNoPermission] = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [editingId,    setEditingId]    = useState<number | null>(null);
  const [savingEditId, setSavingEditId] = useState<number | null>(null);
  const [confirmId,    setConfirmId]    = useState<number | null>(null);
  const [toasts,       setToasts]       = useState<ToastMessage[]>([]);
  const [meId,         setMeId]         = useState<number | null>(null);

  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then((d: { sub: number } | null) => { if (d) setMeId(d.sub); })
      .catch(() => {});
  }, []);

  const addToast = useCallback((message: string, kind: 'success' | 'error') => {
    const toastId = ++toastSeq;
    setToasts(prev => [...prev, { id: toastId, message, kind }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== toastId)), 3000);
  }, []);

  const dismissToast = useCallback((toastId: number) => {
    setToasts(prev => prev.filter(t => t.id !== toastId));
  }, []);

  const loadNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/transactions/${type}/${id}/notes`);
      if (res.status === 401 || res.status === 403) {
        setNoPermission(true);
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json() as { notes: Note[] };
      setNotes(data.notes);
    } catch {
      addToast('Failed to load notes', 'error');
    } finally {
      setLoading(false);
    }
  }, [type, id, addToast]);

  useEffect(() => {
    setLoading(true);
    setNotes([]);
    setNoPermission(false);
    setEditingId(null);
    void loadNotes();
  }, [loadNotes]);

  // N → focus new-note editor (only when not already in an input)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'n' && e.key !== 'N') return;
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      editorRef.current?.focus();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  const handleCreate = useCallback(async (content: string) => {
    const tempId = -(Date.now());
    const now = new Date().toISOString();
    const optimistic: Note = {
      id: tempId,
      admin_id: meId ?? 0,
      content,
      created_at: now,
      updated_at: now,
    };
    setNotes(prev => [...prev, optimistic]);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/transactions/${type}/${id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (res.status === 401 || res.status === 403) {
        setNotes(prev => prev.filter(n => n.id !== tempId));
        addToast('No permission to create notes', 'error');
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json() as { note: Note };
      setNotes(prev => prev.map(n => n.id === tempId ? data.note : n));
      addToast('Note added', 'success');
    } catch {
      setNotes(prev => prev.filter(n => n.id !== tempId));
      addToast('Failed to add note', 'error');
    } finally {
      setSubmitting(false);
    }
  }, [type, id, meId, addToast]);

  const handleSaveEdit = useCallback(async (noteId: number, content: string) => {
    const snapshot = notes;
    setSavingEditId(noteId);
    setEditingId(null);
    setNotes(prev =>
      prev.map(n =>
        n.id === noteId
          ? { ...n, content, updated_at: new Date().toISOString() }
          : n
      )
    );

    try {
      const res = await fetch(`/api/transactions/${type}/${id}/notes/${noteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (res.status === 401 || res.status === 403) {
        setNotes(snapshot);
        addToast('No permission to edit notes', 'error');
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json() as { note: Note };
      setNotes(prev => prev.map(n => n.id === noteId ? data.note : n));
      addToast('Note updated', 'success');
    } catch {
      setNotes(snapshot);
      addToast('Failed to update note', 'error');
    } finally {
      setSavingEditId(null);
    }
  }, [type, id, notes, addToast]);

  const handleConfirmDelete = useCallback(async () => {
    const noteId = confirmId;
    if (noteId === null) return;
    setConfirmId(null);

    const snapshot = notes;
    setNotes(prev => prev.filter(n => n.id !== noteId));

    try {
      const res = await fetch(`/api/transactions/${type}/${id}/notes/${noteId}`, {
        method: 'DELETE',
      });
      if (res.status === 401 || res.status === 403) {
        setNotes(snapshot);
        addToast('No permission to delete notes', 'error');
        return;
      }
      if (!res.ok) throw new Error();
      addToast('Note deleted', 'success');
    } catch {
      setNotes(snapshot);
      addToast('Failed to delete note', 'error');
    }
  }, [type, id, notes, confirmId, addToast]);

  if (noPermission) return null;

  const headerActions = !loading ? (
    <button
      type="button"
      onClick={() => editorRef.current?.focus()}
      title="Focus new note editor (N)"
      className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
    >
      + Add (N)
    </button>
  ) : undefined;

  return (
    <>
      <WorkspaceSection
        title="Internal Notes"
        defaultOpen
        badge={!loading && notes.length > 0 ? String(notes.length) : undefined}
        headerActions={headerActions}
      >
        {loading ? (
          <NotesSkeleton />
        ) : (
          <>
            {notes.length === 0 && (
              <p className="text-sm text-gray-400 py-3 text-center">
                No internal notes yet
              </p>
            )}

            {notes.length > 0 && (
              <div className="space-y-2">
                {notes.map(note => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    meId={meId}
                    editingId={editingId}
                    savingEditId={savingEditId}
                    onStartEdit={noteId => setEditingId(noteId)}
                    onSaveEdit={handleSaveEdit}
                    onCancelEdit={() => setEditingId(null)}
                    onRequestDelete={noteId => setConfirmId(noteId)}
                  />
                ))}
              </div>
            )}

            <NoteEditor
              onSubmit={handleCreate}
              submitting={submitting}
              editorRef={editorRef}
            />
          </>
        )}
      </WorkspaceSection>

      {confirmId !== null && (
        <ConfirmDialog
          message="Delete this note? This cannot be undone."
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmId(null)}
        />
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
