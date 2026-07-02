# Phase 5.4 — Media Library & Quick Reply Manager Design

> **Scope:** Four independent phases (5.4A → 5.4D), each shippable and testable on its own.
> **Core principle:** Media Library is a platform-wide DAM service, not a Quick Reply feature.

---

## Context & Motivation

The existing Quick Reply system stores media as base64 data URIs directly in the `media_content`
PostgreSQL column (`quick_replies.media_content TEXT`). This design:

- Bloats the database with binary data
- Prevents media reuse across Quick Replies, Announcements, Broadcast, etc.
- Couples the relay transport format to the storage format
- Prevents future storage migration (S3, Cloudflare R2, MinIO)

Phase 5.4 replaces this with a platform-wide Media Library backed by an abstract
`MediaService → StorageProvider` layer.

---

## Architecture Decisions (locked)

### Q1 — Storage
Platform-wide `media_library` table (metadata only). Binary files on local filesystem
(v1.0, `MEDIA_UPLOAD_DIR`). `MediaService` abstraction hides the storage backend.
`quick_replies` references `media_id` — no base64 in DB, ever.

### Q2 — Relay transport
`MediaService.getForRelay(media_id)` returns an opaque `RelayMediaPayload`. In v1.0 the
implementation reads the file from disk and encodes it as base64. The relay receives the
same payload it always has — zero relay changes for all of Phase 5.4.x. The encoding
strategy is an implementation detail of `MediaService`; callers never inspect `.data`.

### Q3 — File serving
Hybrid: `GET /api/media/:id/file` is the **stable public contract forever**. The route
streams the file through `MediaController → MediaService → StorageProvider`. Filesystem
path is never exposed. `MEDIA_UPLOAD_DIR` is env-configurable. Future providers (S3, R2)
only require implementing a new `StorageProvider` — no callers change.

---

## Four Phases

| Phase | Name | Dependency | Regression target |
|-------|------|-----------|-------------------|
| 5.4A | Media Foundation | none | zero changes to customer workflows |
| 5.4B | Media Library Manager | 5.4A stable | zero regressions in Live Chat or Quick Replies |
| 5.4C | Quick Reply Manager | 5.4B stable | zero regressions in Live Chat |
| 5.4D | Live Chat Integration | 5.4C stable | zero regressions in relay / Timeline |

Each phase must pass a full regression check before the next begins. Phases must not be
merged together.

---

## Data Model

### Migration 027 — `media_library` (Phase 5.4A)

