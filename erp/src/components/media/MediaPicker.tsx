'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  Upload,
  Clock,
  Star,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MediaCard } from '@/app/(dashboard)/media-library/MediaCard';
import type { MediaRecord } from '@/lib/media/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'browse' | 'recent' | 'popular' | 'upload';

const GRID_LIMIT = 24;

export interface MediaPickerProps {
  /** 'single' (default): one item, selection closes picker. 'multiple': checkboxes, "Select N" button. */
  mode?: 'single' | 'multiple';
  /** Restrict which media types are shown and uploadable. If undefined, all types shown. */
  typeFilter?: string[];
  /** Called with selected media. For 'single': MediaRecord. For 'multiple': MediaRecord[]. */
  onSelect: (media: MediaRecord | MediaRecord[]) => void;
  /** Called when picker is dismissed without selection. */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_TYPE_FILTERS = [
  { label: 'All',       value: '' },
  { label: 'Image',     value: 'IMAGE' },
  { label: 'GIF',       value: 'GIF' },
  { label: 'Video',     value: 'VIDEO' },
  { label: 'Audio',     value: 'AUDIO' },
  { label: 'PDF',       value: 'PDF' },
  { label: 'APK',       value: 'APK' },
  { label: 'Document',  value: 'DOCUMENT' },
  { label: 'ZIP/RAR',   value: 'ZIP' },
];

// MIME type map for <input accept>
const TYPE_TO_MIME: Record<string, string> = {
  IMAGE:    'image/jpeg,image/png,image/webp',
  GIF:      'image/gif',
  VIDEO:    'video/*',
  AUDIO:    'audio/*',
  PDF:      'application/pdf',
  APK:      'application/vnd.android.package-archive',
  DOCUMENT: '.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt',
  ZIP:      '.zip,.rar,.7z',
  RAR:      '.rar',
};

// ---------------------------------------------------------------------------
// Upload status types
// ---------------------------------------------------------------------------

interface UploadFileStatus {
  name: string;
  status: 'uploading' | 'done' | 'failed';
  error?: string;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MediaPicker({
  mode = 'single',
  typeFilter,
  onSelect,
  onClose,
}: MediaPickerProps) {
  // --- Tab state ---
  const [tab, setTab] = useState<Tab>('browse');

  // --- Browse state ---
  const [browseMedia, setBrowseMedia] = useState<MediaRecord[]>([]);
  const [browseTotal, setBrowseTotal] = useState(0);
  const [browsePage, setBrowsePage] = useState(1);
  const [browseSearch, setBrowseSearch] = useState('');
  const [browseTypeChip, setBrowseTypeChip] = useState<string>(
    typeFilter && typeFilter.length === 1 ? typeFilter[0] : ''
  );
  const [browseLoading, setBrowseLoading] = useState(true);

  // --- Recent state ---
  const [recentMedia, setRecentMedia] = useState<MediaRecord[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentLoaded, setRecentLoaded] = useState(false);

  // --- Popular state ---
  const [popularMedia, setPopularMedia] = useState<MediaRecord[]>([]);
  const [popularLoading, setPopularLoading] = useState(false);
  const [popularLoaded, setPopularLoaded] = useState(false);

  // --- Selection state ---
  const [selectedSingle, setSelectedSingle] = useState<MediaRecord | null>(null);
  const [selectedMultiple, setSelectedMultiple] = useState<MediaRecord[]>([]);

  // --- Upload state ---
  const [uploadFiles, setUploadFiles] = useState<UploadFileStatus[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Keyboard nav state ---
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const gridRef = useRef<HTMLDivElement>(null);

  // Search debounce timer
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const browseTotalPages = Math.max(1, Math.ceil(browseTotal / GRID_LIMIT));

  // Type filter chips: restrict to typeFilter prop if provided
  const typeChips = typeFilter
    ? [{ label: 'All', value: '' }, ...ALL_TYPE_FILTERS.filter(f => f.value && typeFilter.includes(f.value))]
    : ALL_TYPE_FILTERS;

  // Accept string for file input
  const acceptString = typeFilter
    ? typeFilter.map(t => TYPE_TO_MIME[t] ?? '').filter(Boolean).join(',')
    : undefined;

  // Active grid items for keyboard nav
  const activeGridItems: MediaRecord[] =
    tab === 'browse' ? browseMedia :
    tab === 'recent' ? recentMedia :
    tab === 'popular' ? popularMedia : [];

  // ---------------------------------------------------------------------------
  // Load browse tab
  // ---------------------------------------------------------------------------

  const loadBrowse = useCallback(async () => {
    setBrowseLoading(true);
    try {
      const p = new URLSearchParams({
        page: String(browsePage),
        limit: String(GRID_LIMIT),
        sort: 'newest',
      });
      if (browseSearch)   p.set('search', browseSearch);
      if (browseTypeChip) p.set('type', browseTypeChip);
      const r = await fetch(`/api/media?${p.toString()}`);
      if (r.ok) {
        const d = await r.json() as { media: MediaRecord[]; total: number };
        setBrowseMedia(d.media);
        setBrowseTotal(d.total);
      }
    } finally {
      setBrowseLoading(false);
    }
  }, [browsePage, browseSearch, browseTypeChip]);

  useEffect(() => { void loadBrowse(); }, [loadBrowse]);

  // ---------------------------------------------------------------------------
  // Load recent tab (lazy, once)
  // ---------------------------------------------------------------------------

  const loadRecent = useCallback(async () => {
    setRecentLoading(true);
    try {
      const p = new URLSearchParams({ sort: 'newest', limit: '20', page: '1' });
      if (typeFilter && typeFilter.length === 1) p.set('type', typeFilter[0]);
      const r = await fetch(`/api/media?${p.toString()}`);
      if (r.ok) {
        const d = await r.json() as { media: MediaRecord[]; total: number };
        setRecentMedia(d.media);
      }
    } finally {
      setRecentLoading(false);
      setRecentLoaded(true);
    }
  }, [typeFilter]);

  // ---------------------------------------------------------------------------
  // Load popular tab (lazy, once)
  // Note: API does not have a dedicated "most referenced" sort — using
  // `most_used` (usage_count DESC) as a proxy for frequently-referenced items.
  // ---------------------------------------------------------------------------

  const loadPopular = useCallback(async () => {
    setPopularLoading(true);
    try {
      const p = new URLSearchParams({ sort: 'most_used', limit: '20', page: '1' });
      if (typeFilter && typeFilter.length === 1) p.set('type', typeFilter[0]);
      const r = await fetch(`/api/media?${p.toString()}`);
      if (r.ok) {
        const d = await r.json() as { media: MediaRecord[]; total: number };
        setPopularMedia(d.media);
      }
    } finally {
      setPopularLoading(false);
      setPopularLoaded(true);
    }
  }, [typeFilter]);

  // Load lazy tabs when switching
  useEffect(() => {
    if (tab === 'recent' && !recentLoaded) void loadRecent();
    if (tab === 'popular' && !popularLoaded) void loadPopular();
  }, [tab, recentLoaded, popularLoaded, loadRecent, loadPopular]);

  // ---------------------------------------------------------------------------
  // Escape key handler
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // ---------------------------------------------------------------------------
  // Ctrl+V paste handler (Upload tab only)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (tab !== 'upload') return;

    const handler = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        void handleFilesSelected(Array.from(files));
      }
    };

    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // ---------------------------------------------------------------------------
  // Search debounce
  // ---------------------------------------------------------------------------

