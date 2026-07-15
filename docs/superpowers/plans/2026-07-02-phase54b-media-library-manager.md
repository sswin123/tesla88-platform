# Phase 5.4B — Media Library Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the ERP Media Library Manager page (`/media-library`) with upload, search, filter, sort, preview, and management actions backed by two new API routes.

**Architecture:** Two new API routes (`GET /api/media`, `GET /api/media/stats`) serve the ERP page, backed by an enhanced `listMediaFiltered` repo function. The ERP page is split into four focused client components (`UploadZone`, `MediaCard`, `MediaDetailPanel`, `page.tsx`) assembled bottom-up so each can be reviewed in isolation. Phase 5.4A routes and MediaService are untouched.

**Tech Stack:** Next.js 14 App Router, TypeScript, `pg` pool (no ORM), Vitest, Tailwind CSS, lucide-react

## Global Constraints

- Run all tests from `erp/` directory: `cd erp && npm test`
- Run lint/typecheck: `cd erp && npm run lint` (runs `tsc --noEmit`)
- Run build: `cd erp && npm run build`
- `@` alias = `erp/src/`; test files in `erp/tests/`
- Auth pattern: `verifyJWT(token)` from `@/lib/auth` returning `{ sub: number, role: string }`; cookie name `COOKIE_NAME`; `await cookies()` from `next/headers`
- Do NOT use `pool.query` directly in route files; use repo functions
- Do NOT touch Phase 5.4A files (media-service.ts, filesystem-provider.ts, upload/file/thumbnail/replace/restore/permanent routes, `[id]/route.ts`)
- Do NOT add base64 handling, fs.readFile, or Buffer construction outside MediaService
- Params in Next.js App Router are `Promise<{ id: string }>` — must `await params`
- `mediaService` singleton imported from `@/lib/media`; `MediaRecord` type from `@/lib/media/types`
- All new ERP pages are `'use client'` components in `erp/src/app/(dashboard)/`
- Sidebar file: `erp/src/components/sidebar.tsx`; Media Library goes in the "Control Center" `NavGroup`
- No backend Bulk Delete or Bulk Restore (reserved for future phases)
- `GET /api/media/stats` returns `recentUploads` with limit 6

---

## File Map

**New files:**
| File | Responsibility |
|------|---------------|
| `erp/src/lib/repositories/media_repo.ts` | Add `listMediaFiltered`, `getRecentUploads`, export `SortOption` type |
| `erp/src/app/api/media/route.ts` | `GET /api/media` — list with filters, sort, pagination |
| `erp/src/app/api/media/stats/route.ts` | `GET /api/media/stats` — dashboard statistics |
| `erp/src/app/api/media/[id]/references/route.ts` | `GET /api/media/:id/references` — stub returning `{ references: [] }` |
| `erp/src/app/(dashboard)/media-library/UploadZone.tsx` | Upload zone: drag & drop, click, Ctrl+V, multi-file progress |
| `erp/src/app/(dashboard)/media-library/MediaCard.tsx` | Grid card: thumbnail, type badge, filename, size |
| `erp/src/app/(dashboard)/media-library/MediaDetailPanel.tsx` | Detail panel: preview, metadata, edit, replace, archive, restore, delete |
| `erp/src/app/(dashboard)/media-library/page.tsx` | Page root: state, data loading, assembles all components |
| `erp/tests/media-list-route.test.ts` | Tests for `GET /api/media` |
| `erp/tests/media-stats-route.test.ts` | Tests for `GET /api/media/stats` |

**Modified files:**
| File | What changes |
|------|-------------|
| `erp/src/components/sidebar.tsx` | Add Media Library link to Control Center group |
| `erp/src/lib/repositories/media_repo.ts` | Append `listMediaFiltered`, `getRecentUploads`, `SortOption` |

---

### Task 1: Backend APIs — GET /api/media, GET /api/media/stats, GET /api/media/:id/references

**Files:**
- Modify: `erp/src/lib/repositories/media_repo.ts`
- Create: `erp/src/app/api/media/route.ts`
- Create: `erp/src/app/api/media/stats/route.ts`
- Create: `erp/src/app/api/media/[id]/references/route.ts`
- Create: `erp/tests/media-list-route.test.ts`
- Create: `erp/tests/media-stats-route.test.ts`

**Interfaces:**
- Consumes: `getMediaStats` (existing), `listMediaFiltered` (new), `getRecentUploads` (new) from `@/lib/repositories/media_repo`; `mediaService.getStorageProvider().health()` from `@/lib/media`
- Produces:
  - `GET /api/media?search=&type=IMAGE&sort=newest&page=1&limit=20` → `{ media: MediaRecord[], total: number, page: number, limit: number }`
  - `GET /api/media/stats` → `{ totalFiles: number, totalSize: number, byType: Record<string,number>, storageHealth: StorageHealth, recentUploads: MediaRecord[] }`
  - `GET /api/media/:id/references` → `{ references: [] }`

- [ ] **Step 1: Write failing tests for GET /api/media**

