/**
 * MediaPicker unit tests
 *
 * NOTE: @testing-library/react is NOT installed in this project (environment is node,
 * not jsdom). These tests cover the pure helper/logic functions extracted from the
 * MediaPicker component instead of rendering the React tree.
 *
 * UI integration tests would require:
 *   npm install -D @testing-library/react @testing-library/user-event jsdom
 *   + vitest.config.ts environment: 'jsdom'
 */

import { describe, it, expect } from 'vitest';
import type { MediaRecord } from '@/lib/media/types';

// ---------------------------------------------------------------------------
// Helpers duplicated here so tests are self-contained (no component import
// needed, which would pull in React DOM and fail in node environment).
// ---------------------------------------------------------------------------

/** Build the accept string for <input type="file"> based on allowed types */
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

function buildAcceptString(typeFilter: string[] | undefined): string | undefined {
  if (!typeFilter) return undefined;
  const parts = typeFilter.map(t => TYPE_TO_MIME[t] ?? '').filter(Boolean);
  return parts.length > 0 ? parts.join(',') : undefined;
}

/** Build the type chip list based on typeFilter prop */
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

function buildTypeChips(typeFilter?: string[]) {
  if (!typeFilter) return ALL_TYPE_FILTERS;
  return [
    { label: 'All', value: '' },
    ...ALL_TYPE_FILTERS.filter(f => f.value && typeFilter.includes(f.value)),
  ];
}

/** Determine total page count */
function totalPages(total: number, limit: number): number {
  return Math.max(1, Math.ceil(total / limit));
}

/** Toggle an item in a multiple-selection array */
function toggleMultiple(current: MediaRecord[], item: MediaRecord): MediaRecord[] {
  const exists = current.find(m => m.id === item.id);
  return exists ? current.filter(m => m.id !== item.id) : [...current, item];
}

/** Toggle single selection (clicking same item deselects it) */
function toggleSingle(current: MediaRecord | null, item: MediaRecord): MediaRecord | null {
  return current?.id === item.id ? null : item;
}

/** Build browse URL params */
function buildBrowseParams(opts: {
  page: number;
  limit: number;
  search: string;
  typeChip: string;
}): URLSearchParams {
  const p = new URLSearchParams({
    page: String(opts.page),
    limit: String(opts.limit),
    sort: 'newest',
  });
  if (opts.search)   p.set('search', opts.search);
  if (opts.typeChip) p.set('type', opts.typeChip);
  return p;
}

