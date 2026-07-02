# Phase 5.4A — Media Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the platform-wide Media Library infrastructure — schema, MediaService, StorageProvider abstraction, FilesystemProvider, and all media API routes — with zero changes to existing Live Chat, Quick Replies, or relay.

**Architecture:** A `media_library` PostgreSQL table stores metadata only; binary files live on the filesystem under `MEDIA_UPLOAD_DIR`. A `FilesystemProvider` implements the `StorageProvider` interface. `MediaServiceImpl` wraps all business logic (validate → hash/dedup → scan → write → DB insert → event). Route files call `mediaService` (module-level singleton from `@/lib/media`) — they never touch the filesystem directly. `GET /api/media/:id/file` is the stable public contract forever.

**Tech Stack:** Next.js 14 App Router, TypeScript, PostgreSQL (`pg` pool), Node.js built-ins (`crypto`, `fs/promises`, `path`), Vitest for tests.

## Global Constraints

- No changes to any existing route, Live Chat, Quick Reply, relay, or bot code — zero regressions
- `GET /api/media/:id/file` URL is stable forever; internal storage implementation may change
- Business modules must never call `fs.readFile()`, construct base64, or know `MEDIA_UPLOAD_DIR`
- `storage_key` format: `<sha256hex>.<extension>` — opaque token, only `FilesystemProvider` interprets it
- Maximum upload size: 50 MB per file
- `thumbnail_status` is always `'NONE'` in Phase 5.4A — no thumbnail generation yet (Phase 5.4B)
- All usage tracking (`recordUsage`, `recordDownload`) is fire-and-forget — must never await in a send path
- Auth pattern: read JWT from cookie, call `verifyJWT`, check `payload` — same as all existing routes
- Audit log every mutating route using `logAudit()` from `@/lib/repositories/audit_repo`
- TypeScript strict mode: no `any` unless absolutely necessary; prefer `unknown` + type guard
- Test command: `cd erp && npm test` (Vitest)
- Build command: `cd erp && npm run build`
- TypeScript check: `cd erp && npm run lint`

---

## File Map

```
CREATE  erp/migrations/027_media_library.sql
CREATE  erp/src/lib/media/types.ts
CREATE  erp/src/lib/media/storage-provider.ts
CREATE  erp/src/lib/media/filesystem-provider.ts
CREATE  erp/src/lib/repositories/media_repo.ts
CREATE  erp/src/lib/media/media-service.ts
CREATE  erp/src/lib/media/index.ts
CREATE  erp/src/app/api/media/upload/route.ts
CREATE  erp/src/app/api/media/upload/many/route.ts
CREATE  erp/src/app/api/media/[id]/route.ts
CREATE  erp/src/app/api/media/[id]/file/route.ts
CREATE  erp/src/app/api/media/[id]/thumbnail/route.ts
CREATE  erp/src/app/api/media/[id]/replace/route.ts
CREATE  erp/src/app/api/media/[id]/restore/route.ts
CREATE  erp/src/app/api/media/[id]/permanent/route.ts
CREATE  erp/tests/filesystem-provider.test.ts
CREATE  erp/tests/media-service.test.ts
MODIFY  erp/src/app/api/maintenance/health/route.ts
```

---

### Task 1: Migration 027 — media_library table

**Files:**
- Create: `erp/migrations/027_media_library.sql`

**Interfaces:**
- Produces: `media_library` table with all columns defined in the spec; `set_updated_at()` trigger function reused by later migrations

- [ ] **Step 1: Write the migration**

Create `erp/migrations/027_media_library.sql` with this exact content:

```sql
-- 027_media_library.sql
-- Platform-wide Digital Asset Management (DAM) table.
-- Binary files are never stored here — only metadata.
-- storage_key is an opaque token interpreted only by StorageProvider.

CREATE TABLE media_library (
  id                SERIAL PRIMARY KEY,

  -- Multi-tenant preparation (no logic in v1.0; NULL = default tenant)
  tenant_id         INTEGER         NULL,

  -- File identity & deduplication (SHA-256 prevents duplicate storage)
  file_hash         VARCHAR(64)     NOT NULL UNIQUE,
  storage_key       VARCHAR(500)    NOT NULL UNIQUE,
  storage_provider  VARCHAR(10)     NOT NULL DEFAULT 'LOCAL',

  -- Classification
  media_type        VARCHAR(20)     NOT NULL DEFAULT 'UNKNOWN',
  mime_type         VARCHAR(100)    NOT NULL,
  extension         VARCHAR(20)     NOT NULL,

  -- Presentation
  original_filename VARCHAR(255)    NOT NULL,
  display_name      VARCHAR(255)    NOT NULL,

  -- Dimensions & duration (NULL when not applicable)
  file_size         BIGINT          NOT NULL,
  width             INTEGER         NULL,
  height            INTEGER         NULL,
  duration          INTEGER         NULL,

  -- Thumbnail (always NONE in Phase 5.4A; Phase 5.4B adds generation)
  thumbnail_key     VARCHAR(500)    NULL,
  thumbnail_status  VARCHAR(10)     NOT NULL DEFAULT 'NONE',

  -- Extended metadata: EXIF, codec, APK package name, PDF page count, etc.
  metadata          JSONB           NOT NULL DEFAULT '{}',

  -- Usage tracking
  usage_count       INTEGER         NOT NULL DEFAULT 0,
  reference_count   INTEGER         NOT NULL DEFAULT 0,
  last_used_at      TIMESTAMPTZ     NULL,
  last_used_module  VARCHAR(50)     NULL,

  -- Download analytics
  download_count    INTEGER         NOT NULL DEFAULT 0,
  last_downloaded_at TIMESTAMPTZ   NULL,

  -- Audit
  created_by        INTEGER         REFERENCES admins(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  -- Soft delete
  is_active         BOOLEAN         NOT NULL DEFAULT TRUE,
  deleted_at        TIMESTAMPTZ     NULL,
  deleted_by        INTEGER         NULL REFERENCES admins(id) ON DELETE SET NULL,

  CONSTRAINT chk_media_storage_provider CHECK (storage_provider IN ('LOCAL','S3','R2','MINIO','NAS')),
  CONSTRAINT chk_media_type             CHECK (media_type IN ('IMAGE','GIF','VIDEO','AUDIO','VOICE','DOCUMENT','PDF','APK','ZIP','RAR','UNKNOWN')),
  CONSTRAINT chk_thumbnail_status       CHECK (thumbnail_status IN ('NONE','PENDING','READY','FAILED')),
  CONSTRAINT chk_file_size              CHECK (file_size >= 0),
  CONSTRAINT chk_width                  CHECK (width IS NULL OR width >= 0),
  CONSTRAINT chk_height                 CHECK (height IS NULL OR height >= 0),
  CONSTRAINT chk_duration               CHECK (duration IS NULL OR duration >= 0),
  CONSTRAINT chk_usage_count            CHECK (usage_count >= 0),
  CONSTRAINT chk_reference_count        CHECK (reference_count >= 0),
  CONSTRAINT chk_download_count         CHECK (download_count >= 0)
);

CREATE INDEX idx_media_tenant    ON media_library (tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_media_active    ON media_library (is_active, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_media_type      ON media_library (media_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_media_provider  ON media_library (storage_provider);

-- Reusable trigger function (shared with quick_replies in migration 028)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_media_library_updated_at
  BEFORE UPDATE ON media_library
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

- [ ] **Step 2: Apply the migration**

```bash
psql $DATABASE_URL < erp/migrations/027_media_library.sql
```

Expected: no errors. If `set_updated_at` already exists from another migration, `CREATE OR REPLACE` handles it safely.

- [ ] **Step 3: Verify the table**

```bash
psql $DATABASE_URL -c "\d media_library"
```

Expected: all columns listed, constraints visible, trigger `trg_media_library_updated_at` present.

- [ ] **Step 4: Commit**

```bash
git add erp/migrations/027_media_library.sql
git commit -m "feat(media): add migration 027 — media_library table"
```

---

### Task 2: Core types, StorageProvider interface, and FilesystemProvider

**Files:**
- Create: `erp/src/lib/media/types.ts`
- Create: `erp/src/lib/media/storage-provider.ts`
- Create: `erp/src/lib/media/filesystem-provider.ts`
- Create: `erp/tests/filesystem-provider.test.ts`

**Interfaces:**
- Produces:
  - `MediaRecord`, `MediaModule`, `MediaType`, `ThumbnailStatus`, `StorageHealth`, `RelayMediaPayload`, `SaveMediaInput`, `SaveMediaResult`, `MediaEvent`, `MediaValidationError` — all exported from `types.ts`
  - `StorageProvider` interface — exported from `storage-provider.ts`
  - `FilesystemProvider` class — exported from `filesystem-provider.ts`

- [ ] **Step 1: Write the failing tests for FilesystemProvider**

Create `erp/tests/filesystem-provider.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { FilesystemProvider } from '../src/lib/media/filesystem-provider';

