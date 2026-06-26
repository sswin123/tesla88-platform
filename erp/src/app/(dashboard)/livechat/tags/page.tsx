'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TagBadge } from '@/components/livechat/TagBadge';
import type { CustomerTag } from '@/lib/types';

export default function TagManagerPage() {
  const [tags, setTags] = useState<CustomerTag[]>([]);
  const [loading, setLoading] = useState(true);

  // Add form
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6B7280');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  // Edit state: tagId => { name, color }
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [saving, setSaving] = useState(false);

  const loadTags = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/livechat/tags');
      if (r.ok) {
        const data = await r.json() as CustomerTag[];
        setTags(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTags();
  }, [loadTags]);

  async function handleAdd() {
    setAddError('');
    if (!newName.trim()) {
      setAddError('Tag name is required.');
      return;
    }
    setAdding(true);
    try {
      const r = await fetch('/api/livechat/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      });
      if (r.ok) {
        setNewName('');
        setNewColor('#6B7280');
        await loadTags();
      } else {
        const d = await r.json() as { error?: string };
        setAddError(d.error ?? 'Failed to add tag');
      }
    } finally {
      setAdding(false);
    }
  }

  function startEdit(tag: CustomerTag) {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function handleSave(id: number) {
    setSaving(true);
    try {
      const r = await fetch(`/api/livechat/tags/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), color: editColor }),
      });
      if (r.ok) {
        setEditingId(null);
        await loadTags();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!window.confirm(`Delete tag "${name}"? This will remove it from all users.`)) return;
    const r = await fetch(`/api/livechat/tags/${id}`, { method: 'DELETE' });
    if (r.ok) {
      setTags((prev) => prev.filter((t) => t.id !== id));
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tag Manager</h1>
        <a
          href="/livechat/settings"
          className="text-sm text-blue-600 hover:underline"
        >
          Quick Replies Settings
        </a>
      </div>

      {/* Add tag form */}
      <div className="rounded-lg border bg-gray-50 p-4 space-y-3">
        <h2 className="font-semibold text-sm">Add New Tag</h2>
        <div className="flex gap-2 items-center">
          <Input
            placeholder="Tag name"
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
            <TagBadge tag={{ id: 0, name: newName, color: newColor, created_at: '' }} />
          </div>
        )}
        {addError && <p className="text-xs text-red-500">{addError}</p>}
      </div>

      {/* Tag list */}
      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : tags.length === 0 ? (
        <p className="text-gray-400 text-sm">No tags yet. Add one above.</p>
      ) : (
        <div className="space-y-2">
          {tags.map((tag) =>
            editingId === tag.id ? (
              <div
                key={tag.id}
                className="flex items-center gap-2 rounded-lg border bg-white p-3 shadow-sm"
              >
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
                <TagBadge tag={{ id: tag.id, name: editName || tag.name, color: editColor, created_at: tag.created_at }} />
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => void handleSave(tag.id)}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={cancelEdit}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div
                key={tag.id}
                className="flex items-center gap-3 rounded-lg border bg-white p-3 shadow-sm"
              >
                <TagBadge tag={tag} />
                <span className="flex-1 text-sm font-medium">{tag.name}</span>
                <span className="text-xs text-gray-400 font-mono">{tag.color}</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => startEdit(tag)}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 text-xs"
                  onClick={() => void handleDelete(tag.id, tag.name)}
                >
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