  const handleSearchInput = (value: string) => {
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setBrowseSearch(value);
      setBrowsePage(1);
    }, 300);
  };

  // ---------------------------------------------------------------------------
  // Selection helpers
  // ---------------------------------------------------------------------------

  function toggleSelected(item: MediaRecord) {
    if (mode === 'single') {
      setSelectedSingle(prev => prev?.id === item.id ? null : item);
    } else {
      setSelectedMultiple(prev => {
        const exists = prev.find(m => m.id === item.id);
        return exists ? prev.filter(m => m.id !== item.id) : [...prev, item];
      });
    }
  }

  function isSelected(item: MediaRecord): boolean {
    if (mode === 'single') return selectedSingle?.id === item.id;
    return selectedMultiple.some(m => m.id === item.id);
  }

  function handleDoubleClick(item: MediaRecord) {
    if (mode === 'single') {
      onSelect(item);
      onClose();
    }
  }

  function handleConfirmSelect() {
    if (mode === 'single' && selectedSingle) {
      onSelect(selectedSingle);
      onClose();
    } else if (mode === 'multiple' && selectedMultiple.length > 0) {
      onSelect(selectedMultiple);
      onClose();
    }
  }

  // ---------------------------------------------------------------------------
  // Upload logic
  // ---------------------------------------------------------------------------

  async function handleFilesSelected(files: File[]) {
    if (files.length === 0) return;

    const initialStatuses: UploadFileStatus[] = files.map(f => ({
      name: f.name,
      status: 'uploading',
    }));
    setUploadFiles(initialStatuses);

    const results: UploadFileStatus[] = [...initialStatuses];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const formData = new FormData();
        formData.append('file', file);
        const r = await fetch('/api/media/upload', { method: 'POST', body: formData });
        if (r.ok) {
          results[i] = { name: file.name, status: 'done' };
        } else {
          const err = await r.text();
          results[i] = { name: file.name, status: 'failed', error: err };
        }
      } catch (err) {
        results[i] = { name: file.name, status: 'failed', error: String(err) };
      }
      setUploadFiles([...results]);
    }

    const allDone = results.every(r => r.status === 'done');
    if (allDone) {
      console.log(`MediaPicker: uploaded ${files.length} file(s) successfully`);
      // Auto-switch to Browse and reload
      setTimeout(() => {
        setTab('browse');
        void loadBrowse();
      }, 800);
    }
  }

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    void handleFilesSelected(files);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    void handleFilesSelected(files);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  // ---------------------------------------------------------------------------
  // Keyboard navigation on grid
  // ---------------------------------------------------------------------------

  const GRID_COLS = 4; // matches grid-cols-4 sm:grid-cols-6 (use 4 for nav logic)

  const handleGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (activeGridItems.length === 0) return;

    const current = focusedIndex < 0 ? 0 : focusedIndex;

    switch (e.key) {
      case 'ArrowRight': {
        e.preventDefault();
        const next = Math.min(current + 1, activeGridItems.length - 1);
        setFocusedIndex(next);
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        const prev = Math.max(current - 1, 0);
        setFocusedIndex(prev);
        break;
      }
      case 'ArrowDown': {
        e.preventDefault();
        const down = Math.min(current + GRID_COLS, activeGridItems.length - 1);
        setFocusedIndex(down);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const up = Math.max(current - GRID_COLS, 0);
        setFocusedIndex(up);
        break;
      }
      case 'Enter': {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < activeGridItems.length) {
          toggleSelected(activeGridItems[focusedIndex]);
        }
        break;
      }
    }
  };

  // Reset focused index when tab or media changes
  useEffect(() => { setFocusedIndex(-1); }, [tab]);

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function renderSkeletonGrid() {
    return (
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square rounded-lg bg-gray-200 animate-pulse"
          />
        ))}
      </div>
    );
  }

  function renderGrid(items: MediaRecord[], loading: boolean, emptyMessage: string, showUploadLink: boolean) {
    if (loading) return renderSkeletonGrid();
    if (items.length === 0) {
      return (
        <div className="h-48 flex flex-col items-center justify-center gap-2 text-gray-400 text-sm">
          <span>{emptyMessage}</span>
          {showUploadLink && (
            <button
              onClick={() => setTab('upload')}
              className="text-gray-700 underline text-xs"
            >
              Upload something
            </button>
          )}
        </div>
      );
    }

    return (
      <div
        ref={gridRef}
        role="grid"
        tabIndex={0}
        className="grid grid-cols-4 sm:grid-cols-6 gap-2 focus:outline-none"
        onKeyDown={handleGridKeyDown}
        aria-label="Media grid"
      >
        {items.map((item, idx) => (
          <div
            key={item.id}
            className="relative"
            onDoubleClick={() => handleDoubleClick(item)}
          >
            {/* Multiple mode checkbox overlay */}
            {mode === 'multiple' && (
              <div className="absolute top-1 left-1 z-10 pointer-events-none">
                <div
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                    isSelected(item)
                      ? 'bg-gray-900 border-gray-900'
                      : 'bg-white border-gray-300'
                  }`}
                >
                  {isSelected(item) && (
                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              </div>
            )}
            <div
              className={focusedIndex === idx ? 'ring-2 ring-blue-400 rounded-lg' : ''}
            >
              <MediaCard
                item={item}
                selected={isSelected(item)}
                onClick={() => toggleSelected(item)}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const footerVisible = tab !== 'upload';
  const hasSelection = mode === 'single' ? !!selectedSingle : selectedMultiple.length > 0;

  const selectButtonLabel =
    mode === 'multiple' && selectedMultiple.length > 0
      ? `Select ${selectedMultiple.length} item${selectedMultiple.length > 1 ? 's' : ''}`
      : 'Select';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Media Picker"
    >
      <div className="bg-white rounded-xl shadow-2xl w-[900px] max-h-[88vh] flex flex-col">
        {/* ---- Header ---- */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <h2 className="text-lg font-semibold">Choose Media</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ---- Tabs ---- */}
        <div className="flex border-b px-5 shrink-0">
          {(
            [
              { id: 'browse',  label: 'Browse',  icon: <Search className="w-3.5 h-3.5" /> },
              { id: 'recent',  label: 'Recent',  icon: <Clock  className="w-3.5 h-3.5" /> },
              { id: 'popular', label: 'Popular', icon: <Star   className="w-3.5 h-3.5" /> },
              { id: 'upload',  label: 'Upload',  icon: <Upload className="w-3.5 h-3.5" /> },
            ] as const
          ).map(t => (
            <button
              key={t.id}
              data-tab={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 py-2.5 px-4 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-400 hover:text-gray-700'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* ---- Body ---- */}
        <div className="flex-1 overflow-auto p-4 min-h-0">

          {/* Browse Tab */}
          {tab === 'browse' && (
            <div className="space-y-3">
              {/* Filters row */}
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  <Input
                    placeholder="Search…"
                    defaultValue=""
                    onChange={e => handleSearchInput(e.target.value)}
                    className="pl-8 w-44 h-8 text-sm"
                  />
                </div>
                <div className="flex gap-1 flex-wrap">
                  {typeChips.map(chip => (
                    <button
                      key={chip.value}
                      onClick={() => { setBrowseTypeChip(chip.value); setBrowsePage(1); }}
                      className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                        browseTypeChip === chip.value
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grid */}
              {renderGrid(browseMedia, browseLoading, 'No media found', true)}

              {/* Pagination */}
              {!browseLoading && browseTotalPages > 1 && (
                <div className="flex items-center gap-2 justify-end text-sm pt-1">
                  <button
                    onClick={() => setBrowsePage(p => Math.max(1, p - 1))}
                    disabled={browsePage === 1}
                    className="flex items-center gap-1 rounded px-2 py-1 border text-xs disabled:opacity-40 hover:bg-gray-50"
                  >
                    <ChevronLeft className="w-3 h-3" /> Prev
                  </button>
                  <span className="text-gray-400">Page {browsePage} of {browseTotalPages}</span>
                  <button
                    onClick={() => setBrowsePage(p => Math.min(browseTotalPages, p + 1))}
                    disabled={browsePage === browseTotalPages}
                    className="flex items-center gap-1 rounded px-2 py-1 border text-xs disabled:opacity-40 hover:bg-gray-50"
                  >
                    Next <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Recent Tab */}
          {tab === 'recent' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-400">Last 20 uploaded items</p>
              {renderGrid(recentMedia, recentLoading, 'No recent media', true)}
            </div>
          )}

          {/* Popular Tab */}
          {tab === 'popular' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-400">Most frequently used media</p>
              {renderGrid(popularMedia, popularLoading, 'No popular media yet', false)}
            </div>
          )}

          {/* Upload Tab */}
          {tab === 'upload' && (
            <div className="space-y-4">
              {/* Drop zone */}
              <div
                role="region"
                aria-label="Upload drop zone"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${
                  isDragOver
                    ? 'border-gray-500 bg-gray-50'
                    : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50/50'
                }`}
              >
                <Upload className="w-8 h-8 text-gray-400" />
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-700">Drop files here or click to browse</p>
                  <p className="text-xs text-gray-400 mt-1">or Ctrl+V to paste from clipboard</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={acceptString}
                  className="sr-only"
                  onChange={handleFileInputChange}
                  aria-label="File upload input"
                />
              </div>

              {/* Per-file upload status */}
              {uploadFiles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Upload progress</p>
                  <div className="rounded-lg border divide-y overflow-hidden">
                    {uploadFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate text-gray-800">{f.name}</p>
                          {f.error && (
                            <p className="text-xs text-red-500 truncate">{f.error}</p>
                          )}
                        </div>
                        <div className="shrink-0">
                          {f.status === 'uploading' && (
                            <div className="flex items-center gap-1.5 text-xs text-gray-400">
                              <div className="w-3 h-3 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
                              Uploading…
                            </div>
                          )}
                          {f.status === 'done' && (
                            <span className="text-xs text-green-600 font-medium">Done ✓</span>
                          )}
                          {f.status === 'failed' && (
                            <span className="text-xs text-red-500 font-medium">Failed ✗</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ---- Footer (all tabs except Upload) ---- */}
        {footerVisible && (
          <div className="flex items-center justify-between px-5 py-3 border-t bg-gray-50 rounded-b-xl shrink-0">
            <span className="text-sm text-gray-500 truncate max-w-xs">
              {mode === 'single'
                ? (selectedSingle ? selectedSingle.displayName : 'No media selected')
                : (selectedMultiple.length > 0
                    ? `${selectedMultiple.length} item${selectedMultiple.length > 1 ? 's' : ''} selected`
                    : 'No media selected')
              }
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button
                size="sm"
                disabled={!hasSelection}
                onClick={handleConfirmSelect}
              >
                {selectButtonLabel}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