Create `erp/tests/media-list-route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  verifyJWT: vi.fn().mockResolvedValue({ sub: 1, role: 'ADMIN' }),
  COOKIE_NAME: 'erp_token',
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => ({ value: 'tok' }) }),
}));

vi.mock('@/lib/repositories/media_repo', () => ({
  listMediaFiltered: vi.fn().mockResolvedValue({ records: [], total: 0 }),
}));

import { GET } from '@/app/api/media/route';
import { listMediaFiltered } from '@/lib/repositories/media_repo';

describe('GET /api/media', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no cookie', async () => {
    const { cookies } = await import('next/headers');
    vi.mocked(cookies).mockResolvedValueOnce({ get: () => undefined } as never);
    const res = await GET(new NextRequest('http://localhost/api/media'));
    expect(res.status).toBe(401);
  });

  it('returns paginated list with default params', async () => {
    vi.mocked(listMediaFiltered).mockResolvedValueOnce({
      records: [{ id: 1, displayName: 'photo.jpg' } as never],
      total: 1,
    });
    const res = await GET(new NextRequest('http://localhost/api/media'));
    expect(res.status).toBe(200);
    const body = await res.json() as { media: unknown[]; total: number; page: number; limit: number };
    expect(body.total).toBe(1);
    expect(body.media).toHaveLength(1);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
  });

  it('forwards search param', async () => {
    vi.mocked(listMediaFiltered).mockResolvedValueOnce({ records: [], total: 0 });
    await GET(new NextRequest('http://localhost/api/media?search=cat'));
    expect(vi.mocked(listMediaFiltered)).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'cat' })
    );
  });

  it('forwards type filter param', async () => {
    vi.mocked(listMediaFiltered).mockResolvedValueOnce({ records: [], total: 0 });
    await GET(new NextRequest('http://localhost/api/media?type=IMAGE'));
    expect(vi.mocked(listMediaFiltered)).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: 'IMAGE' })
    );
  });

  it('defaults sort to newest', async () => {
    vi.mocked(listMediaFiltered).mockResolvedValueOnce({ records: [], total: 0 });
    await GET(new NextRequest('http://localhost/api/media'));
    expect(vi.mocked(listMediaFiltered)).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'newest' })
    );
  });

  it('falls back to newest for unknown sort value', async () => {
    vi.mocked(listMediaFiltered).mockResolvedValueOnce({ records: [], total: 0 });
    await GET(new NextRequest('http://localhost/api/media?sort=hacked'));
    expect(vi.mocked(listMediaFiltered)).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'newest' })
    );
  });

  it('caps limit at 100', async () => {
    vi.mocked(listMediaFiltered).mockResolvedValueOnce({ records: [], total: 0 });
    await GET(new NextRequest('http://localhost/api/media?limit=9999'));
    expect(vi.mocked(listMediaFiltered)).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 })
    );
  });

  it('computes offset from page', async () => {
    vi.mocked(listMediaFiltered).mockResolvedValueOnce({ records: [], total: 0 });
    await GET(new NextRequest('http://localhost/api/media?page=3&limit=10'));
    expect(vi.mocked(listMediaFiltered)).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 20, limit: 10, page: undefined })
    );
  });
});
```

- [ ] **Step 2: Write failing tests for GET /api/media/stats**

Create `erp/tests/media-stats-route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  verifyJWT: vi.fn().mockResolvedValue({ sub: 1, role: 'ADMIN' }),
  COOKIE_NAME: 'erp_token',
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => ({ value: 'tok' }) }),
}));

vi.mock('@/lib/repositories/media_repo', () => ({
  getMediaStats: vi.fn().mockResolvedValue({
    total: 5,
    totalSize: 12345,
    byType: { IMAGE: 3, VIDEO: 2 },
  }),
  getRecentUploads: vi.fn().mockResolvedValue([{ id: 99 }]),
}));

vi.mock('@/lib/media', () => ({
  mediaService: {
    getStorageProvider: vi.fn().mockReturnValue({
      health: vi.fn().mockResolvedValue('ONLINE'),
    }),
  },
}));

import { GET } from '@/app/api/media/stats/route';
import { getRecentUploads } from '@/lib/repositories/media_repo';

describe('GET /api/media/stats', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no cookie', async () => {
    const { cookies } = await import('next/headers');
    vi.mocked(cookies).mockResolvedValueOnce({ get: () => undefined } as never);
    const res = await GET(new NextRequest('http://localhost/api/media/stats'));
    expect(res.status).toBe(401);
  });

  it('returns stats with storage health', async () => {
    const res = await GET(new NextRequest('http://localhost/api/media/stats'));
    expect(res.status).toBe(200);
    const body = await res.json() as {
      totalFiles: number; totalSize: number;
      byType: Record<string, number>; storageHealth: string;
      recentUploads: unknown[];
    };
    expect(body.totalFiles).toBe(5);
    expect(body.totalSize).toBe(12345);
    expect(body.byType).toEqual({ IMAGE: 3, VIDEO: 2 });
    expect(body.storageHealth).toBe('ONLINE');
    expect(body.recentUploads).toHaveLength(1);
  });

  it('calls getRecentUploads with limit 6', async () => {
    await GET(new NextRequest('http://localhost/api/media/stats'));
    expect(vi.mocked(getRecentUploads)).toHaveBeenCalledWith(6);
  });

  it('returns OFFLINE when storage health throws', async () => {
    const { mediaService } = await import('@/lib/media');
    vi.mocked(mediaService.getStorageProvider).mockReturnValueOnce({
      health: vi.fn().mockRejectedValue(new Error('disk full')),
    } as never);
    const res = await GET(new NextRequest('http://localhost/api/media/stats'));
    const body = await res.json() as { storageHealth: string };
    expect(body.storageHealth).toBe('OFFLINE');
  });
});
```

