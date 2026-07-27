'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TagBadge } from '@/components/livechat/TagBadge';
import type { CustomerTag } from '@/lib/types';

export default function TagManagerPage() {
  const [tags, setTags] = useState<CustomerTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Add form
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6B7280');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [saving, setSaving] = useState(false);

  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [movingId, setMovingId] = useState<number | null>(null);

  const loadTags = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/livechat/tags?include_inactive=1');
      if (r.ok) setTags(await r.json() as CustomerTag[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadTags(); }, [loadTags]);

  async function handleAdd() {
    setAddError('');
    if (!newName.trim()) { setAddError('Tag name is required.'); return; }
    setAdding(true);
    try {
      const r = await fetch('/api/livechat/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      });
      if (r.ok) {
        setNewName(''); setNewColor('#6B7280');
        await loadTags();
      } else {
        const d = await r.json() as { error?: string };
        setAddError(d.error ?? 'Failed to add tag');
      }
    } finally { setAdding(false); }
  }

  async function handleSave(id: number) {
    setSaving(true);
    try {
      const r = await fetch(`/api/livechat/tags/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), color: editColor }),
      });
      if (r.ok) { setEditingId(null); await loadTags(); }
    } finally { setSaving(false); }
  }

  async function handleDelete(id: number, name: string) {
    if (!window.confirm(`Delete tag "${name}"? This will remove it from all users.`)) return;
    const r = await fetch(`/api/livechat/tags/${id}`, { method: 'DELETE' });
    if (r.ok) setTags((prev) => prev.filter((t) => t.id !== id));
  }

  async function handleToggleActive(tag: CustomerTag) {
    setTogglingId(tag.id);
    try {
      const r = await fetch(`/api/livechat/tags/${tag.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !tag.is_active }),
      });
      if (r.ok) await loadTags();
    } finally { setTogglingId(null); }
  }

  async function handleMove(tag: CustomerTag, direction: 'up' | 'down') {
    setMovingId(tag.id);
    const sorted = [...tags].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    const idx = sorted.findIndex((t) => t.id === tag.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) { setMovingId(null); return; }
    const swapTag = sorted[swapIdx];
    try {
      await Promise.all([
        fetch(`/api/livechat/tags/${tag.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: swapTag.sort_order }),
        }),
        fetch(`/api/livechat/tags/${swapTag.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: tag.sort_order }),
        }),
      ]);
      await loadTags();
    } finally { setMovingId(null); }
  }

  const filtered = tags.filter((t) =>
    !search.trim() || t.name.toLowerCase().includes(search.toLowerCase())
  );
  const sorted = [...filtered].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tag Management</h1>
        <span className="text-sm text-gray-400">{tags.length} total · {tags.filter(t => t.is_active).length} active</span>
      </div>

      {/* Add form */}
      <div className="rounded-lg border bg-gray-50 p-4 space-y-3">
        <h2 className="font-semibold text-sm">Add New Tag</h2>
        <div className="flex gap-2 items-center">
          <Input
            placeholder="Tag name (unique)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1"
            onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
          />
          <div className="flex items-center gap-1">
            <label className="text-xs text-gray-600">Color</label>
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="h-8 w-10 cursor-pointer rounded border border-gray-300 p-0.5"
            />
          </div>
          <Button onClick={() => void handleAdd()} disabled={adding} size="sm">
            {adding ? 'Adding…' : 'Add'}
          </Button>
        </div>
        {newName.trim() && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Preview:</span>
            <TagBadge tag={{ id: 0, name: newName, color: newColor, sort_order: 0, is_active: true, created_at: '', updated_at: '' }} />
          </div>
        )}
        {addError && <p className="text-xs text-red-500">{addError}</p>}
      </div>

      {/* Search */}
      <Input
        placeholder="Search tags…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />

      {/* Tag list */}
      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : sorted.length === 0 ? (
        <p className="text-gray-400 text-sm">{search ? 'No matching tags.' : 'No tags yet. Add one above.'}</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((tag, idx) =>
            editingId === tag.id ? (
              <div key={tag.id} className="flex items-center gap-2 rounded-lg border bg-white p-3 shadow-sm">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 h-8 text-sm"
                />
                <input
                  type="color"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  className="h-8 w-10 cursor-pointer rounded border border-gray-300 p-0.5"
                />
                <TagBadge tag={{ ...tag, name: editName || tag.name, color: editColor }} />
                <Button size="sm" className="h-7 text-xs" onClick={() => void handleSave(tag.id)} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingId(null)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div
                key={tag.id}
                className={`flex items-center gap-3 rounded-lg border bg-white p-3 shadow-sm ${!tag.is_active ? 'opacity-50' : ''}`}
              >
                {/* Sort arrows */}
                <div className="flex flex-col gap-0.5">
                  <button
                    className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none text-xs"
                    disabled={idx === 0 || movingId !== null}
                    onClick={() => void handleMove(tag, 'up')}
                    title="Move up"
                  >▲</button>
                  <button
                    className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none text-xs"
                    disabled={idx === sorted.length - 1 || movingId !== null}
                    onClick={() => void handleMove(tag, 'down')}
                    title="Move down"
                  >▼</button>
                </div>

                <TagBadge tag={tag} />
                <span className="flex-1 text-sm font-medium">{tag.name}</span>
                <span className="text-xs text-gray-400 font-mono">{tag.color}</span>

                {!tag.is_active && (
                  <span className="text-xs text-gray-400 border rounded px-1.5 py-0.5">Disabled</span>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  className={`h-7 text-xs ${tag.is_active ? 'text-amber-600 border-amber-300 hover:bg-amber-50' : 'text-green-600 border-green-300 hover:bg-green-50'}`}
                  disabled={togglingId === tag.id}
                  onClick={() => void handleToggleActive(tag)}
                >
                  {togglingId === tag.id ? '…' : tag.is_active ? 'Disable' : 'Enable'}
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => { setEditingId(tag.id); setEditName(tag.name); setEditColor(tag.color); }}>
                  Edit
                </Button>
                <Button size="sm" variant="destructive" className="h-7 text-xs"
                  onClick={() => void handleDelete(tag.id, tag.name)}>
                  Delete
                </Button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