```sql
CREATE TABLE media_library (
  id                SERIAL PRIMARY KEY,

  -- Multi-tenant preparation (no logic in v1.0; NULL = default tenant)
  -- tenant_id queries must be written so filtering can be injected later
  tenant_id         INTEGER         NULL,

  -- File identity & deduplication
  -- SHA-256 of file content; duplicate uploads return the existing record
  file_hash         VARCHAR(64)     NOT NULL UNIQUE,
  -- Opaque key passed to StorageProvider; no other code reads this
  storage_key       VARCHAR(500)    NOT NULL UNIQUE,
  storage_provider  VARCHAR(10)     NOT NULL DEFAULT 'LOCAL',

  -- Classification
  -- media_type is explicit — do not derive from mime_type in application code
  media_type        VARCHAR(20)     NOT NULL DEFAULT 'UNKNOWN',
  mime_type         VARCHAR(100)    NOT NULL,
  extension         VARCHAR(20)     NOT NULL,

  -- Presentation
  original_filename VARCHAR(255)    NOT NULL,
  display_name      VARCHAR(255)    NOT NULL,  -- user-editable label

  -- Dimensions & duration
  file_size         BIGINT          NOT NULL,
  width             INTEGER         NULL,       -- pixels; NULL for non-visual types
  height            INTEGER         NULL,
  duration          INTEGER         NULL,       -- seconds; NULL for non-AV types

  -- Thumbnail
  thumbnail_key     VARCHAR(500)    NULL,
  -- NONE = not applicable; PENDING = queued; READY = served; FAILED = generation failed
  thumbnail_status  VARCHAR(10)     NOT NULL DEFAULT 'NONE',

  -- Extended metadata: EXIF, codec, bitrate, frame rate, APK package name, PDF page count, etc.
  metadata          JSONB           NOT NULL DEFAULT '{}',

  -- Usage tracking
  -- usage_count: how many times this media has been sent (incremented on each send)
  usage_count       INTEGER         NOT NULL DEFAULT 0,
  -- reference_count: how many modules currently reference this media_id
  -- If reference_count > 0, soft-delete is blocked; permanent delete is blocked
  reference_count   INTEGER         NOT NULL DEFAULT 0,
  last_used_at      TIMESTAMPTZ     NULL,
  -- Which module last used this: QUICK_REPLY | ANNOUNCEMENT | BROADCAST | BOT_MESSAGE | APK | WEBSITE | BANNER | PROMOTION | AI
  last_used_module  VARCHAR(50)     NULL,

  -- Download analytics (incremented on each GET /api/media/:id/file serve)
  download_count    INTEGER         NOT NULL DEFAULT 0,
  last_downloaded_at TIMESTAMPTZ   NULL,

  -- Audit
  created_by        INTEGER         REFERENCES admins(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  -- Soft delete (metadata rows are never hard-deleted, only via permanent delete endpoint)
  -- is_active=TRUE, deleted_at=NULL  → active, visible, usable
  -- is_active=FALSE, deleted_at=NULL → disabled/archived
  -- deleted_at IS NOT NULL           → soft deleted
  is_active         BOOLEAN         NOT NULL DEFAULT TRUE,
  deleted_at        TIMESTAMPTZ     NULL,
  deleted_by        INTEGER         NULL REFERENCES admins(id) ON DELETE SET NULL,

  -- CHECK constraints
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

-- Reusable trigger function (shared with quick_replies in 028)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_media_library_updated_at
  BEFORE UPDATE ON media_library
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Future `media_references` table (v1.1+, not created in v1.0):**

When multiple modules reference the same media, a `media_references` table is created
and `reference_count` becomes a derived count from that table.

```sql
-- Future migration 030 (do NOT create in v1.0)
CREATE TABLE media_references (
  id         SERIAL PRIMARY KEY,
  media_id   INTEGER NOT NULL REFERENCES media_library(id) ON DELETE CASCADE,
  module     VARCHAR(50) NOT NULL,  -- QUICK_REPLY | ANNOUNCEMENT | etc.
  record_id  INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### Migration 028 — `quick_replies` changes (Phase 5.4C)

```sql
-- Expand content_type enum
ALTER TABLE quick_replies
  DROP CONSTRAINT IF EXISTS quick_replies_content_type_check;

ALTER TABLE quick_replies
  ADD CONSTRAINT quick_replies_content_type_check
  CHECK (content_type IN ('TEXT','IMAGE','GIF','VIDEO','AUDIO','DOCUMENT','PDF','APK','ZIP','RAR'));

-- Add new columns; media_content remains nullable during migration
ALTER TABLE quick_replies
  ADD COLUMN IF NOT EXISTS media_id   INTEGER REFERENCES media_library(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS caption    TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TRIGGER trg_quick_replies_updated_at
  BEFORE UPDATE ON quick_replies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### Data Migration Script (between 028 and 029, Phase 5.4C)

A standalone Node.js script (`scripts/migrate-quick-reply-media.ts`) that:

1. Selects all quick_reply rows where `media_content IS NOT NULL AND media_id IS NULL`
2. For each row: parses data URI → extracts mime type + raw bytes → computes SHA-256
3. Checks `media_library` for existing `file_hash` (dedup — idempotent on re-run)
4. If not found: writes to `FilesystemProvider`, inserts `media_library` row
5. Updates `quick_replies.media_id`, sets `quick_replies.media_content = NULL`
6. Increments `media_library.reference_count` by 1

The script is **idempotent**: rows already migrated (media_id set) are skipped.
Re-running after interruption is always safe.

### Migration 029 — drop `media_content` (Phase 5.4C, after script confirms zero rows)

```sql
-- Run only after verifying: SELECT COUNT(*) FROM quick_replies WHERE media_content IS NOT NULL; = 0
ALTER TABLE quick_replies DROP COLUMN IF EXISTS media_content;
```

---

## MediaService Architecture

All files live under `erp/src/lib/media/`.

### Types (`types.ts`)

```typescript
export type MediaModule =
  | 'QUICK_REPLY' | 'ANNOUNCEMENT' | 'BROADCAST' | 'BOT_MESSAGE'
  | 'APK' | 'WEBSITE' | 'BANNER' | 'PROMOTION' | 'AI';

export type StorageHealth    = 'ONLINE' | 'OFFLINE' | 'READ_ONLY';
export type ScanResult       = 'PASS' | 'FAIL' | 'ERROR';
export type ThumbnailStatus  = 'NONE' | 'PENDING' | 'READY' | 'FAILED';
export type MediaType        = 'IMAGE' | 'GIF' | 'VIDEO' | 'AUDIO' | 'VOICE'
                             | 'DOCUMENT' | 'PDF' | 'APK' | 'ZIP' | 'RAR' | 'UNKNOWN';

// Opaque relay payload — callers pass it to the relay without inspecting internals
export interface RelayMediaPayload {
  readonly _type:    'RelayMediaPayload';
  readonly version:  1;         // increment when relay protocol changes
  readonly mimeType: string;
  readonly filename: string;
  readonly data:     string;    // v1.0: base64; implementation detail, never read by callers
}

export type MediaEvent =
  | { type: 'MEDIA_CREATED';  mediaId: number; uploadedBy: number }
  | { type: 'MEDIA_UPDATED';  mediaId: number; updatedBy: number }
  | { type: 'MEDIA_DELETED';  mediaId: number; deletedBy: number }
  | { type: 'MEDIA_USED';     mediaId: number; module: MediaModule; recordId?: number };

export interface MediaValidationConfig {
  maxSizeBytes:      number;        // default: 50 MB
  allowedExtensions: Set<string>;
  allowedMimeTypes:  Set<string>;
}

export interface SaveMediaInput {
  buffer:           Buffer;
  originalFilename: string;
  mimeType:         string;
  uploadedBy:       number;
}

export interface SaveMediaResult {
  record:      MediaRecord;
  isDuplicate: boolean;   // true = file_hash already existed, no new file written
}

export class MediaValidationError extends Error {
  constructor(public readonly reason: 'TOO_LARGE' | 'EXTENSION_NOT_ALLOWED' | 'MIME_NOT_ALLOWED') {
    super(reason);
  }
}

// MediaRecord is the TypeScript representation of a media_library row.
// Field names are camelCase of the DB columns (e.g., file_hash → fileHash).
// Implementer: derive from the full column list in Migration 027.
export interface MediaRecord {
  id: number; tenantId: number | null;
  fileHash: string; storageKey: string; storageProvider: string;
  mediaType: MediaType; mimeType: string; extension: string;
  originalFilename: string; displayName: string;
  fileSize: number; width: number | null; height: number | null; duration: number | null;
  thumbnailKey: string | null; thumbnailStatus: ThumbnailStatus;
  metadata: Record<string, unknown>;
  usageCount: number; referenceCount: number;
  lastUsedAt: string | null; lastUsedModule: MediaModule | null;
  downloadCount: number; lastDownloadedAt: string | null;
  createdBy: number | null; createdAt: string; updatedAt: string;
  isActive: boolean; deletedAt: string | null; deletedBy: number | null;
}
```

### StorageProvider interface (`storage-provider.ts`)

```typescript
export interface StorageProvider {
  save(key: string, buffer: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  health(): Promise<StorageHealth>;  // surfaced in ERP Bot Center system health panel
}
```

### MediaService interface (`media-service.ts`)

```typescript
export interface MediaService {
  // Upload pipeline (validate → hash → scan → write → DB → thumbnail → event)
  save(input: SaveMediaInput): Promise<SaveMediaResult>;
  saveMany(inputs: SaveMediaInput[]): Promise<SaveMediaResult[]>;

  // Retrieval
  getBuffer(id: number): Promise<{ buffer: Buffer; mimeType: string; filename: string } | null>;
  getForRelay(id: number): Promise<RelayMediaPayload | null>;  // only relay-payload builder in ERP
  getPreview(id: number): Promise<{ buffer: Buffer; mimeType: string } | null>;  // thumbnail if READY

  // Mutation
  // replace() preserves media_id — all references remain valid; updates storage_key, file_hash, dimensions, metadata
  replace(id: number, input: SaveMediaInput): Promise<MediaRecord>;
  softDelete(id: number, deletedBy: number): Promise<boolean>;        // false if reference_count > 0
  permanentDelete(id: number, deletedBy: number): Promise<boolean>;   // SUPER_ADMIN; requires deleted_at IS NOT NULL AND reference_count == 0

  // Usage (all fire-and-forget — must never delay callers)
  recordUsage(id: number, module: MediaModule, recordId?: number): Promise<void>;
  recordDownload(id: number): Promise<void>;

  // Events
  on(event: MediaEvent['type'], handler: (e: MediaEvent) => void): void;
  off(event: MediaEvent['type'], handler: (e: MediaEvent) => void): void;
}
```

### Upload pipeline (enforced inside `save()`, not in API routes)

```
SaveMediaInput
  ↓
validate()          → throws MediaValidationError (400 to caller)
  ↓
compute SHA-256     → check file_hash in DB
                      if match → return { record: existing, isDuplicate: true }
  ↓
scan()              → v1.0: always PASS; future: ClamAV / cloud AV
                      if FAIL → throw MediaScanError (422 to caller)
  ↓
StorageProvider.save(key, buffer, mimeType)
  ↓
INSERT media_library row   thumbnail_status = NONE (Phase 5.4A always)
                           Phase 5.4B adds thumbnail generation: status starts PENDING,
                           background worker updates to READY | FAILED.
                           Background worker = unattached Promise (acceptable in
                           Docker/Node.js; not viable in serverless deployments).
  ↓
emit MEDIA_CREATED
  ↓
return { record, isDuplicate: false }
```

### FilesystemProvider (`filesystem-provider.ts`, v1.0 only)

- Reads `MEDIA_UPLOAD_DIR` from `process.env` (default: `/uploads/media`)
- `storage_key` format: `<sha256>.<extension>` — no directories, collision-free
- Full filesystem path: `${MEDIA_UPLOAD_DIR}/<sha256>.<extension>`
- The path is never exposed outside this class

### Dependency injection

`MediaService` is instantiated once and injected into `MediaController` and any business
module that needs it. It is **not** a global singleton import. Route handlers receive it
via a factory or a module-level singleton created at server startup.

---

## API Routes

### Phase 5.4A — Media Foundation

Storage health is wired into the health dashboard in Phase 5.4A (not 5.4D), since
`StorageProvider.health()` is defined in this phase:

```
GET /api/maintenance/health
  → existing: Telegram, Relay, DB checks
  → new in 5.4A: storage: { ok: boolean, status: StorageHealth }
```

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/media/upload` | ADMIN | Multipart: `file`, optional `display_name`. Returns `{ ok, media: MediaRecord, isDuplicate }`. |
| `POST` | `/api/media/upload/many` | ADMIN | Batch. Returns `{ ok, results: SaveMediaResult[] }`. |
| `GET` | `/api/media/:id` | ADMIN | Metadata only. 404 if soft-deleted. |
| `GET` | `/api/media/:id/file` | ADMIN† | **Stable public contract forever.** Streams file. Headers: `Content-Type`, `Content-Length`, `Content-Disposition` (inline by default, attachment if `?download=1`), `ETag`, `Cache-Control`, `Last-Modified`. Calls `recordDownload()` async. |
| `GET` | `/api/media/:id/thumbnail` | ADMIN† | Streams thumbnail if `READY`, else original. Same cache headers. |

†`GET /api/media/:id/file` and `/thumbnail` are authenticated in v1.0. When Website CMS
ships, a signed-token mechanism is added (`?token=xxx`) without changing the URL.

**Rate limiting** (applied at route level): upload and replace endpoints — 20 req/min per admin.
Delete and bulk-delete — 10 req/min per admin.

**Audit log** events emitted on every mutating route:
`MEDIA_UPLOAD`, `MEDIA_REPLACE`, `MEDIA_DELETE`, `MEDIA_RESTORE`, `MEDIA_PERMANENT_DELETE`.

### Phase 5.4B — Media Library Manager

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/media` | ADMIN | List with filters. Query params: `type`, `search` (display_name OR original_filename), `mime_type`, `extension`, `uploaded_by`, `module` (last_used_module), `date_from`, `date_to`, `min_size`, `max_size`, `active`. Sort: `newest` (default), `oldest`, `most_used`, `most_downloaded`, `largest`, `smallest`, `recently_used`. Pagination: `page`, `limit`. Returns `{ media, total, page, limit }`. Excludes soft-deleted. |
| `GET` | `/api/media/stats` | ADMIN | `{ totalFiles, totalSize, byType, storageHealth, recentUploads }`. |
| `PATCH` | `/api/media/:id` | ADMIN | Update `display_name`, `is_active`. |
| `POST` | `/api/media/:id/replace` | ADMIN | Replace file, preserve `id` and all references. |
| `DELETE` | `/api/media/:id` | ADMIN | Soft delete. Returns `{ ok: false, error: 'REFERENCED', referenceCount: N }` if blocked. |
| `POST` | `/api/media/:id/restore` | SUPER_ADMIN | Clear `deleted_at`. |
| `DELETE` | `/api/media/:id/permanent` | SUPER_ADMIN | Hard delete. Requires `reference_count == 0` AND `deleted_at IS NOT NULL`. Calls `provider.delete()`, removes DB row, emits `MEDIA_DELETED`. |
| `GET` | `/api/media/:id/references` | ADMIN | Returns list of modules referencing this media_id (e.g., Quick Replies, Announcements). Populated from app-level tracking in v1.0. |

**Reserved for future phases (do not implement in 5.4B, but design queries to support them):**

```
POST /api/media/bulk-delete    → soft delete list; returns { deleted: [], skipped: [], failed: [] }
POST /api/media/bulk-restore   → restore list
```

### Phase 5.4C — Quick Reply Manager

Existing routes at `/api/livechat/quick-replies/*` are updated in-place. No URL changes.
Response shapes are extended, not broken.

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `GET` | `/api/livechat/quick-replies` | ADMIN | Returns `media_id`, `caption`, joined `media?: MediaRecord`. |
| `POST` | `/api/livechat/quick-replies` | ADMIN | Body: `{ title, content_type, body?, media_id?, caption?, category_id?, sort_order? }`. On create with `media_id`: increments `media_library.reference_count`. |
| `PATCH` | `/api/livechat/quick-replies/:id` | ADMIN | Partial update. If `media_id` changes: decrements old, increments new. |
| `DELETE` | `/api/livechat/quick-replies/:id` | ADMIN | Decrements `media_library.reference_count` when `media_id` was set. |
| `POST` | `/api/livechat/quick-replies/:id/favorite` | ADMIN | Unchanged. |
| `PATCH` | `/api/livechat/quick-replies/reorder` | ADMIN | Body: `{ items: [{ id, sort_order }] }`. |
| `GET` | `/api/livechat/quick-replies/categories` | ADMIN | Unchanged. |
| `POST` | `/api/livechat/quick-replies/categories` | ADMIN | Unchanged. |
| `PATCH` | `/api/livechat/quick-replies/categories/:id` | ADMIN | Unchanged. |
| `DELETE` | `/api/livechat/quick-replies/categories/:id` | ADMIN | Blocked if active quick replies exist in category. |

### Phase 5.4D — Live Chat Integration

**No new routes.** Internal wiring only. Zero relay changes.

The existing send path is updated:

```
Agent clicks quick reply in ReplyBox
  → POST /api/livechat/sessions/:id/relay (existing route)
  → if quick_reply.media_id is set:
      payload = await MediaService.getForRelay(quick_reply.media_id)   ← RelayMediaPayload v1
  → POST bot relay /relay { ..., media: payload }
  → MediaService.recordUsage(media_id, 'QUICK_REPLY', quick_reply_id)  ← async, non-blocking
```

---

## ERP Navigation

| Page | Path | Phase | Sidebar group |
|------|------|-------|---------------|
| Media Library | `/media-library` | 5.4B | Control Center |
| Quick Reply Manager | `/livechat/quick-replies` | 5.4C | Live Chat (replaces `/livechat/settings` quick-reply tab) |

`/media-library` lives under Control Center (not under Live Chat) because it is a
platform service, not a Live Chat feature.

---

## Bot Identity Follow-up (Phase 5.3 fix, tracked separately)

The Bot Center currently mislabels `bot_name` as "Display Name" without clarifying
whether saving it affects Telegram.

| ERP Field | Telegram API | Treatment |
|-----------|-------------|-----------|
| `bot_name` | `setMyName()` (Bot API 6.7+) | ERP-stored + **"Sync to Telegram"** button |
| `bot_username` | Read-only (BotFather only) | Hard read-only, note: "Change via @BotFather" |
| `bot_description` | `setMyDescription()` | ERP-stored + **"Sync to Telegram"** button |
| `bot_language` | No equivalent | **ERP Only** badge |
| `support_chat_id` | No equivalent | **ERP Only** badge |

Implementation: two new relay endpoints (`POST /sync-bot-name`, `POST /sync-bot-description`)
and corresponding ERP API routes (`/api/settings/bot/sync-name`, `/sync-description`).
This fix ships as a separate commit from Phase 5.4.

---

## Platform Principles

1. **MediaService is the only upload system.** No future module may implement its own
   file upload logic. Broadcast, Website CMS, APK Manager, AI Knowledge Base,
   Announcements, Promotions, Bot Messages — all must call `MediaService.save()`.

2. **`GET /api/media/:id/file` is stable forever.** The URL never changes. The
   storage backend may be replaced without any client changes.

3. **Business modules never touch the filesystem.** No `fs.readFile()`, no
   `Buffer.from()`, no `data:image/...;base64,...` construction outside `MediaService`.

4. **`StorageProvider` is the only abstraction boundary.** Switching from
   `FilesystemProvider` to `S3Provider` requires implementing one interface and
   changing one env var. Nothing else changes.

5. **Tenant isolation is prepared but not enforced in v1.0.** All repository queries
   must be written so a `tenant_id` filter can be injected later without restructuring.

6. **Soft delete by default.** Media rows are never hard-deleted unless
   `reference_count == 0 AND deleted_at IS NOT NULL`, via the SUPER_ADMIN
   `/permanent` endpoint.

7. **All usage tracking is async.** `recordUsage()` and `recordDownload()` must never
   block sending or serving. They run in the background.

8. **Thumbnail generation is non-blocking.** Uploads return immediately with
   `thumbnail_status = PENDING`. A background worker updates to `READY` or `FAILED`.

---

## Future Platform Roadmap (informational, no implementation scope in 5.4)

| Future module | MediaService usage |
|---------------|-------------------|
| Broadcast Center (v1.1) | `media_id` + `caption` per message; same `getForRelay()` |
| Campaign Center (future) | Broadcast → Promotion → SMS → Email; all reuse `media_id` |
| Website CMS | Banners, carousel, downloads reference `media_library.id` |
| APK Manager | APK files stored in `media_library`; `media_type = APK` |
| AI Knowledge Base | PDFs, images, training files via `MediaService.save()` |
| Announcement Manager | `media_id` replaces any inline upload |

---

## Regression Requirements

- Every phase passes regression before the next phase begins.
- Phase 5.4A: no changes to `/livechat/*` or relay — existing Live Chat must work identically.
- Phase 5.4B: no changes to Quick Reply schema — manager UI is additive only.
- Phase 5.4C: data migration script must be verified (zero `media_content` rows) before 029 runs.
- Phase 5.4D: relay payload is identical to pre-5.4 payload from the relay's perspective.