- [ ] **Step 3: Run tests — expect failures**

```bash
cd erp && npm test -- --reporter=verbose 2>&1 | grep -E "FAIL|PASS|error" | head -20
```

Expected: both test files FAIL with import errors (routes don't exist yet).

- [ ] **Step 4: Append new functions to media_repo.ts**

Open `erp/src/lib/repositories/media_repo.ts` and append after the `getMediaStats` function at the end of the file:

```typescript
// ---------------------------------------------------------------------------
// Filtered + sorted list (used by GET /api/media with full query params)
// ---------------------------------------------------------------------------

export type SortOption =
  | 'newest' | 'oldest' | 'most_used' | 'most_downloaded'
  | 'largest' | 'smallest' | 'recently_used';

const ORDER_CLAUSE: Record<SortOption, string> = {
  newest:          'created_at DESC',
  oldest:          'created_at ASC',
  most_used:       'usage_count DESC, created_at DESC',
  most_downloaded: 'download_count DESC, created_at DESC',
  largest:         'file_size DESC',
  smallest:        'file_size ASC',
  recently_used:   'last_used_at DESC NULLS LAST',
};

interface FilteredListOptions {
  limit: number;
  offset: number;
  sort: SortOption;
  search?: string;
  mediaType?: string;
  mimeType?: string;
  extension?: string;
  uploadedBy?: number;
  module?: string;
  dateFrom?: string;
  dateTo?: string;
  minSize?: number;
  maxSize?: number;
  active?: boolean;
}

export async function listMediaFiltered(
  opts: FilteredListOptions
): Promise<{ records: MediaRecord[]; total: number }> {
  const conds: string[] = ['deleted_at IS NULL'];
  const vals: unknown[] = [];
  let i = 1;

  if (opts.search) {
    // Both columns share the same $i parameter — push one value
    conds.push(`(display_name ILIKE $${i} OR original_filename ILIKE $${i})`);
    vals.push(`%${opts.search}%`);
    i++;
  }
  if (opts.mediaType)               { conds.push(`media_type = $${i++}`);        vals.push(opts.mediaType); }
  if (opts.mimeType)                { conds.push(`mime_type = $${i++}`);          vals.push(opts.mimeType); }
  if (opts.extension)               { conds.push(`extension = $${i++}`);          vals.push(opts.extension); }
  if (opts.uploadedBy !== undefined){ conds.push(`created_by = $${i++}`);         vals.push(opts.uploadedBy); }
  if (opts.module)                  { conds.push(`last_used_module = $${i++}`);   vals.push(opts.module); }
  if (opts.dateFrom)                { conds.push(`created_at >= $${i++}`);        vals.push(opts.dateFrom); }
  if (opts.dateTo)                  { conds.push(`created_at <= $${i++}`);        vals.push(opts.dateTo); }
  if (opts.minSize !== undefined)   { conds.push(`file_size >= $${i++}`);         vals.push(opts.minSize); }
  if (opts.maxSize !== undefined)   { conds.push(`file_size <= $${i++}`);         vals.push(opts.maxSize); }
  if (opts.active !== undefined)    { conds.push(`is_active = $${i++}`);          vals.push(opts.active); }

  const where = conds.join(' AND ');
  const order = ORDER_CLAUSE[opts.sort];

  const total: number = (await pool.query(
    `SELECT COUNT(*)::int AS total FROM media_library WHERE ${where}`,
    vals
  )).rows[0].total;

  // Compute param indices before extending vals to avoid i++ evaluation-order ambiguity
  const limitParam = i;
  const offsetParam = i + 1;
  const records = (await pool.query(
    `SELECT * FROM media_library WHERE ${where} ORDER BY ${order} LIMIT $${limitParam} OFFSET $${offsetParam}`,
    [...vals, opts.limit, opts.offset]
  )).rows.map(rowToRecord);

  return { records, total };
}

// ---------------------------------------------------------------------------
// Recent uploads (used by GET /api/media/stats)
// ---------------------------------------------------------------------------

export async function getRecentUploads(limit: number): Promise<MediaRecord[]> {
  const r = await pool.query(
    `SELECT * FROM media_library WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return r.rows.map(rowToRecord);
}
```

- [ ] **Step 5: Create GET /api/media route**

Create `erp/src/app/api/media/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { listMediaFiltered, type SortOption } from '@/lib/repositories/media_repo';

