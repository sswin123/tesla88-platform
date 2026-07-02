'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { MediaRecord } from '@/lib/media/types';
import { formatBytes } from '@/lib/utils/format-bytes';
import { UploadZone } from './UploadZone';
import { MediaCard } from './MediaCard';
import { MediaDetailPanel } from './MediaDetailPanel';

interface StatsData {
  totalFiles: number;
  totalSize: number;
  byType: Record<string, number>;
  storageHealth: 'ONLINE' | 'OFFLINE' | 'READ_ONLY';
  recentUploads: MediaRecord[];
}

const TYPE_FILTERS = [
  { label: 'All',       value: '' },
  { label: 'Images',    value: 'IMAGE' },
  { label: 'GIF',       value: 'GIF' },
  { label: 'Videos',    value: 'VIDEO' },
  { label: 'Audio',     value: 'AUDIO' },
  { label: 'Documents', value: 'DOCUMENT' },
  { label: 'PDF',       value: 'PDF' },
  { label: 'APK',       value: 'APK' },
  { label: 'Archives',  value: 'ZIP' },
];

const SORT_OPTIONS = [
  { label: 'Newest first',      value: 'newest' },
  { label: 'Oldest first',      value: 'oldest' },
  { label: 'Most used',         value: 'most_used' },
  { label: 'Most downloaded',   value: 'most_downloaded' },
  { label: 'Largest first',     value: 'largest' },
  { label: 'Smallest first',    value: 'smallest' },
  { label: 'Recently used',     value: 'recently_used' },
];

const HEALTH_COLOR: Record<string, string> = {
  ONLINE:    'text-green-600 bg-green-50',
  READ_ONLY: 'text-yellow-600 bg-yellow-50',
  OFFLINE:   'text-red-600 bg-red-50',
};

const LIMIT = 24;

export default function MediaLibraryPage() {
  const [stats, setStats]               = useState<StatsData | null>(null);
  const [media, setMedia]               = useState<MediaRecord[]>([]);
  const [total, setTotal]               = useState(0);
  const [page, setPage]                 = useState(1);
  const [loading, setLoading]           = useState(true);
  const [searchInput, setSearchInput]   = useState('');
  const [search, setSearch]             = useState('');
  const [typeFilter, setTypeFilter]     = useState('');
  const [sort, setSort]                 = useState('newest');
  const [selected, setSelected]         = useState<MediaRecord | null>(null);
  const [showUpload, setShowUpload]     = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);

  const loadStats = useCallback(async () => {
    const r = await fetch('/api/media/stats');
    if (r.ok) setStats(await r.json() as StatsData);
  }, []);

  const loadMedia = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ page: String(page), limit: String(LIMIT), sort });
    if (search)          p.set('search', search);
    if (typeFilter)      p.set('type', typeFilter);
    if (includeArchived) p.set('include_archived', 'true');
    const r = await fetch(`/api/media?${p.toString()}`);
    if (r.ok) {
      const d = await r.json() as { media: MediaRecord[]; total: number };
      setMedia(d.media);
      setTotal(d.total);
    }
    setLoading(false);
  }, [page, search, typeFilter, sort, includeArchived]);

  useEffect(() => { void loadStats(); }, [loadStats]);
  useEffect(() => { void loadMedia(); }, [loadMedia]);

  // Debounce search input by 300ms
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  function handleUploadComplete() {
    void loadStats();
    void loadMedia();
    setShowUpload(false);
  }

  function handleMediaUpdated(updated: MediaRecord) {
    setMedia(m => m.map(item => item.id === updated.id ? updated : item));
    setSelected(updated);
  }

  function handleMediaDeleted() {
    setSelected(null);
    void loadStats();
    void loadMedia();
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Media Library</h1>
        <Button onClick={() => setShowUpload(v => !v)}>
          {showUpload ? 'Hide Upload' : '+ Upload Media'}
        </Button>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border bg-white p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Files</div>
            <div className="text-2xl font-bold text-gray-900">{stats.totalFiles.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border bg-white p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Storage Used</div>
            <div className="text-2xl font-bold text-gray-900">{formatBytes(stats.totalSize)}</div>
          </div>
          <div className="rounded-lg border bg-white p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Storage Health</div>
            <span className={`inline-block rounded px-2 py-0.5 text-sm font-semibold ${HEALTH_COLOR[stats.storageHealth] ?? 'text-gray-600'}`}>
              {stats.storageHealth}
            </span>
          </div>
          <div className="rounded-lg border bg-white p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">By Type</div>
            <div className="space-y-0.5">
              {Object.entries(stats.byType)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([type, count]) => (
                  <div key={type} className="flex justify-between text-xs">
                    <span className="text-gray-500">{type}</span>
                    <span className="font-medium text-gray-800">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Upload zone (toggled) */}
      {showUpload && (
        <UploadZone onUploadComplete={handleUploadComplete} />
      )}

      {/* Filter / sort bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="Search files…"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          className="w-44 h-8 text-sm"
        />
        <div className="flex gap-1 flex-wrap">
          {TYPE_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => { setTypeFilter(f.value); setPage(1); }}
              className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                typeFilter === f.value
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={e => { setSort(e.target.value); setPage(1); }}
          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          onClick={() => { setIncludeArchived(v => !v); setPage(1); }}
          className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
            includeArchived
              ? 'bg-gray-800 text-white border-gray-800'
              : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
          }`}
        >
          {includeArchived ? 'Showing Archived' : 'Show Archived'}
        </button>
        <span className="ml-auto text-sm text-gray-400 self-center">{total.toLocaleString()} files</span>
      </div>

      {/* Main area: grid + optional detail panel */}
      <div className="flex gap-4 items-start">
        {/* Media grid */}
        <div className={selected ? 'flex-1 min-w-0' : 'w-full'}>
          {loading ? (
            <div className="flex h-40 items-center justify-center text-gray-400">Loading…</div>
          ) : media.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-gray-400">
              {search || typeFilter ? 'No files match the current filters.' : 'No files uploaded yet.'}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
              {media.map(item => (
                <MediaCard
                  key={item.id}
                  item={item}
                  selected={selected?.id === item.id}
                  onClick={() => setSelected(prev => prev?.id === item.id ? null : item)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-72 flex-shrink-0">
            <MediaDetailPanel
              item={selected}
              onUpdated={handleMediaUpdated}
              onDeleted={handleMediaDeleted}
              onClose={() => setSelected(null)}
            />
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2 justify-end text-sm pt-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded px-3 py-1 border disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            Prev
          </button>
          <span className="text-gray-500">Page {page} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded px-3 py-1 border disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
