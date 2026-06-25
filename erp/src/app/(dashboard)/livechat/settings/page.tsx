'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { QuickReply, QuickReplyCategory } from '@/lib/types';

export default function LiveChatSettingsPage() {
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [categories, setCategories] = useState<QuickReplyCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<number | null>(null);

  // Add form state
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newCategoryId, setNewCategoryId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/livechat/quick-replies');
      if (res.ok) {
        const data = (await res.json()) as { replies: QuickReply[]; categories: QuickReplyCategory[] };
        setReplies(data.replies);
        setCategories(data.categories);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleToggleFavorite = async (reply: QuickReply) => {
    const newFav = !reply.is_favorite;
    setReplies((prev) =>
      prev.map((r) => (r.id === reply.id ? { ...r, is_favorite: newFav } : r))
    );
    await fetch(`/api/livechat/quick-replies/${reply.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_favorite: newFav }),
    });
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this quick reply?')) return;
    const res = await fetch(`/api/livechat/quick-replies/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setReplies((prev) => prev.filter((r) => r.id !== id));
    }
  };

  const handleAdd = async () => {
    setAddError('');
    if (!newTitle.trim() || !newBody.trim()) {
      setAddError('Title and body are required.');
      return;
    }
    setAdding(true);
    try {
      const res = await fetch('/api/livechat/quick-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          body: newBody.trim(),
          category_id: newCategoryId,
          sort_order: 0,
        }),
      });
      if (res.ok) {
        setNewTitle('');
        setNewBody('');
        setNewCategoryId(null);
        await loadData();
      } else {
        const d = (await res.json()) as { error?: string };
        setAddError(d.error ?? 'Failed to add reply');
      }
    } finally {
      setAdding(false);
    }
  };

  const filtered = replies.filter((r) => {
    const matchesSearch =
      search === '' ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.body.toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      activeCategory === null || r.category_id === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Quick Replies Settings</h1>

      {/* Search */}
      <Input
        placeholder="Search by title or body…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {/* Category tabs */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setActiveCategory(null)}
          className={`px-3 py-1 rounded-full text-sm border transition-colors ${
            activeCategory === null
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-3 py-1 rounded-full text-sm border transition-colors ${
              activeCategory === cat.id
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {cat.name}
          </button>
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
            <div
              key={reply.id}
              className="flex items-start gap-3 rounded-lg border bg-white p-3 shadow-sm"
            >
              {/* Favorite toggle */}
              <button
                onClick={() => void handleToggleFavorite(reply)}
                className={`mt-0.5 text-xl leading-none transition-colors ${
                  reply.is_favorite ? 'text-yellow-400' : 'text-gray-300 hover:text-yellow-300'
                }`}
                title={reply.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                ★
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  {reply.category_name && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                      {reply.category_name}
                    </span>
                  )}
                  <span className="font-medium text-sm">{reply.title}</span>
                </div>
                <p className="text-xs text-gray-500 truncate">{reply.body}</p>
              </div>

              {/* Delete */}
              <button
                onClick={() => void handleDelete(reply.id)}
                className="text-red-400 hover:text-red-600 text-sm font-medium shrink-0"
                title="Delete"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add new reply form */}
      <div className="rounded-lg border bg-gray-50 p-4 space-y-3">
        <h2 className="font-semibold text-sm">Add New Quick Reply</h2>

        <div className="flex gap-2 items-center">
          <label className="text-xs text-gray-600 w-20 shrink-0">Category</label>
          <select
            value={newCategoryId ?? ''}
            onChange={(e) => setNewCategoryId(e.target.value ? Number(e.target.value) : null)}
            className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value="">None</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2 items-center">
          <label className="text-xs text-gray-600 w-20 shrink-0">Title</label>
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="e.g. Please wait"
            className="flex-1"
          />
        </div>

        <div className="flex gap-2 items-start">
          <label className="text-xs text-gray-600 w-20 shrink-0 mt-2">Body</label>
          <textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="e.g. Please wait a moment."
            rows={3}
            className="flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        {addError && <p className="text-xs text-red-500">{addError}</p>}

        <Button onClick={() => void handleAdd()} disabled={adding} size="sm">
          {adding ? 'Adding…' : 'Add Reply'}
        </Button>
      </div>
    </div>
  );
}