const VALID_SORTS = new Set<string>([
  'newest', 'oldest', 'most_used', 'most_downloaded', 'largest', 'smallest', 'recently_used',
]);

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = request.nextUrl.searchParams;

  const page   = Math.max(1, parseInt(sp.get('page')  ?? '1',  10) || 1);
  const limit  = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '20', 10) || 20));
  const offset = (page - 1) * limit;
  const sortRaw = sp.get('sort') ?? 'newest';
  const sort = (VALID_SORTS.has(sortRaw) ? sortRaw : 'newest') as SortOption;

  const search      = sp.get('search')      ?? undefined;
  const mediaType   = sp.get('type')        ?? undefined;
  const mimeType    = sp.get('mime_type')   ?? undefined;
  const extension   = sp.get('extension')   ?? undefined;
  const module      = sp.get('module')      ?? undefined;
  const dateFrom    = sp.get('date_from')   ?? undefined;
  const dateTo      = sp.get('date_to')     ?? undefined;

  const uploadedByRaw = sp.get('uploaded_by');
  const uploadedBy = uploadedByRaw ? parseInt(uploadedByRaw, 10) : undefined;

  const minSizeRaw = sp.get('min_size');
  const maxSizeRaw = sp.get('max_size');
  const minSize = minSizeRaw ? parseInt(minSizeRaw, 10) : undefined;
  const maxSize = maxSizeRaw ? parseInt(maxSizeRaw, 10) : undefined;

  const activeRaw = sp.get('active');
  const active = activeRaw === 'true' ? true : activeRaw === 'false' ? false : undefined;

  const { records, total } = await listMediaFiltered({
    limit, offset, sort,
    search, mediaType, mimeType, extension, module, dateFrom, dateTo,
    uploadedBy: Number.isNaN(uploadedBy ?? NaN) ? undefined : uploadedBy,
    minSize:    Number.isNaN(minSize    ?? NaN) ? undefined : minSize,
    maxSize:    Number.isNaN(maxSize    ?? NaN) ? undefined : maxSize,
    active,
  });

  return NextResponse.json({ media: records, total, page, limit });
}
```

- [ ] **Step 6: Create GET /api/media/stats route**

Create `erp/src/app/api/media/stats/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getMediaStats, getRecentUploads } from '@/lib/repositories/media_repo';
import { mediaService } from '@/lib/media';