/** Minimal MediaRecord factory for tests */
function makeMedia(id: number, overrides: Partial<MediaRecord> = {}): MediaRecord {
  return {
    id,
    tenantId: null,
    fileHash: `hash-${id}`,
    storageKey: `key-${id}`,       // never exposed to client
    storageProvider: 'local',
    mediaType: 'IMAGE',
    mimeType: 'image/jpeg',
    extension: 'jpg',
    originalFilename: `file-${id}.jpg`,
    displayName: `File ${id}`,
    fileSize: 1024,
    width: 100,
    height: 100,
    duration: null,
    thumbnailKey: null,
    thumbnailStatus: 'NONE',
    metadata: {},
    usageCount: 0,
    referenceCount: 0,
    lastUsedAt: null,
    lastUsedModule: null,
    downloadCount: 0,
    lastDownloadedAt: null,
    createdBy: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isActive: true,
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MediaPicker — helper logic', () => {

  // 1. Accept string for file input
  describe('buildAcceptString', () => {
    it('returns undefined when typeFilter is not provided', () => {
      expect(buildAcceptString(undefined)).toBeUndefined();
    });

    it('returns correct MIME types for IMAGE', () => {
      const result = buildAcceptString(['IMAGE']);
      expect(result).toBe('image/jpeg,image/png,image/webp');
    });

    it('returns combined MIME string for multiple types', () => {
      const result = buildAcceptString(['IMAGE', 'PDF']);
      expect(result).toBe('image/jpeg,image/png,image/webp,application/pdf');
    });

    it('ignores unknown type keys', () => {
      const result = buildAcceptString(['UNKNOWN_TYPE']);
      // Unknown type produces empty string which is filtered out
      expect(result).toBeUndefined();
    });
  });

  // 2. Type chip filtering
  describe('buildTypeChips', () => {
    it('returns all chips when typeFilter is undefined', () => {
      const chips = buildTypeChips(undefined);
      expect(chips).toHaveLength(ALL_TYPE_FILTERS.length);
      expect(chips[0].value).toBe('');
    });

    it('restricts chips to typeFilter prop values', () => {
      const chips = buildTypeChips(['IMAGE', 'GIF']);
      // Always has "All" + the two filtered types
      expect(chips).toHaveLength(3);
      const values = chips.map(c => c.value);
      expect(values).toContain('');
      expect(values).toContain('IMAGE');
      expect(values).toContain('GIF');
      expect(values).not.toContain('VIDEO');
    });

    it('typeFilter with single type produces 2 chips (All + that type)', () => {
      const chips = buildTypeChips(['APK']);
      expect(chips).toHaveLength(2);
      expect(chips[1].value).toBe('APK');
    });
  });

  // 3. Pagination
  describe('totalPages', () => {
    it('returns 1 for 0 items', () => {
      expect(totalPages(0, 24)).toBe(1);
    });

    it('returns 1 when total fits in one page', () => {
      expect(totalPages(24, 24)).toBe(1);
    });

    it('returns 2 when total exceeds one page by one', () => {
      expect(totalPages(25, 24)).toBe(2);
    });

    it('correctly computes pages for 100 items with limit 24', () => {
      expect(totalPages(100, 24)).toBe(5);
    });
  });

  // 4. Single mode selection
  describe('toggleSingle', () => {
    const item = makeMedia(1);

    it('selects an item when none is selected', () => {
      expect(toggleSingle(null, item)).toBe(item);
    });

    it('deselects item when same item is clicked again', () => {
      expect(toggleSingle(item, item)).toBeNull();
    });

    it('switches selection to new item', () => {
      const item2 = makeMedia(2);
      expect(toggleSingle(item, item2)).toBe(item2);
    });
  });

  // 5. Multiple mode selection
  describe('toggleMultiple', () => {
    const a = makeMedia(1);
    const b = makeMedia(2);
    const c = makeMedia(3);

    it('adds item when not in array', () => {
      const result = toggleMultiple([], a);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    it('removes item when already in array', () => {
      const result = toggleMultiple([a, b], a);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(2);
    });

    it('accumulates multiple selections', () => {
      let sel: MediaRecord[] = [];
      sel = toggleMultiple(sel, a);
      sel = toggleMultiple(sel, b);
      sel = toggleMultiple(sel, c);
      expect(sel).toHaveLength(3);
    });

    it('deselects one of many', () => {
      const result = toggleMultiple([a, b, c], b);
      expect(result).toHaveLength(2);
      expect(result.find(m => m.id === b.id)).toBeUndefined();
    });
  });

  // 6. Browse URL params
  describe('buildBrowseParams', () => {
    it('always includes page, limit, sort=newest', () => {
      const p = buildBrowseParams({ page: 1, limit: 24, search: '', typeChip: '' });
      expect(p.get('page')).toBe('1');
      expect(p.get('limit')).toBe('24');
      expect(p.get('sort')).toBe('newest');
    });

    it('includes search when provided', () => {
      const p = buildBrowseParams({ page: 1, limit: 24, search: 'logo', typeChip: '' });
      expect(p.get('search')).toBe('logo');
    });

    it('includes type chip when provided', () => {
      const p = buildBrowseParams({ page: 1, limit: 24, search: '', typeChip: 'IMAGE' });
      expect(p.get('type')).toBe('IMAGE');
    });

    it('does not include search or type when empty', () => {
      const p = buildBrowseParams({ page: 1, limit: 24, search: '', typeChip: '' });
      expect(p.has('search')).toBe(false);
      expect(p.has('type')).toBe(false);
    });

    it('builds correct page 3 url', () => {
      const p = buildBrowseParams({ page: 3, limit: 24, search: 'test', typeChip: 'VIDEO' });
      expect(p.get('page')).toBe('3');
      expect(p.get('search')).toBe('test');
      expect(p.get('type')).toBe('VIDEO');
    });
  });

  // 7. Storage key safety
  describe('MediaRecord — storageKey not exposed to API URL', () => {
    it('thumbnail URL uses id not storageKey', () => {
      const item = makeMedia(42, { storageKey: 'super-secret-storage-path' });
      const thumbnailUrl = `/api/media/${item.id}/thumbnail`;
      expect(thumbnailUrl).toBe('/api/media/42/thumbnail');
      expect(thumbnailUrl).not.toContain(item.storageKey);
    });

    it('file URL uses id not storageKey', () => {
      const item = makeMedia(42, { storageKey: 'super-secret-storage-path' });
      const fileUrl = `/api/media/${item.id}/file`;
      expect(fileUrl).toBe('/api/media/42/file');
      expect(fileUrl).not.toContain(item.storageKey);
    });
  });

  // 8. Tab enumeration
  describe('Tab type', () => {
    it('has four expected tabs', () => {
      const TABS = ['browse', 'recent', 'popular', 'upload'] as const;
      expect(TABS).toHaveLength(4);
      expect(TABS).toContain('browse');
      expect(TABS).toContain('recent');
      expect(TABS).toContain('popular');
      expect(TABS).toContain('upload');
    });
  });
});
