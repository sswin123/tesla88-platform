'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Globe, Plus, Search, Pencil, Trash2, Copy, ExternalLink,
  ChevronLeft, LayoutTemplate, Palette, Clock, Filter, Eye,
} from 'lucide-react';

type Site = {
  id: number;
  name: string;
  slug: string;
  status: 'draft' | 'published' | 'archived';
  logo_url: string | null;
  template_id: number | null;
  theme_id: number | null;
  created_at: string;
  updated_at: string;
};

const STATUS_OPTIONS = ['all', 'draft', 'published', 'archived'] as const;

export default function PartnerSiteListPage() {
  const [sites, setSites]   = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]  = useState('');
  const [status, setStatus]  = useState<typeof STATUS_OPTIONS[number]>('all');
  const [deleting, setDeleting] = useState<number | null>(null);
  const [duplicating, setDuplicating] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/partner-builder/sites');
      const data = await r.json();
      setSites(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = sites.filter(s => {
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.slug.includes(search.toLowerCase());
    const matchStatus = status === 'all' || s.status === status;
    return matchSearch && matchStatus;
  });

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      const r = await fetch(`/api/partner-builder/sites/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error();
      setMsg({ type: 'ok', text: `"${name}" deleted.` });
      setSites(prev => prev.filter(s => s.id !== id));
    } catch {
      setMsg({ type: 'err', text: 'Failed to delete site.' });
    } finally {
      setDeleting(null);
      setTimeout(() => setMsg(null), 3000);
    }
  }

  async function handleDuplicate(id: number) {
    setDuplicating(id);
    try {
      const r = await fetch(`/api/partner-builder/sites/${id}/duplicate`, { method: 'POST' });
      if (!r.ok) throw new Error();
      const newSite = await r.json();
      setMsg({ type: 'ok', text: `Duplicated as "${newSite.name}".` });
      await load();
    } catch {
      setMsg({ type: 'err', text: 'Failed to duplicate site.' });
    } finally {
      setDuplicating(null);
      setTimeout(() => setMsg(null), 3000);
    }
  }

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      published: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
      draft:     'bg-amber-500/15 text-amber-400 border border-amber-500/30',
      archived:  'bg-zinc-500/15 text-zinc-400 border border-zinc-600/30',
    };
    return map[s] ?? map.draft;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/website-builder/partner-builder" className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-zinc-50">Partner Sites</h1>
          <p className="text-sm text-zinc-400">{sites.length} site{sites.length !== 1 ? 's' : ''} total</p>
        </div>
        <Link
          href="/website-builder/partner-builder/new"
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-violet-900/30"
        >
          <Plus className="w-4 h-4" /> New Site
        </Link>
      </div>

      {/* Toast */}
      {msg && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium ${
          msg.type === 'ok' ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300' : 'bg-red-500/15 border border-red-500/30 text-red-300'
        }`}>
          {msg.text}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by name or slug…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-9 pr-4 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
          />
        </div>
        <div className="flex gap-2">
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-2 rounded-lg text-xs font-medium capitalize transition-colors ${
                status === s
                  ? 'bg-violet-600 text-white'
                  : 'bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Site Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-48 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 border-dashed rounded-xl p-16 text-center">
          <Globe className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <p className="text-zinc-400 font-medium">
            {search || status !== 'all' ? 'No sites match your filters' : 'No partner sites yet'}
          </p>
          {!search && status === 'all' && (
            <Link
              href="/website-builder/partner-builder/new"
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Create First Site
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(site => (
            <div key={site.id} className="group bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl overflow-hidden transition-all hover:shadow-xl hover:shadow-black/30">
              {/* Card Preview Banner */}
              <div className="h-28 bg-gradient-to-br from-violet-900/30 to-indigo-900/30 relative overflow-hidden flex items-center justify-center border-b border-zinc-800">
                <Globe className="w-12 h-12 text-violet-500/30" />
                <div className="absolute top-2 right-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(site.status)}`}>
                    {site.status}
                  </span>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-4 space-y-3">
                <div>
                  <h3 className="font-semibold text-zinc-100 text-sm leading-tight truncate">{site.name}</h3>
                  <p className="text-xs text-zinc-500 mt-0.5 font-mono">/{site.slug}</p>
                </div>

                <div className="flex items-center gap-3 text-xs text-zinc-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(site.updated_at).toLocaleDateString()}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 pt-1 border-t border-zinc-800">
                  <Link
                    href={`/website-builder/partner-builder/${site.id}`}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-violet-600/15 border border-violet-500/30 hover:bg-violet-600/25 text-violet-400 text-xs font-medium transition-colors"
                  >
                    <Pencil className="w-3 h-3" /> Edit
                  </Link>
                  <button
                    onClick={() => handleDuplicate(site.id)}
                    disabled={duplicating === site.id}
                    className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50"
                    title="Duplicate"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  {site.status === 'published' && (
                    <a
                      href={`/p/${site.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
                      title="View live"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button
                    onClick={() => handleDelete(site.id, site.name)}
                    disabled={deleting === site.id}
                    className="p-1.5 rounded-lg hover:bg-red-900/30 text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