export async function GET(_request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [stats, recentUploads, storageHealth] = await Promise.all([
    getMediaStats(),
    getRecentUploads(6),
    mediaService.getStorageProvider().health().catch(() => 'OFFLINE' as const),
  ]);

  return NextResponse.json({
    totalFiles:    stats.total,
    totalSize:     stats.totalSize,
    byType:        stats.byType,
    storageHealth,
    recentUploads,
  });
}
```

- [ ] **Step 7: Create GET /api/media/:id/references stub**

Create `erp/src/app/api/media/[id]/references/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const mediaId = parseInt(id, 10);
  if (isNaN(mediaId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  // v1.0: no cross-module reference table yet. Phase 5.4C adds quick_replies.media_id.
  return NextResponse.json({ references: [] });
}
```

- [ ] **Step 8: Run tests — expect all to pass**

```bash
cd erp && npm test
```

Expected output:
```
Test Files  8 passed (8)
     Tests  76 passed (76)
```
(67 existing + ~9 new tests)

If any test fails, read the error and fix before proceeding.

- [ ] **Step 9: TypeScript check**

```bash
cd erp && npm run lint
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add erp/src/lib/repositories/media_repo.ts \
        erp/src/app/api/media/route.ts \
        erp/src/app/api/media/stats/route.ts \
        erp/src/app/api/media/[id]/references/route.ts \
        erp/tests/media-list-route.test.ts \
        erp/tests/media-stats-route.test.ts
git commit -m "feat(media): add GET /api/media (list), GET /api/media/stats, GET /api/media/:id/references"
```

---

### Task 2: Sidebar navigation — add Media Library to Control Center

**Files:**
- Modify: `erp/src/components/sidebar.tsx`

**Interfaces:**
- Consumes: nothing new — uses existing `NavItem`/`NavGroup` types already in the file
- Produces: sidebar renders `/media-library` link under Control Center

- [ ] **Step 1: Read the current sidebar**

Read `erp/src/components/sidebar.tsx` to confirm the Control Center group structure before editing.

- [ ] **Step 2: Add Images icon import**

In `erp/src/components/sidebar.tsx`, add `Images` to the lucide-react import. The current import line ends with `Bot,`. Change it to:

```typescript
import {
  LayoutDashboard,
  Users,
  ArrowDownToLine,
  ArrowUpFromLine,
  Landmark,
  Gift,
  ScrollText,
  MessageSquare,
  LogOut,
  BarChart2,
  TrendingUp,
  ShieldAlert,
  Gamepad2,
  Database,
  Megaphone,
  UserCog,
  Settings,
  Wrench,
  Bot,
  Images,
} from 'lucide-react';
```

- [ ] **Step 3: Add Media Library to Control Center group**

Find the Control Center `NavGroup` in `NAV_GROUPS`:

```typescript
  {
    title: 'Control Center',
    items: [
      { href: '/settings/bot', label: 'Telegram Bot', icon: Bot },
    ],
  },
```

Replace it with:

```typescript
  {
    title: 'Control Center',
    items: [
      { href: '/settings/bot',    label: 'Telegram Bot',  icon: Bot },
      { href: '/media-library',   label: 'Media Library', icon: Images },
    ],
  },
```

- [ ] **Step 4: TypeScript check**

```bash
cd erp && npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add erp/src/components/sidebar.tsx
git commit -m "feat(media): add Media Library link to Control Center sidebar"
```

---

### Task 3: UploadZone component

**Files:**
- Create: `erp/src/app/(dashboard)/media-library/UploadZone.tsx`

**Interfaces:**
- Consumes: `POST /api/media/upload` — returns `{ ok: boolean, media: MediaRecord, isDuplicate: boolean }` or `{ error: string }`
- Produces: `export function UploadZone({ onUploadComplete }: { onUploadComplete: () => void }): JSX.Element`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p erp/src/app/\(dashboard\)/media-library
```

- [ ] **Step 2: Create UploadZone.tsx**

Create `erp/src/app/(dashboard)/media-library/UploadZone.tsx`:

```tsx
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
```

- [ ] **Step 3: TypeScript check**

```bash
cd erp && npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add erp/src/app/\(dashboard\)/media-library/UploadZone.tsx
git commit -m "feat(media): add UploadZone component — drag & drop, click, Ctrl+V"
```

---

### Task 4: MediaCard component

**Files:**
- Create: `erp/src/app/(dashboard)/media-library/MediaCard.tsx`

**Interfaces:**
- Consumes: `MediaRecord` from `@/lib/media/types`; `GET /api/media/:id/thumbnail` (authenticated, same-origin — browser sends cookie automatically)
- Produces: `export function MediaCard({ item, selected, onClick }: { item: MediaRecord; selected: boolean; onClick: () => void }): JSX.Element`

- [ ] **Step 1: Create MediaCard.tsx**

Create `erp/src/app/(dashboard)/media-library/MediaCard.tsx`:

```tsx
'use client';

import { Image, Film, Music, FileText, File, Package, Archive } from 'lucide-react';
import type { MediaRecord } from '@/lib/media/types';

const TYPE_ICONS: Record<string, React.ElementType> = {
  IMAGE:    Image,
  GIF:      Image,
  VIDEO:    Film,
  AUDIO:    Music,
  VOICE:    Music,
  DOCUMENT: FileText,
  PDF:      FileText,
  APK:      Package,
  ZIP:      Archive,
  RAR:      Archive,
};

const TYPE_BADGE: Record<string, string> = {
  IMAGE:    'bg-blue-100 text-blue-700',
  GIF:      'bg-purple-100 text-purple-700',
  VIDEO:    'bg-red-100 text-red-700',
  AUDIO:    'bg-green-100 text-green-700',
  VOICE:    'bg-teal-100 text-teal-700',
  DOCUMENT: 'bg-gray-100 text-gray-700',
  PDF:      'bg-orange-100 text-orange-700',
  APK:      'bg-yellow-100 text-yellow-700',
  ZIP:      'bg-indigo-100 text-indigo-700',
  RAR:      'bg-indigo-100 text-indigo-700',
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function MediaCard({
  item,
  selected,
  onClick,
}: {
  item: MediaRecord;
  selected: boolean;
  onClick: () => void;
}) {
  const isVisual = item.mediaType === 'IMAGE' || item.mediaType === 'GIF';
  const Icon = TYPE_ICONS[item.mediaType] ?? File;
  const badgeClass = TYPE_BADGE[item.mediaType] ?? 'bg-gray-100 text-gray-500';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      className={`group relative cursor-pointer rounded-lg border overflow-hidden transition-all focus:outline-none focus:ring-2 focus:ring-gray-400 ${
        selected
          ? 'border-gray-900 ring-2 ring-gray-900'
          : 'border-gray-200 hover:border-gray-400 hover:shadow-sm'
      }`}
    >
      {/* Thumbnail area — square aspect ratio */}
      <div className="aspect-square bg-gray-50 flex items-center justify-center relative">
        {isVisual ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/media/${item.id}/thumbnail`}
            alt={item.displayName}
            className="w-full h-full object-cover"
            onError={e => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <Icon size={32} className="text-gray-400" />
        )}
        {/* Media type badge — bottom right */}
        <span className={`absolute bottom-1 right-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${badgeClass}`}>
          {item.mediaType}
        </span>
        {/* Archived indicator */}
        {!item.isActive && (
          <span className="absolute top-1 left-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-gray-800 text-white opacity-80">
            ARCHIVED
          </span>
        )}
      </div>

      {/* File info */}
      <div className="px-2 py-1.5 bg-white">
        <p
          className="text-xs font-medium truncate text-gray-800 leading-tight"
          title={item.displayName}
        >
          {item.displayName}
        </p>
        <p className="text-[10px] text-gray-400 mt-0.5">{formatBytes(item.fileSize)}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd erp && npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add erp/src/app/\(dashboard\)/media-library/MediaCard.tsx