let tmpDir: string;
let provider: FilesystemProvider;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-provider-test-'));
  provider = new FilesystemProvider(tmpDir);
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('FilesystemProvider', () => {
  it('saves a buffer and retrieves it', async () => {
    const buf = Buffer.from('hello-media-test');
    await provider.save('test.bin', buf, 'application/octet-stream');
    const result = await provider.get('test.bin');
    expect(result.equals(buf)).toBe(true);
  });

  it('exists() returns true after save', async () => {
    expect(await provider.exists('test.bin')).toBe(true);
  });

  it('exists() returns false for unknown key', async () => {
    expect(await provider.exists('no-such-file.bin')).toBe(false);
  });

  it('delete() removes the file', async () => {
    await provider.delete('test.bin');
    expect(await provider.exists('test.bin')).toBe(false);
  });

  it('health() returns ONLINE when the directory is writable', async () => {
    const health = await provider.health();
    expect(health).toBe('ONLINE');
  });

  it('creates the upload dir if it does not exist', async () => {
    const newDir = path.join(tmpDir, 'subdir');
    const p = new FilesystemProvider(newDir);
    await p.save('x.bin', Buffer.from('x'), 'application/octet-stream');
    expect(await p.exists('x.bin')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect failure (FilesystemProvider not yet created)**

```bash
cd erp && npm test -- filesystem-provider
```

Expected: FAIL — `Cannot find module '../src/lib/media/filesystem-provider'`

- [ ] **Step 3: Create types.ts**

Create `erp/src/lib/media/types.ts`:

```typescript
export type MediaModule =
  | 'QUICK_REPLY' | 'ANNOUNCEMENT' | 'BROADCAST' | 'BOT_MESSAGE'
  | 'APK' | 'WEBSITE' | 'BANNER' | 'PROMOTION' | 'AI';

export type StorageHealth   = 'ONLINE' | 'OFFLINE' | 'READ_ONLY';
export type ThumbnailStatus = 'NONE' | 'PENDING' | 'READY' | 'FAILED';
export type MediaType =
  | 'IMAGE' | 'GIF' | 'VIDEO' | 'AUDIO' | 'VOICE'
  | 'DOCUMENT' | 'PDF' | 'APK' | 'ZIP' | 'RAR' | 'UNKNOWN';

export interface MediaRecord {
  id: number;
  tenantId: number | null;
  fileHash: string;
  storageKey: string;
  storageProvider: string;
  mediaType: MediaType;
  mimeType: string;
  extension: string;
  originalFilename: string;
  displayName: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  thumbnailKey: string | null;
  thumbnailStatus: ThumbnailStatus;
  metadata: Record<string, unknown>;
  usageCount: number;
  referenceCount: number;
  lastUsedAt: string | null;
  lastUsedModule: MediaModule | null;
  downloadCount: number;
  lastDownloadedAt: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  deletedAt: string | null;
  deletedBy: number | null;
}

// Opaque — callers pass to relay without inspecting internals
export interface RelayMediaPayload {
  readonly _type:    'RelayMediaPayload';
  readonly version:  1;
  readonly mimeType: string;
  readonly filename: string;
  readonly data:     string; // base64 in v1.0
}

export interface SaveMediaInput {
  buffer:           Buffer;
  originalFilename: string;
  mimeType:         string;
  uploadedBy:       number;
  displayName?:     string;
}

export interface SaveMediaResult {
  record:      MediaRecord;
  isDuplicate: boolean;
}

export type MediaEvent =
  | { type: 'MEDIA_CREATED'; mediaId: number; uploadedBy: number }
  | { type: 'MEDIA_UPDATED'; mediaId: number; updatedBy: number }
  | { type: 'MEDIA_DELETED'; mediaId: number; deletedBy: number }
  | { type: 'MEDIA_USED';    mediaId: number; module: MediaModule };

export class MediaValidationError extends Error {
  constructor(
    public readonly reason: 'TOO_LARGE' | 'EXTENSION_NOT_ALLOWED' | 'MIME_NOT_ALLOWED'
  ) {
    super(reason);
    this.name = 'MediaValidationError';
  }
}
```

- [ ] **Step 4: Create storage-provider.ts**

Create `erp/src/lib/media/storage-provider.ts`:

```typescript
import type { StorageHealth } from './types';

export interface StorageProvider {
  save(key: string, buffer: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  health(): Promise<StorageHealth>;
}
```

- [ ] **Step 5: Create filesystem-provider.ts**

Create `erp/src/lib/media/filesystem-provider.ts`:

```typescript
import fs from 'fs/promises';
import path from 'path';
import type { StorageProvider } from './storage-provider';
import type { StorageHealth } from './types';

export class FilesystemProvider implements StorageProvider {
  private readonly dir: string;

  constructor(dir?: string) {
    this.dir = dir ?? process.env.MEDIA_UPLOAD_DIR ?? '/uploads/media';
  }

  private keyToPath(key: string): string {
    return path.join(this.dir, key);
  }

  async save(key: string, buffer: Buffer, _mimeType: string): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.keyToPath(key), buffer);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.keyToPath(key));
  }

  async delete(key: string): Promise<void> {
    await fs.unlink(this.keyToPath(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.keyToPath(key));
      return true;
    } catch {
      return false;
    }
  }

  async health(): Promise<StorageHealth> {
    try {
      await fs.mkdir(this.dir, { recursive: true });
      const probe = path.join(this.dir, '.health-probe');
      await fs.writeFile(probe, 'ok');
      await fs.unlink(probe);
      return 'ONLINE';
    } catch {
      return 'OFFLINE';
    }
  }
}
```

- [ ] **Step 6: Run tests — expect pass**

```bash
cd erp && npm test -- filesystem-provider
```

Expected: 6 tests PASS.

- [ ] **Step 7: TypeScript check**

```bash
cd erp && npm run lint
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add erp/src/lib/media/types.ts erp/src/lib/media/storage-provider.ts \
        erp/src/lib/media/filesystem-provider.ts erp/tests/filesystem-provider.test.ts
git commit -m "feat(media): add core types, StorageProvider interface, and FilesystemProvider"
```

---

### Task 3: MediaRepository — database queries

**Files:**
- Create: `erp/src/lib/repositories/media_repo.ts`

**Interfaces:**
- Consumes: `MediaRecord`, `MediaModule` from `@/lib/media/types`; `pool` from `@/lib/db`
- Produces (exact function signatures later tasks depend on):
  - `insertMedia(data: InsertMediaData): Promise<MediaRecord>`
  - `findMediaById(id: number): Promise<MediaRecord | null>`
  - `findMediaByHash(hash: string): Promise<MediaRecord | null>`
  - `updateMedia(id: number, data: { displayName?: string; isActive?: boolean }): Promise<MediaRecord | null>`
  - `updateMediaFile(id: number, data: UpdateMediaFileData): Promise<MediaRecord | null>`
  - `softDeleteMedia(id: number, deletedBy: number): Promise<boolean>`
  - `restoreMedia(id: number): Promise<MediaRecord | null>`
  - `hardDeleteMedia(id: number): Promise<boolean>`
  - `incrementDownloadCount(id: number): Promise<void>`
  - `incrementUsageCount(id: number, module: string): Promise<void>`

- [ ] **Step 1: Create media_repo.ts**

Create `erp/src/lib/repositories/media_repo.ts`:

```typescript
import pool from '@/lib/db';
import type { MediaRecord, MediaModule } from '@/lib/media/types';

// Maps a DB row (snake_case) to MediaRecord (camelCase)
function rowToRecord(row: Record<string, unknown>): MediaRecord {
  return {
    id:               row.id as number,
    tenantId:         row.tenant_id as number | null,
    fileHash:         row.file_hash as string,
    storageKey:       row.storage_key as string,
    storageProvider:  row.storage_provider as string,
    mediaType:        row.media_type as MediaRecord['mediaType'],
    mimeType:         row.mime_type as string,
    extension:        row.extension as string,
    originalFilename: row.original_filename as string,
    displayName:      row.display_name as string,
    fileSize:         Number(row.file_size),
    width:            row.width != null ? Number(row.width) : null,
    height:           row.height != null ? Number(row.height) : null,
    duration:         row.duration != null ? Number(row.duration) : null,
    thumbnailKey:     row.thumbnail_key as string | null,
    thumbnailStatus:  row.thumbnail_status as MediaRecord['thumbnailStatus'],
    metadata:         (row.metadata ?? {}) as Record<string, unknown>,
    usageCount:       Number(row.usage_count),
    referenceCount:   Number(row.reference_count),
    lastUsedAt:       row.last_used_at as string | null,
    lastUsedModule:   row.last_used_module as MediaModule | null,
    downloadCount:    Number(row.download_count),
    lastDownloadedAt: row.last_downloaded_at as string | null,
    createdBy:        row.created_by != null ? Number(row.created_by) : null,
    createdAt:        row.created_at as string,
    updatedAt:        row.updated_at as string,
    isActive:         row.is_active as boolean,
    deletedAt:        row.deleted_at as string | null,
    deletedBy:        row.deleted_by != null ? Number(row.deleted_by) : null,
  };
}

interface InsertMediaData {
  fileHash: string;
  storageKey: string;
  storageProvider: string;
  mediaType: string;
  mimeType: string;
  extension: string;
  originalFilename: string;
  displayName: string;
  fileSize: number;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  metadata?: Record<string, unknown>;
  createdBy: number;
}

export async function insertMedia(data: InsertMediaData): Promise<MediaRecord> {
  const r = await pool.query(
    `INSERT INTO media_library (
       file_hash, storage_key, storage_provider, media_type, mime_type, extension,
       original_filename, display_name, file_size, width, height, duration,
       metadata, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      data.fileHash, data.storageKey, data.storageProvider, data.mediaType,
      data.mimeType, data.extension, data.originalFilename, data.displayName,
      data.fileSize,
      data.width ?? null, data.height ?? null, data.duration ?? null,
      JSON.stringify(data.metadata ?? {}),
      data.createdBy,
    ]
  );
  return rowToRecord(r.rows[0]);
}

export async function findMediaById(id: number): Promise<MediaRecord | null> {
  const r = await pool.query(`SELECT * FROM media_library WHERE id = $1`, [id]);
  return r.rows[0] ? rowToRecord(r.rows[0]) : null;
}

export async function findMediaByHash(hash: string): Promise<MediaRecord | null> {
  const r = await pool.query(
    `SELECT * FROM media_library WHERE file_hash = $1`,
    [hash]
  );
  return r.rows[0] ? rowToRecord(r.rows[0]) : null;
}

export async function updateMedia(
  id: number,
  data: { displayName?: string; isActive?: boolean }
): Promise<MediaRecord | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (data.displayName !== undefined) {
    sets.push(`display_name = $${i++}`);
    vals.push(data.displayName);
  }
  if (data.isActive !== undefined) {
    sets.push(`is_active = $${i++}`);
    vals.push(data.isActive);
  }
  if (sets.length === 0) return findMediaById(id);
  vals.push(id);
  const r = await pool.query(
    `UPDATE media_library SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals
  );
  return r.rows[0] ? rowToRecord(r.rows[0]) : null;
}

interface UpdateMediaFileData {
  fileHash: string;
  storageKey: string;
  fileSize: number;
  originalFilename: string;
  mimeType: string;
  extension: string;
  mediaType: string;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  metadata?: Record<string, unknown>;
}

export async function updateMediaFile(
  id: number,
  data: UpdateMediaFileData
): Promise<MediaRecord | null> {
  const r = await pool.query(
    `UPDATE media_library
     SET file_hash = $2, storage_key = $3, file_size = $4, original_filename = $5,
         mime_type = $6, extension = $7, media_type = $8,
         width = $9, height = $10, duration = $11, metadata = $12,
         thumbnail_status = 'NONE', thumbnail_key = NULL
     WHERE id = $1
     RETURNING *`,
    [
      id, data.fileHash, data.storageKey, data.fileSize, data.originalFilename,
      data.mimeType, data.extension, data.mediaType,
      data.width ?? null, data.height ?? null, data.duration ?? null,
      JSON.stringify(data.metadata ?? {}),
    ]
  );
  return r.rows[0] ? rowToRecord(r.rows[0]) : null;
}

export async function softDeleteMedia(
  id: number,
  deletedBy: number
): Promise<boolean> {
  const r = await pool.query(
    `UPDATE media_library
     SET deleted_at = NOW(), deleted_by = $2, is_active = false
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id`,
    [id, deletedBy]
  );
  return r.rows.length > 0;
}

export async function restoreMedia(id: number): Promise<MediaRecord | null> {
  const r = await pool.query(
    `UPDATE media_library
     SET deleted_at = NULL, deleted_by = NULL, is_active = true
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  return r.rows[0] ? rowToRecord(r.rows[0]) : null;
}

export async function hardDeleteMedia(id: number): Promise<boolean> {
  const r = await pool.query(
    `DELETE FROM media_library
     WHERE id = $1 AND reference_count = 0 AND deleted_at IS NOT NULL
     RETURNING id`,
    [id]
  );
  return r.rows.length > 0;
}

export async function incrementDownloadCount(id: number): Promise<void> {
  await pool.query(
    `UPDATE media_library
     SET download_count = download_count + 1, last_downloaded_at = NOW()
     WHERE id = $1`,
    [id]
  );
}

export async function incrementUsageCount(
  id: number,
  module: string
): Promise<void> {
  await pool.query(
    `UPDATE media_library
     SET usage_count = usage_count + 1, last_used_at = NOW(), last_used_module = $2
     WHERE id = $1`,
    [id, module]
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
git add erp/src/lib/repositories/media_repo.ts
git commit -m "feat(media): add MediaRepository — all media_library DB queries"
```

---

### Task 4: MediaService implementation + barrel export + tests

**Files:**
- Create: `erp/src/lib/media/media-service.ts`
- Create: `erp/src/lib/media/index.ts`
- Create: `erp/tests/media-service.test.ts`

**Interfaces:**
- Consumes: all types from `@/lib/media/types`; all functions from `@/lib/repositories/media_repo`; `StorageProvider` from `./storage-provider`; `FilesystemProvider` from `./filesystem-provider`
- Produces:
  - `MediaServiceImpl` class with methods: `save`, `saveMany`, `getBuffer`, `getForRelay`, `getPreview`, `replace`, `softDelete`, `permanentDelete`, `recordUsage`, `recordDownload`, `restore`, `on`, `off`, `getStorageProvider`
  - `mediaService` singleton exported from `@/lib/media` (used by all route files)

- [ ] **Step 1: Write the failing media-service tests**

Create `erp/tests/media-service.test.ts`:

```typescript
// vi.mock() is hoisted above all static imports by Vitest's transformer,
// so media_repo is mocked before media-service.ts tries to import it.
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

// Mock DB repository — prevents pool connection attempts in test environment
vi.mock('@/lib/repositories/media_repo', () => ({
  insertMedia: vi.fn(),
  findMediaById: vi.fn(),
  findMediaByHash: vi.fn(),
  updateMedia: vi.fn(),
  updateMediaFile: vi.fn(),
  softDeleteMedia: vi.fn(),
  restoreMedia: vi.fn(),
  hardDeleteMedia: vi.fn(),
  incrementDownloadCount: vi.fn(),
  incrementUsageCount: vi.fn(),
}));

import { FilesystemProvider } from '../src/lib/media/filesystem-provider';
import { MediaServiceImpl } from '../src/lib/media/media-service';
import { MediaValidationError } from '../src/lib/media/types';
import * as repo from '@/lib/repositories/media_repo';

let tmpDir: string;

const mockRecord = {
  id: 1, tenantId: null, fileHash: 'abc123', storageKey: 'abc123.jpg',
  storageProvider: 'LOCAL', mediaType: 'IMAGE' as const, mimeType: 'image/jpeg',
  extension: 'jpg', originalFilename: 'photo.jpg', displayName: 'photo.jpg',
  fileSize: 14, width: null, height: null, duration: null, thumbnailKey: null,
  thumbnailStatus: 'NONE' as const, metadata: {}, usageCount: 0, referenceCount: 0,
  lastUsedAt: null, lastUsedModule: null, downloadCount: 0, lastDownloadedAt: null,
  createdBy: 1, createdAt: '2026-07-02T00:00:00Z', updatedAt: '2026-07-02T00:00:00Z',
  isActive: true, deletedAt: null, deletedBy: null,
};

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'media-svc-test-'));
  vi.mocked(repo.findMediaByHash).mockResolvedValue(null);
  vi.mocked(repo.insertMedia).mockResolvedValue(mockRecord);
  vi.mocked(repo.findMediaById).mockResolvedValue(mockRecord);
  vi.mocked(repo.softDeleteMedia).mockResolvedValue(true);
  vi.mocked(repo.hardDeleteMedia).mockResolvedValue(true);
  vi.mocked(repo.incrementDownloadCount).mockResolvedValue();
  vi.mocked(repo.incrementUsageCount).mockResolvedValue();
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('MediaServiceImpl validation', () => {
  it('throws TOO_LARGE for a file over 50 MB', async () => {
    const service = new MediaServiceImpl(new FilesystemProvider(tmpDir));
    const bigBuffer = Buffer.alloc(51 * 1024 * 1024);
    await expect(
      service.save({ buffer: bigBuffer, originalFilename: 'big.jpg', mimeType: 'image/jpeg', uploadedBy: 1 })
    ).rejects.toMatchObject({ reason: 'TOO_LARGE' });
  });

  it('throws EXTENSION_NOT_ALLOWED for .exe', async () => {
    const service = new MediaServiceImpl(new FilesystemProvider(tmpDir));
    await expect(
      service.save({ buffer: Buffer.from('x'), originalFilename: 'virus.exe', mimeType: 'application/octet-stream', uploadedBy: 1 })
    ).rejects.toMatchObject({ reason: 'EXTENSION_NOT_ALLOWED' });
  });

  it('throws MIME_NOT_ALLOWED for unknown MIME type', async () => {
    const service = new MediaServiceImpl(new FilesystemProvider(tmpDir));
    await expect(
      service.save({ buffer: Buffer.from('x'), originalFilename: 'file.jpg', mimeType: 'application/x-custom-12345', uploadedBy: 1 })
    ).rejects.toMatchObject({ reason: 'MIME_NOT_ALLOWED' });
  });

  it('MediaValidationError is an instance of Error', () => {
    const e = new MediaValidationError('TOO_LARGE');
    expect(e).toBeInstanceOf(Error);
    expect(e.reason).toBe('TOO_LARGE');
    expect(e.name).toBe('MediaValidationError');
  });
});

describe('MediaServiceImpl save', () => {
  it('saves a valid JPEG and returns isDuplicate=false', async () => {
    const service = new MediaServiceImpl(new FilesystemProvider(tmpDir));
    vi.mocked(repo.findMediaByHash).mockResolvedValueOnce(null);
    const result = await service.save({
      buffer: Buffer.from('fake-jpeg'),
      originalFilename: 'photo.jpg',
      mimeType: 'image/jpeg',
      uploadedBy: 1,
    });
    expect(result.isDuplicate).toBe(false);
    expect(result.record.mediaType).toBe('IMAGE');
  });

  it('returns isDuplicate=true when file_hash already exists', async () => {
    const service = new MediaServiceImpl(new FilesystemProvider(tmpDir));
    vi.mocked(repo.findMediaByHash).mockResolvedValueOnce(mockRecord);
    const result = await service.save({
      buffer: Buffer.from('duplicate'),
      originalFilename: 'dup.jpg',
      mimeType: 'image/jpeg',
      uploadedBy: 1,
    });
    expect(result.isDuplicate).toBe(true);
    expect(result.record.id).toBe(1);
  });
});

describe('MediaServiceImpl getForRelay', () => {
  it('returns a RelayMediaPayload with version=1', async () => {
    const service = new MediaServiceImpl(new FilesystemProvider(tmpDir));
    // Write a test file to the tmp dir so getBuffer can read it
    await fs.writeFile(path.join(tmpDir, 'abc123.jpg'), Buffer.from('fake-image-bytes'));
    vi.mocked(repo.findMediaById).mockResolvedValueOnce(mockRecord);
    const payload = await service.getForRelay(1);
    expect(payload).not.toBeNull();
    expect(payload!._type).toBe('RelayMediaPayload');
    expect(payload!.version).toBe(1);
    expect(typeof payload!.data).toBe('string');
    // data is base64 of 'fake-image-bytes'
    expect(Buffer.from(payload!.data, 'base64').toString()).toBe('fake-image-bytes');
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd erp && npm test -- media-service
```

Expected: FAIL — `Cannot find module '../src/lib/media/media-service'`

- [ ] **Step 3: Create media-service.ts**

Create `erp/src/lib/media/media-service.ts`:

```typescript
import crypto from 'crypto';
import type { StorageProvider } from './storage-provider';
import type {
  MediaRecord, MediaModule, SaveMediaInput, SaveMediaResult,
  RelayMediaPayload, MediaEvent, MediaType,
} from './types';
import { MediaValidationError } from './types';
import {
  insertMedia, findMediaById, findMediaByHash,
  updateMedia, updateMediaFile, softDeleteMedia,
  restoreMedia, hardDeleteMedia,
  incrementDownloadCount, incrementUsageCount,
} from '@/lib/repositories/media_repo';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const ALLOWED_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff',
  'gif',
  'mp4', 'mov', 'avi', 'mkv', 'webm',
  'mp3', 'ogg', 'wav', 'flac', 'm4a', 'aac',
  'pdf',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv',
  'apk',
  'zip',
  'rar',
]);

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff',
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/flac', 'audio/mp4', 'audio/aac',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv',
  'application/vnd.android.package-archive',
  'application/zip', 'application/x-zip-compressed',
  'application/x-rar-compressed', 'application/vnd.rar',
]);

function mimeToMediaType(mime: string, ext: string): MediaType {
  if (mime === 'image/gif') return 'GIF';
  if (mime.startsWith('image/')) return 'IMAGE';
  if (mime.startsWith('video/')) return 'VIDEO';
  // OGG audio from Telegram voice messages
  if (mime === 'audio/ogg' && ext === 'ogg') return 'VOICE';
  if (mime.startsWith('audio/')) return 'AUDIO';
  if (mime === 'application/pdf') return 'PDF';
  if (mime === 'application/vnd.android.package-archive') return 'APK';
  if (['application/zip', 'application/x-zip-compressed'].includes(mime)) return 'ZIP';
  if (['application/x-rar-compressed', 'application/vnd.rar'].includes(mime)) return 'RAR';
  if (mime.startsWith('application/') || mime.startsWith('text/')) return 'DOCUMENT';
  return 'UNKNOWN';
}

type EventHandler = (e: MediaEvent) => void;

export class MediaServiceImpl {
  private readonly handlers = new Map<MediaEvent['type'], EventHandler[]>();

  constructor(private readonly storage: StorageProvider) {}

  on(event: MediaEvent['type'], handler: EventHandler): void {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
  }

  off(event: MediaEvent['type'], handler: EventHandler): void {
    this.handlers.set(event, (this.handlers.get(event) ?? []).filter(h => h !== handler));
  }

  private emit(event: MediaEvent): void {
    for (const h of (this.handlers.get(event.type) ?? [])) {
      try { h(event); } catch { /* event errors must not propagate */ }
    }
  }

  private validate(input: SaveMediaInput): void {
    if (input.buffer.length > MAX_FILE_SIZE) throw new MediaValidationError('TOO_LARGE');
    const ext = (input.originalFilename.split('.').pop() ?? '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) throw new MediaValidationError('EXTENSION_NOT_ALLOWED');
    if (!ALLOWED_MIME_TYPES.has(input.mimeType)) throw new MediaValidationError('MIME_NOT_ALLOWED');
  }

  private sha256(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  // v1.0: no-op scan — hook for future virus scanner (ClamAV, cloud AV)
  private scan(_buffer: Buffer): 'PASS' | 'FAIL' {
    return 'PASS';
  }

  async save(input: SaveMediaInput): Promise<SaveMediaResult> {
    this.validate(input);
    const hash = this.sha256(input.buffer);

    // Dedup: return existing record without writing to disk
    const existing = await findMediaByHash(hash);
    if (existing) return { record: existing, isDuplicate: true };

    if (this.scan(input.buffer) === 'FAIL') throw new Error('SCAN_FAILED');

    const ext = (input.originalFilename.split('.').pop() ?? 'bin').toLowerCase();
    const key = `${hash}.${ext}`;
    await this.storage.save(key, input.buffer, input.mimeType);

    const record = await insertMedia({
      fileHash:         hash,
      storageKey:       key,
      storageProvider:  'LOCAL',
      mediaType:        mimeToMediaType(input.mimeType, ext),
      mimeType:         input.mimeType,
      extension:        ext,
      originalFilename: input.originalFilename,
      displayName:      input.displayName ?? input.originalFilename,
      fileSize:         input.buffer.length,
      createdBy:        input.uploadedBy,
    });

    this.emit({ type: 'MEDIA_CREATED', mediaId: record.id, uploadedBy: input.uploadedBy });
    return { record, isDuplicate: false };
  }

  async saveMany(inputs: SaveMediaInput[]): Promise<SaveMediaResult[]> {
    const results: SaveMediaResult[] = [];
    for (const input of inputs) {
      results.push(await this.save(input));
    }
    return results;
  }

  async getBuffer(
    id: number
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string } | null> {
    const record = await findMediaById(id);
    if (!record || record.deletedAt) return null;
    const buffer = await this.storage.get(record.storageKey).catch(() => null);
    if (!buffer) return null;
    return { buffer, mimeType: record.mimeType, filename: record.originalFilename };
  }

  async getForRelay(id: number): Promise<RelayMediaPayload | null> {
    const result = await this.getBuffer(id);
    if (!result) return null;
    return {
      _type:    'RelayMediaPayload',
      version:  1,
      mimeType: result.mimeType,
      filename: result.filename,
      data:     result.buffer.toString('base64'),
    };
  }

  // Phase 5.4A: thumbnail_status is always NONE — falls back to original
  async getPreview(
    id: number
  ): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const result = await this.getBuffer(id);
    if (!result) return null;
    return { buffer: result.buffer, mimeType: result.mimeType };
  }

  async replace(id: number, input: SaveMediaInput): Promise<MediaRecord> {
    this.validate(input);
    if (this.scan(input.buffer) === 'FAIL') throw new Error('SCAN_FAILED');

    const hash = this.sha256(input.buffer);
    const ext = (input.originalFilename.split('.').pop() ?? 'bin').toLowerCase();
    const key = `${hash}.${ext}`;
    await this.storage.save(key, input.buffer, input.mimeType);

    const record = await updateMediaFile(id, {
      fileHash:         hash,
      storageKey:       key,
      fileSize:         input.buffer.length,
      originalFilename: input.originalFilename,
      mimeType:         input.mimeType,
      extension:        ext,
      mediaType:        mimeToMediaType(input.mimeType, ext),
    });
    if (!record) throw new Error('NOT_FOUND');

    this.emit({ type: 'MEDIA_UPDATED', mediaId: id, updatedBy: input.uploadedBy });
    return record;
  }

  // Returns false (and does NOT delete) if reference_count > 0
  async softDelete(id: number, deletedBy: number): Promise<boolean> {
    const record = await findMediaById(id);
    if (!record) return false;
    if (record.referenceCount > 0) return false;
    const ok = await softDeleteMedia(id, deletedBy);
    if (ok) this.emit({ type: 'MEDIA_DELETED', mediaId: id, deletedBy });
    return ok;
  }

  // SUPER_ADMIN only: requires deleted_at IS NOT NULL AND reference_count == 0
  async permanentDelete(id: number, deletedBy: number): Promise<boolean> {
    const record = await findMediaById(id);
    if (!record || !record.deletedAt || record.referenceCount > 0) return false;
    await this.storage.delete(record.storageKey).catch(() => {});
    const ok = await hardDeleteMedia(id);
    if (ok) this.emit({ type: 'MEDIA_DELETED', mediaId: id, deletedBy });
    return ok;
  }

  async restore(id: number): Promise<MediaRecord | null> {
    return restoreMedia(id);
  }

  // Fire-and-forget — must never block callers
  recordUsage(id: number, module: MediaModule): void {
    incrementUsageCount(id, module).catch(() => {});
  }

  // Fire-and-forget — must never block callers
  recordDownload(id: number): void {
    incrementDownloadCount(id).catch(() => {});
  }

  getStorageProvider(): StorageProvider {
    return this.storage;
  }

  update(
    id: number,
    data: { displayName?: string; isActive?: boolean }
  ): Promise<MediaRecord | null> {
    return updateMedia(id, data);
  }
}
```

- [ ] **Step 4: Create index.ts (barrel + singleton)**

Create `erp/src/lib/media/index.ts`:

```typescript
import { FilesystemProvider } from './filesystem-provider';
import { MediaServiceImpl } from './media-service';

export { FilesystemProvider } from './filesystem-provider';
export type { StorageProvider } from './storage-provider';
export { MediaServiceImpl } from './media-service';
export * from './types';

// Module-level singleton — created once at server startup
const storageProvider = new FilesystemProvider();
export const mediaService = new MediaServiceImpl(storageProvider);
```

- [ ] **Step 5: Run tests — expect pass**

```bash
cd erp && npm test -- media-service
```

Expected: all tests PASS.

- [ ] **Step 6: TypeScript check**

```bash
cd erp && npm run lint
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add erp/src/lib/media/media-service.ts erp/src/lib/media/index.ts \
        erp/tests/media-service.test.ts
git commit -m "feat(media): add MediaService implementation, barrel export, and tests"
```

---

### Task 5: Upload routes — POST /api/media/upload and /upload/many

**Files:**
- Create: `erp/src/app/api/media/upload/route.ts`
- Create: `erp/src/app/api/media/upload/many/route.ts`

**Interfaces:**
- Consumes: `mediaService` from `@/lib/media`; `MediaValidationError` from `@/lib/media/types`; `logAudit` from `@/lib/repositories/audit_repo`; `verifyJWT`, `COOKIE_NAME` from `@/lib/auth`
- Produces:
  - `POST /api/media/upload` → `{ ok: true, media: MediaRecord, isDuplicate: boolean }` or `{ error: string }`
  - `POST /api/media/upload/many` → `{ ok: true, results: Array<{ media: MediaRecord, isDuplicate: boolean }> }` or `{ error: string }`

- [ ] **Step 1: Create the single-file upload route**

Create `erp/src/app/api/media/upload/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { mediaService, MediaValidationError } from '@/lib/media';
import { logAudit } from '@/lib/repositories/audit_repo';

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const displayName = formData.get('display_name');
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const result = await mediaService.save({
      buffer,
      originalFilename: file.name,
      mimeType:         file.type || 'application/octet-stream',
      uploadedBy:       payload.sub,
      displayName:      typeof displayName === 'string' ? displayName : undefined,
    });

    logAudit({
      admin_id:    payload.sub,
      action:      'MEDIA_UPLOAD',
      target_type: 'media',
      target_id:   result.record.id,
      new_value:   {
        filename:    file.name,
        size:        buffer.length,
        isDuplicate: result.isDuplicate,
      },
    }).catch(() => {});

    return NextResponse.json({ ok: true, media: result.record, isDuplicate: result.isDuplicate });
  } catch (err) {
    if (err instanceof MediaValidationError) {
      return NextResponse.json({ error: err.reason }, { status: 422 });
    }
    console.error('[media/upload]', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create the batch upload route**

Create `erp/src/app/api/media/upload/many/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { mediaService, MediaValidationError } from '@/lib/media';
import { logAudit } from '@/lib/repositories/audit_repo';

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 });
  }

  const files = formData.getAll('files');
  if (files.length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }
  if (files.length > 20) {
    return NextResponse.json({ error: 'Maximum 20 files per batch' }, { status: 422 });
  }

  const results: Array<{ media: object; isDuplicate: boolean } | { error: string; filename: string }> = [];

  for (const file of files) {
    if (!(file instanceof File)) continue;
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      const result = await mediaService.save({
        buffer,
        originalFilename: file.name,
        mimeType:         file.type || 'application/octet-stream',
        uploadedBy:       payload.sub,
      });
      results.push({ media: result.record, isDuplicate: result.isDuplicate });
    } catch (err) {
      if (err instanceof MediaValidationError) {
        results.push({ error: err.reason, filename: file.name });
      } else {
        results.push({ error: 'Upload failed', filename: file.name });
      }
    }
  }

  logAudit({
    admin_id:    payload.sub,
    action:      'MEDIA_UPLOAD',
    target_type: 'media',
    new_value:   { batch: true, count: files.length },
  }).catch(() => {});

  return NextResponse.json({ ok: true, results });
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd erp && npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add erp/src/app/api/media/upload/route.ts \
        erp/src/app/api/media/upload/many/route.ts
git commit -m "feat(media): add upload API — POST /api/media/upload and /upload/many"
```

---

### Task 6: File serving routes — GET /api/media/[id]/file and /thumbnail

**Files:**
- Create: `erp/src/app/api/media/[id]/file/route.ts`
- Create: `erp/src/app/api/media/[id]/thumbnail/route.ts`

**Interfaces:**
- Consumes: `mediaService` from `@/lib/media`; `verifyJWT`, `COOKIE_NAME` from `@/lib/auth`
- Produces:
  - `GET /api/media/:id/file?download=1` → binary stream with `Content-Type`, `Content-Length`, `Content-Disposition` (attachment if `?download=1`, else inline), `ETag`, `Cache-Control: public, max-age=31536000, immutable`, `Last-Modified`
  - `GET /api/media/:id/thumbnail` → same headers; Phase 5.4A falls back to original file since thumbnail_status is always NONE

- [ ] **Step 1: Create the file serving route**

Create `erp/src/app/api/media/[id]/file/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { mediaService } from '@/lib/media';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const mediaId = parseInt(id, 10);
  if (isNaN(mediaId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const result = await mediaService.getBuffer(mediaId);
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Increment download count without blocking the response
  mediaService.recordDownload(mediaId);

  const forceDownload = request.nextUrl.searchParams.get('download') === '1';
  const disposition = forceDownload
    ? `attachment; filename="${encodeURIComponent(result.filename)}"`
    : `inline; filename="${encodeURIComponent(result.filename)}"`;

  // ETag = first 32 chars of storage key (contains sha256)
  // Cache-Control: immutable because content-addressed files never change
  return new NextResponse(result.buffer, {
    status: 200,
    headers: {
      'Content-Type':        result.mimeType,
      'Content-Length':      String(result.buffer.length),
      'Content-Disposition': disposition,
      'ETag':                `"${result.filename.split('.')[0].slice(0, 32)}"`,
      'Cache-Control':       'public, max-age=31536000, immutable',
      'Last-Modified':       new Date().toUTCString(),
    },
  });
}
```

- [ ] **Step 2: Create the thumbnail route**

Create `erp/src/app/api/media/[id]/thumbnail/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { mediaService } from '@/lib/media';

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

  // Phase 5.4A: thumbnail_status always NONE — getPreview returns original file
  const result = await mediaService.getPreview(mediaId);
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return new NextResponse(result.buffer, {
    status: 200,
    headers: {
      'Content-Type':  result.mimeType,
      'Content-Length': String(result.buffer.length),
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd erp && npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add erp/src/app/api/media/[id]/file/route.ts \
        erp/src/app/api/media/[id]/thumbnail/route.ts
git commit -m "feat(media): add file serving routes — GET /api/media/[id]/file and /thumbnail"
```

---

### Task 7: Management routes — metadata, PATCH, DELETE, replace, restore, permanent delete

**Files:**
- Create: `erp/src/app/api/media/[id]/route.ts`
- Create: `erp/src/app/api/media/[id]/replace/route.ts`
- Create: `erp/src/app/api/media/[id]/restore/route.ts`
- Create: `erp/src/app/api/media/[id]/permanent/route.ts`

**Interfaces:**
- Consumes: `mediaService` (with `.softDelete`, `.permanentDelete`, `.replace`, `.restore`, `.update`, `.getStorageProvider`) from `@/lib/media`; `MediaValidationError` from `@/lib/media/types`; `findMediaById` from `@/lib/repositories/media_repo`; `logAudit`; auth
- Produces:
  - `GET /api/media/:id` → `{ media: MediaRecord }`
  - `PATCH /api/media/:id` → `{ ok: true, media: MediaRecord }`
  - `DELETE /api/media/:id` → `{ ok: true }` or `{ ok: false, error: 'REFERENCED', referenceCount: N }`
  - `POST /api/media/:id/replace` → `{ ok: true, media: MediaRecord }`
  - `POST /api/media/:id/restore` → `{ ok: true, media: MediaRecord }` (SUPER_ADMIN only)
  - `DELETE /api/media/:id/permanent` → `{ ok: true }` (SUPER_ADMIN only)

- [ ] **Step 1: Create [id]/route.ts — GET metadata, PATCH display_name/is_active, DELETE soft**

Create `erp/src/app/api/media/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { mediaService } from '@/lib/media';
import { findMediaById } from '@/lib/repositories/media_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

async function getAdminPayload() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  return token ? verifyJWT(token) : null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await getAdminPayload();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const mediaId = parseInt(id, 10);
  if (isNaN(mediaId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const media = await findMediaById(mediaId);
  if (!media || media.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ media });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await getAdminPayload();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const mediaId = parseInt(id, 10);
  if (isNaN(mediaId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const updates: { displayName?: string; isActive?: boolean } = {};
  if (typeof body.display_name === 'string') updates.displayName = body.display_name;
  if (typeof body.is_active === 'boolean') updates.isActive = body.is_active;

  const media = await mediaService.update(mediaId, updates);
  if (!media) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  logAudit({
    admin_id:    payload.sub,
    action:      'MEDIA_UPDATED',
    target_type: 'media',
    target_id:   mediaId,
    new_value:   updates as Record<string, unknown>,
  }).catch(() => {});

  return NextResponse.json({ ok: true, media });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await getAdminPayload();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const mediaId = parseInt(id, 10);
  if (isNaN(mediaId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  // Check reference_count before attempting delete
  const media = await findMediaById(mediaId);
  if (!media) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (media.referenceCount > 0) {
    return NextResponse.json(
      { ok: false, error: 'REFERENCED', referenceCount: media.referenceCount },
      { status: 409 }
    );
  }

  const ok = await mediaService.softDelete(mediaId, payload.sub);
  if (!ok) return NextResponse.json({ error: 'Delete failed' }, { status: 500 });

  logAudit({
    admin_id:    payload.sub,
    action:      'MEDIA_SOFT_DELETE',
    target_type: 'media',
    target_id:   mediaId,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Create [id]/replace/route.ts**

Create `erp/src/app/api/media/[id]/replace/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { mediaService, MediaValidationError } from '@/lib/media';
import { logAudit } from '@/lib/repositories/audit_repo';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const mediaId = parseInt(id, 10);
  if (isNaN(mediaId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const media = await mediaService.replace(mediaId, {
      buffer,
      originalFilename: file.name,
      mimeType:         file.type || 'application/octet-stream',
      uploadedBy:       payload.sub,
    });

    logAudit({
      admin_id:    payload.sub,
      action:      'MEDIA_REPLACE',
      target_type: 'media',
      target_id:   mediaId,
      new_value:   { filename: file.name, size: buffer.length },
    }).catch(() => {});

    return NextResponse.json({ ok: true, media });
  } catch (err) {
    if (err instanceof MediaValidationError) {
      return NextResponse.json({ error: err.reason }, { status: 422 });
    }
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    console.error('[media/replace]', err);
    return NextResponse.json({ error: 'Replace failed' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create [id]/restore/route.ts (SUPER_ADMIN only)**

Create `erp/src/app/api/media/[id]/restore/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { mediaService } from '@/lib/media';
import { logAudit } from '@/lib/repositories/audit_repo';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (payload.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const mediaId = parseInt(id, 10);
  if (isNaN(mediaId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const media = await mediaService.restore(mediaId);
  if (!media) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  logAudit({
    admin_id:    payload.sub,
    action:      'MEDIA_RESTORE',
    target_type: 'media',
    target_id:   mediaId,
  }).catch(() => {});

  return NextResponse.json({ ok: true, media });
}
```

- [ ] **Step 4: Create [id]/permanent/route.ts (SUPER_ADMIN only)**

Create `erp/src/app/api/media/[id]/permanent/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { mediaService } from '@/lib/media';
import { logAudit } from '@/lib/repositories/audit_repo';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (payload.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const mediaId = parseInt(id, 10);
  if (isNaN(mediaId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  // permanentDelete requires: deleted_at IS NOT NULL AND reference_count == 0
  const ok = await mediaService.permanentDelete(mediaId, payload.sub);
  if (!ok) {
    return NextResponse.json(
      { error: 'Cannot permanently delete: must be soft-deleted first and have no references' },
      { status: 409 }
    );
  }

  logAudit({
    admin_id:    payload.sub,
    action:      'MEDIA_PERMANENT_DELETE',
    target_type: 'media',
    target_id:   mediaId,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: TypeScript check**

```bash
cd erp && npm run lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add erp/src/app/api/media/[id]/route.ts \
        erp/src/app/api/media/[id]/replace/route.ts \
        erp/src/app/api/media/[id]/restore/route.ts \
        erp/src/app/api/media/[id]/permanent/route.ts
git commit -m "feat(media): add management routes — GET/PATCH/DELETE [id], replace, restore, permanent delete"
```

---

### Task 8: Storage health integration into the health dashboard

**Files:**
- Modify: `erp/src/app/api/maintenance/health/route.ts`

**Interfaces:**
- Consumes: `mediaService` from `@/lib/media`; existing `checkDatabase()`, `checkRelay()` helpers
- Produces: `GET /api/maintenance/health` now returns `checks.storage: { ok: boolean, status: StorageHealth }`

- [ ] **Step 1: Read the current health route**

Read `erp/src/app/api/maintenance/health/route.ts` to confirm the current shape before editing.

- [ ] **Step 2: Update the health route**

Edit `erp/src/app/api/maintenance/health/route.ts` — replace the entire file:

```typescript
import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { mediaService } from '@/lib/media';
import type { StorageHealth } from '@/lib/media/types';

const BOT_RELAY_URL        = process.env.BOT_RELAY_URL        ?? 'http://localhost:8090';
const BOT_RELAY_AUTH_TOKEN = process.env.BOT_RELAY_AUTH_TOKEN ?? 'change_me_relay_token';

export async function GET() {
  const [dbCheck, relayCheck, storageCheck] = await Promise.all([
    checkDatabase(),
    checkRelay(),
    checkStorage(),
  ]);

  const overallOk = dbCheck.ok && relayCheck.ok && storageCheck.ok;
  return NextResponse.json({
    status:    overallOk ? 'ok' : (dbCheck.ok || relayCheck.ok ? 'degraded' : 'down'),
    checks:    { database: dbCheck, bot_relay: relayCheck, storage: storageCheck },
    timestamp: new Date().toISOString(),
  });
}

async function checkDatabase(): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    return { ok: true, latency_ms: Date.now() - start };
  } catch (e) {
    return { ok: false, latency_ms: Date.now() - start, error: String(e) };
  }
}

async function checkStorage(): Promise<{ ok: boolean; status: StorageHealth; error?: string }> {
  try {
    const status = await mediaService.getStorageProvider().health();
    return { ok: status === 'ONLINE', status };
  } catch (e) {
    return { ok: false, status: 'OFFLINE', error: String(e) };
  }
}

type RelayHealthBody = {
  ok?: boolean;
  version?: string;
  uptime_seconds?: number;
  settings_keys?: number;
  telegram?: {
    ok: boolean;
    username?: string | null;
    latency_ms?: number;
    error?: string;
  };
};

async function checkRelay(): Promise<{
  ok: boolean;
  latency_ms: number;
  version?: string;
  uptime_seconds?: number;
  telegram?: RelayHealthBody['telegram'];
  error?: string;
}> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const r = await fetch(`${BOT_RELAY_URL}/health`, {
      headers: { Authorization: `Bearer ${BOT_RELAY_AUTH_TOKEN}` },
      signal:  controller.signal,
    }).finally(() => clearTimeout(timer));
    const latency_ms = Date.now() - start;
    if (!r.ok) return { ok: false, latency_ms };
    const body = await r.json().catch(() => ({})) as RelayHealthBody;
    return {
      ok:             true,
      latency_ms,
      version:        body.version,
      uptime_seconds: body.uptime_seconds,
      telegram:       body.telegram,
    };
  } catch (e) {
    return { ok: false, latency_ms: Date.now() - start, error: String(e) };
  }
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd erp && npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add erp/src/app/api/maintenance/health/route.ts
git commit -m "feat(media): add storage health check to /api/maintenance/health"
```

---

### Task 9: Build verification and regression

**Files:** no new files — verification only

- [ ] **Step 1: Run the full Vitest test suite**

```bash
cd erp && npm test
```

Expected: all tests pass (filesystem-provider + media-service + existing auth tests).

- [ ] **Step 2: Run the TypeScript strict check**

```bash
cd erp && npm run lint
```

Expected: zero errors, zero warnings treated as errors.

- [ ] **Step 3: Run the production build**

```bash
cd erp && npm run build
```

Expected: `✓ Compiled successfully`. If there are type errors that `tsc --noEmit` missed (Next.js uses its own compiler), fix them before proceeding.

- [ ] **Step 4: Smoke-test the new endpoints**

With the dev server running (`npm run dev`), verify each endpoint responds correctly. Use curl or the browser. Confirm auth is enforced (401 without cookie).

```bash
# Should return 401 (no auth)
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/media/upload -X POST
# Expected: 401

# Should return 404 (auth present but id doesn't exist) — replace TOKEN with a valid session cookie
curl -s -H "Cookie: session=TOKEN" http://localhost:3001/api/media/1
# Expected: 404 (media_library is empty)

# Health endpoint should now include storage check
curl -s http://localhost:3001/api/maintenance/health | python3 -m json.tool
# Expected: JSON with checks.storage.ok (true if MEDIA_UPLOAD_DIR is writable, or dir created at /uploads/media)
```

- [ ] **Step 5: Regression — verify existing routes are unaffected**

Check each of these still returns the expected status (not 500):

```bash
BASE=http://localhost:3001
curl -s -o /dev/null -w "%{http_code}" $BASE/api/maintenance/health         # 200
curl -s -o /dev/null -w "%{http_code}" $BASE/api/deposits -H "Cookie: ..."  # 200 or 401
curl -s -o /dev/null -w "%{http_code}" $BASE/api/livechat/sessions           # 200 or 401
curl -s -o /dev/null -w "%{http_code}" $BASE/api/announcements               # 200 or 401
```

None of the existing routes should return 500. If any does, investigate before continuing to Phase 5.4B.

- [ ] **Step 6: Final commit (regression confirmation)**

```bash
git commit --allow-empty -m "chore(media): Phase 5.4A complete — build and regression verified"
```

---

## Self-Review Checklist (run before handing off)

- [ ] All 9 tasks committed and `git log --oneline` shows clean history
- [ ] `npm test` passes with no failures
- [ ] `npm run lint` passes with no errors
- [ ] `npm run build` completes successfully
- [ ] `GET /api/media/:id/file` returns binary stream (not JSON) for a real uploaded file
- [ ] `DELETE /api/media/:id` returns `{ ok: false, error: 'REFERENCED' }` when `reference_count > 0`
- [ ] `DELETE /api/media/:id/permanent` returns 403 for non-SUPER_ADMIN
- [ ] `POST /api/media/upload` with a `.exe` file returns 422 with `{ error: 'EXTENSION_NOT_ALLOWED' }`
- [ ] `GET /api/maintenance/health` response includes `checks.storage`
- [ ] No existing route returns 500
- [ ] No `fs.readFile`, `Buffer.from`, or base64 construction outside `media-service.ts`