git commit -m "feat(media): add MediaCard component — thumbnail, type badge, file info"
```

---

### Task 5: MediaDetailPanel component

**Files:**
- Create: `erp/src/app/(dashboard)/media-library/MediaDetailPanel.tsx`

**Interfaces:**
- Consumes:
  - `PATCH /api/media/:id` → `{ ok: true, media: MediaRecord }` — edit display_name
  - `POST /api/media/:id/replace` multipart → `{ ok: true, media: MediaRecord }`
  - `DELETE /api/media/:id` → `{ ok: true }` or `{ ok: false, error: 'REFERENCED', referenceCount: N }`
  - `POST /api/media/:id/restore` → `{ ok: true, media: MediaRecord }` (SUPER_ADMIN)
  - `DELETE /api/media/:id/permanent` → `{ ok: true }` (SUPER_ADMIN) or 403
  - `GET /api/media/:id/file?download=1` — direct link for download
  - `GET /api/media/:id/file` — streamed file for preview (same-origin auth via cookie)
- Produces:
  ```typescript
  export function MediaDetailPanel({
    item,
    onUpdated,
    onDeleted,
    onClose,
  }: {
    item: MediaRecord;
    onUpdated: (updated: MediaRecord) => void;
    onDeleted: () => void;
    onClose: () => void;
  }): JSX.Element
  ```

- [ ] **Step 1: Create MediaDetailPanel.tsx**

Create `erp/src/app/(dashboard)/media-library/MediaDetailPanel.tsx`:

```tsx
'use client';

import { useRef, useState } from 'react';
import { X, Download, RefreshCw, Archive, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { MediaRecord } from '@/lib/media/types';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function MediaDetailPanel({
  item,
  onUpdated,
  onDeleted,
  onClose,
}: {
  item: MediaRecord;
  onUpdated: (updated: MediaRecord) => void;
  onDeleted: () => void;
  onClose: () => void;
}) {
  const [displayName, setDisplayName] = useState(item.displayName);
  const [editingName, setEditingName] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const replaceRef = useRef<HTMLInputElement>(null);

  const isImage  = item.mediaType === 'IMAGE' || item.mediaType === 'GIF';
  const isVideo  = item.mediaType === 'VIDEO';
  const isPDF    = item.mediaType === 'PDF';
  const isAudio  = item.mediaType === 'AUDIO' || item.mediaType === 'VOICE';
  const isDeleted = item.deletedAt !== null;

  async function saveName() {
    const name = displayName.trim();
    if (!name) return;
    setSaving(true);
    const r = await fetch(`/api/media/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: name }),
    });
    if (r.ok) {
      const d = await r.json() as { media: MediaRecord };
      onUpdated(d.media);
      setEditingName(false);
    } else {
      setActionMsg('Save failed.');
    }
    setSaving(false);
  }

  async function replaceFile(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    setActionMsg('Replacing…');
    const r = await fetch(`/api/media/${item.id}/replace`, { method: 'POST', body: fd });
    if (r.ok) {
      const d = await r.json() as { media: MediaRecord };
      onUpdated(d.media);
      setActionMsg('File replaced.');
    } else {
      const d = await r.json().catch(() => ({})) as { error?: string };
      setActionMsg(d.error ?? 'Replace failed.');
    }
    if (replaceRef.current) replaceRef.current.value = '';
  }

  async function archive() {
    if (!confirm('Archive this file? It can be restored later.')) return;
    setActionMsg('Archiving…');
    const r = await fetch(`/api/media/${item.id}`, { method: 'DELETE' });
    if (r.ok) {
      onDeleted();
    } else {
      const d = await r.json().catch(() => ({})) as { error?: string; referenceCount?: number };
      if (d.error === 'REFERENCED') {
        setActionMsg(`Cannot archive: ${d.referenceCount ?? 0} reference(s) still active.`);
      } else {
        setActionMsg('Archive failed.');
      }
    }
  }

  async function restore() {
    setActionMsg('Restoring…');
    const r = await fetch(`/api/media/${item.id}/restore`, { method: 'POST' });
    if (r.ok) {
      const d = await r.json() as { media: MediaRecord };
      onUpdated(d.media);
      setActionMsg('Restored.');
    } else {
      setActionMsg(r.status === 403 ? 'Permission denied (SUPER_ADMIN only).' : 'Restore failed.');
    }
  }

  async function permanentDelete() {
    if (!confirm('Permanently delete this file? This CANNOT be undone.')) return;
    setActionMsg('Deleting…');
    const r = await fetch(`/api/media/${item.id}/permanent`, { method: 'DELETE' });
    if (r.ok) {
      onDeleted();
    } else if (r.status === 403) {
      setActionMsg('Permission denied (SUPER_ADMIN only).');
    } else {
      const d = await r.json().catch(() => ({})) as { error?: string };
      setActionMsg(d.error ?? 'Permanent delete failed.');
    }
  }

  return (
    <div className="rounded-lg border bg-white flex flex-col overflow-hidden" style={{ maxHeight: 'calc(100vh - 180px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50 flex-shrink-0">
        <span className="text-sm font-semibold text-gray-700 truncate flex-1 min-w-0 mr-2">
          {item.displayName}
        </span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 flex-shrink-0">
          <X size={16} />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">

        {/* Preview */}
        <div className="rounded-md bg-gray-50 border flex items-center justify-center overflow-hidden" style={{ minHeight: 140, maxHeight: 240 }}>
          {isImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/media/${item.id}/file`}
              alt={item.displayName}
              className="max-w-full max-h-60 object-contain"
            />
          )}
          {isVideo && (
            <video
              src={`/api/media/${item.id}/file`}
              controls
              className="max-w-full max-h-60"
            />
          )}
          {isAudio && (
            <audio src={`/api/media/${item.id}/file`} controls className="w-full mx-2" />
          )}
          {isPDF && (
            <iframe
              src={`/api/media/${item.id}/file`}
              title={item.displayName}
              className="w-full"
              style={{ height: 240 }}
            />
          )}
          {!isImage && !isVideo && !isAudio && !isPDF && (
            <div className="text-gray-400 text-sm py-6">{item.mediaType} — no preview</div>
          )}
        </div>

        {/* Display name */}
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">Display Name</Label>
          {editingName ? (
            <div className="flex gap-1">
              <Input
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void saveName(); if (e.key === 'Escape') { setEditingName(false); setDisplayName(item.displayName); } }}
                className="h-7 text-sm flex-1"
                autoFocus
              />
              <Button size="sm" onClick={saveName} disabled={saving}>Save</Button>
              <Button size="sm" variant="outline" onClick={() => { setEditingName(false); setDisplayName(item.displayName); }}>✕</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-800 flex-1">{item.displayName}</span>
              {!isDeleted && (
                <button
                  onClick={() => setEditingName(true)}
                  className="text-xs text-gray-400 hover:text-gray-700 flex-shrink-0"
                >
                  Edit
                </button>
              )}
            </div>
          )}
        </div>

        {/* Metadata table */}
        <div className="space-y-1.5 text-xs">
          {[
            ['Filename',    item.originalFilename],
            ['Type',        item.mediaType],
            ['MIME',        item.mimeType],
            ['Extension',   `.${item.extension}`],
            ['Size',        formatBytes(item.fileSize)],
            item.width && item.height ? ['Dimensions', `${item.width} × ${item.height}px`] : null,
            item.duration  ? ['Duration', `${item.duration}s`] : null,
            ['Uploaded',    fmtDate(item.createdAt)],
            ['Usage',       `${item.usageCount}×`],
            ['Downloads',   `${item.downloadCount}×`],
            ['References',  String(item.referenceCount)],
            item.lastUsedAt ? ['Last used', fmtDate(item.lastUsedAt)] : null,
            isDeleted ? ['Archived', fmtDate(item.deletedAt)] : null,
          ]
            .filter((row): row is [string, string] => row !== null)
            .map(([label, value]) => (
              <div key={label} className="flex justify-between gap-2">
                <span className="text-gray-400 flex-shrink-0">{label}</span>
                <span className="text-gray-700 text-right truncate max-w-[60%]" title={String(value)}>{value}</span>
              </div>
            ))
          }
        </div>

        {/* Action feedback */}
        {actionMsg && (
          <p className="text-xs text-gray-600 bg-gray-50 rounded p-2 border">{actionMsg}</p>
        )}
      </div>

      {/* Action buttons */}
      <div className="border-t p-3 space-y-2 flex-shrink-0 bg-white">
        {/* Download — always available */}
        <a
          href={`/api/media/${item.id}/file?download=1`}
          className="flex items-center gap-2 w-full rounded px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 border transition-colors"
        >
          <Download size={14} />
          Download
        </a>

        {!isDeleted && (
          <>
            {/* Replace */}
            <button
              onClick={() => replaceRef.current?.click()}
              className="flex items-center gap-2 w-full rounded px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 border transition-colors"
            >
              <RefreshCw size={14} />
              Replace File
            </button>
            <input
              ref={replaceRef}
              type="file"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) void replaceFile(file);
              }}
            />

            {/* Archive (soft delete) */}
            <button
              onClick={archive}
              className="flex items-center gap-2 w-full rounded px-3 py-1.5 text-sm text-orange-700 hover:bg-orange-50 border border-orange-200 transition-colors"
            >
              <Archive size={14} />
              Archive
            </button>
          </>
        )}

        {isDeleted && (
          <>
            {/* Restore */}
            <button
              onClick={restore}
              className="flex items-center gap-2 w-full rounded px-3 py-1.5 text-sm text-green-700 hover:bg-green-50 border border-green-200 transition-colors"
            >
              <RotateCcw size={14} />
              Restore
            </button>

            {/* Permanent delete — SUPER_ADMIN only; 403 is handled gracefully */}
            <button
              onClick={permanentDelete}
              className="flex items-center gap-2 w-full rounded px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 border border-red-200 transition-colors"
            >
              <Trash2 size={14} />
              Permanent Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd erp && npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add erp/src/app/\(dashboard\)/media-library/MediaDetailPanel.tsx
git commit -m "feat(media): add MediaDetailPanel component — preview, metadata, edit, replace, archive/restore"
```

---

### Task 6: Media Library page — assemble all components

**Files:**
- Create: `erp/src/app/(dashboard)/media-library/page.tsx`

**Interfaces:**
- Consumes: `GET /api/media/stats` → `StatsData`; `GET /api/media` → `{ media, total, page, limit }`; `UploadZone`, `MediaCard`, `MediaDetailPanel` components
- Produces: `export default function MediaLibraryPage(): JSX.Element` — the complete `/media-library` ERP page

- [ ] **Step 1: Create page.tsx**

Create `erp/src/app/(dashboard)/media-library/page.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { MediaRecord } from '@/lib/media/types';
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

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

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

  const loadStats = useCallback(async () => {
    const r = await fetch('/api/media/stats');
    if (r.ok) setStats(await r.json() as StatsData);
  }, []);

  const loadMedia = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ page: String(page), limit: String(LIMIT), sort });
    if (search)     p.set('search', search);
    if (typeFilter) p.set('type', typeFilter);
    const r = await fetch(`/api/media?${p.toString()}`);
    if (r.ok) {
      const d = await r.json() as { media: MediaRecord[]; total: number };
      setMedia(d.media);
      setTotal(d.total);
    }
    setLoading(false);
  }, [page, search, typeFilter, sort]);

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
```

- [ ] **Step 2: TypeScript check**

```bash
cd erp && npm run lint
```

Expected: no errors.

- [ ] **Step 3: Next.js build**

```bash
cd erp && npm run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully`. The output must include `/media-library` in the generated routes list. If there are any TypeScript errors, read and fix them before continuing.

- [ ] **Step 4: Verify route registration**

```bash
cd erp && npm run build 2>&1 | grep -E "media"
```

Expected to see at minimum:
```
ƒ /api/media
ƒ /api/media/[id]
ƒ /api/media/[id]/references
ƒ /api/media/stats
○ /media-library
```
(○ = static, ƒ = dynamic/SSR — the exact symbol for `/media-library` depends on whether Next.js can prerender it)

- [ ] **Step 5: Commit**

```bash
git add erp/src/app/\(dashboard\)/media-library/page.tsx
git commit -m "feat(media): add Media Library page — stats, upload, grid, filter, sort, detail panel"
```

---

### Task 7: Build Verification and Full Regression

**Files:**
- No new files. Verification only.

**Goal:** Confirm Phase 5.4B is stable: all tests pass, TypeScript clean, Next.js build succeeds, no regressions in Phase 5.4A.

- [ ] **Step 1: Run full test suite**

```bash
cd erp && npm test
```

Expected: all tests pass. The count should be at least 76 (67 from Phase 5.4A + 9 new in 5.4B). If any test fails, trace the failure and fix it before proceeding.

- [ ] **Step 2: TypeScript check**

```bash
cd erp && npm run lint
```

Expected: zero errors, zero warnings.

- [ ] **Step 3: Production build**

```bash
cd erp && npm run build
```

Expected: `✓ Compiled successfully`. Zero errors. Note the route count for the report.

- [ ] **Step 4: Architecture guard — verify no forbidden patterns in new code**

```bash
# No pool.query in new media or media-library routes
grep -rn "pool\.query" \
  erp/src/app/api/media/route.ts \
  erp/src/app/api/media/stats/route.ts \
  erp/src/app/api/media/[id]/references/route.ts
```
Expected: zero matches.

```bash
# No fs.readFile or Buffer.from base64 in new files
grep -rn "fs\.\|Buffer\.from.*base64\|\.toString('base64')" \
  erp/src/app/\(dashboard\)/media-library/
```
Expected: zero matches.

```bash
# No direct mediaService import in new UI components (components only call fetch())
grep -rn "mediaService" \
  erp/src/app/\(dashboard\)/media-library/
```
Expected: zero matches.

- [ ] **Step 5: Verify Phase 5.4A routes still exist and compile**

```bash
cd erp && npm run build 2>&1 | grep "api/media"
```

Expected to see all Phase 5.4A routes listed (upload, upload/many, [id], [id]/file, [id]/thumbnail, [id]/replace, [id]/restore, [id]/permanent) PLUS the two new 5.4B routes (media index, media/stats, media/[id]/references).

- [ ] **Step 6: Verify no regressions in Python tests**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot && python -m pytest tests/ -x --tb=short 2>&1 | tail -15
```

Expected: same 11 pre-existing failures from Phase 4.3 (\_FakeMsg.video), no new failures. If there are new failures, investigate before proceeding.

- [ ] **Step 7: Create verification commit**

```bash
git commit --allow-empty -m "chore(media): Phase 5.4B build verification — all tests pass, build clean"
```

- [ ] **Step 8: Write report**

Write the complete verification report to `.superpowers/sdd/task-7-5.4b-report.md`. Report must include:
- Test count (total passing / total tests)
- TypeScript result
- Next.js build result (compiled / route count)
- Architecture guard results (all ZERO)
- Python test result (N pre-existing failures)
- All git commits in range for Phase 5.4B
- Recommendation: READY FOR 5.4C or BLOCKED (with reason)
