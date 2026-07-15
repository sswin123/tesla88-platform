# Phase 5.4C — Quick Reply Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the ERP Communication Asset Center — a full-featured Quick Reply Manager used by Live Chat, Broadcast, Bot Messages, and future modules. All media comes from Media Library. Supports 11 content types, archive/restore, usage tracking, pinned replies, preview panel, keyboard navigation, and bulk operations.

**Architecture:** Quick replies now reference `media_library` via `media_id` FK (no more base64 in `media_content`). Phase 5.4C adds the schema, data migration, repository layer, API routes, MediaPicker component, and manager UI. Phase 5.4D (next) will update the relay send path to use `MediaService.getForRelay(media_id)` and then drop the legacy `media_content` column — so `media_content` remains in the table during 5.4C to keep the existing send path working.

**Tech Stack:** PostgreSQL (migrations), TypeScript, Next.js 15 App Router, React, Tailwind CSS, lucide-react, Vitest

## Global Constraints

- Do NOT install new npm packages — use only existing dependencies
- Do NOT use `pool.query` in route files — all DB access via repository functions
- Do NOT store media binary data in PostgreSQL — `media_id` references `media_library`, which stores files on disk
- Do NOT change the URL `/api/livechat/quick-replies` — existing ReplyBox depends on it
- Do NOT update `erp/src/app/api/livechat/sessions/[id]/messages/route.ts` — the relay send path is Phase 5.4D
- Do NOT drop `media_content` column — deferred to Phase 5.4D (needed for the existing relay send path)
- `'use client'` required on all interactive page/component files
- No external UI libraries beyond existing `@/components/ui/*` and lucide-react
- All new content types: `'TEXT' | 'IMAGE' | 'GIF' | 'VIDEO' | 'AUDIO' | 'VOICE' | 'DOCUMENT' | 'PDF' | 'APK' | 'ZIP' | 'RAR'` (11 types)
- Caption is optional for all types including TEXT
- `reference_count` in `media_library` must be incremented on create/restore-media and decremented on delete/clear-media
- Migration 028 must rename existing `PHOTO` rows to `IMAGE` before adding the new CHECK constraint
- `set_updated_at()` trigger function already exists (created by migration 027) — do not recreate it

---

## File Map

```
New files:
  erp/migrations/028_quick_reply_modernize.sql
  scripts/migrate-quick-reply-media.ts
  erp/src/app/api/livechat/quick-replies/[id]/route.ts       (PATCH, DELETE)
  erp/src/app/api/livechat/quick-replies/[id]/use/route.ts   (POST — increment usage)
  erp/src/app/api/livechat/quick-replies/bulk/route.ts       (POST — bulk ops)
  erp/src/app/(dashboard)/media-library/MediaPicker.tsx
  erp/src/app/(dashboard)/livechat/quick-replies/page.tsx
  erp/tests/quick-reply-repo.test.ts
  erp/tests/quick-reply-route.test.ts
  erp/tests/quick-reply-id-route.test.ts

Modified files:
  erp/src/lib/types.ts                               (QuickReply interface + QuickReplyContentType)
  erp/src/lib/repositories/support_repo.ts           (all QR functions updated + new functions)
  erp/src/app/api/livechat/quick-replies/route.ts    (GET returns pinned/recent/usage; POST updated)
  erp/src/components/livechat/ReplyBox.tsx           (fire-and-forget /use call after send)
  erp/src/components/sidebar.tsx                     (add Quick Replies nav)
  erp/src/app/(dashboard)/livechat/settings/page.tsx (redirect to new page)
```

---

### Task 1: Migration 028 — Quick Reply schema modernization

**Files:**
- Create: `erp/migrations/028_quick_reply_modernize.sql`

**Interfaces:**
- Consumes: `quick_replies` table (existing), `media_library` table (from 027), `set_updated_at()` function (from 027)
- Produces: expanded `content_type` CHECK (11 types), new columns `media_id`, `caption`, `updated_at`, `usage_count`, `last_used_at`, `used_by`, `updated_by`, `pinned`, `archived_at`, `archived_by`, trigger, 4 indexes

- [ ] **Step 1: Write the migration file**

Create `erp/migrations/028_quick_reply_modernize.sql`:

```sql
-- 028_quick_reply_modernize.sql
-- Phase 5.4C: ERP Communication Asset Center schema.
-- NOTE: media_content column NOT dropped — deferred to Phase 5.4D.

-- 1. Drop old CHECK constraint (TEXT | PHOTO | VIDEO | DOCUMENT)
ALTER TABLE quick_replies
  DROP CONSTRAINT IF EXISTS quick_replies_content_type_check;

-- 2. Rename legacy PHOTO → IMAGE (must run before new constraint)
UPDATE quick_replies SET content_type = 'IMAGE' WHERE content_type = 'PHOTO';

-- 3. New CHECK constraint — 11 types
ALTER TABLE quick_replies
  ADD CONSTRAINT quick_replies_content_type_check
  CHECK (content_type IN (
    'TEXT','IMAGE','GIF','VIDEO','AUDIO','VOICE',
    'DOCUMENT','PDF','APK','ZIP','RAR'
  ));

-- 4. Media FK (ON DELETE SET NULL — deleting a media file clears the reference)
ALTER TABLE quick_replies
  ADD COLUMN IF NOT EXISTS media_id INTEGER REFERENCES media_library(id) ON DELETE SET NULL;

-- 5. Caption (optional for all types)
ALTER TABLE quick_replies
  ADD COLUMN IF NOT EXISTS caption TEXT;

-- 6. updated_at + trigger
ALTER TABLE quick_replies
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS trg_quick_replies_updated_at ON quick_replies;
CREATE TRIGGER trg_quick_replies_updated_at
  BEFORE UPDATE ON quick_replies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 7. Usage tracking (who sent it, when, how many times)
ALTER TABLE quick_replies
  ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE quick_replies
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
ALTER TABLE quick_replies
  ADD COLUMN IF NOT EXISTS used_by VARCHAR(100);

-- 8. Audit: who last edited
ALTER TABLE quick_replies
  ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);

-- 9. Pinned replies — always appear first in the list
ALTER TABLE quick_replies
  ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE;

-- 10. Archive/Restore (soft-hide, separate from is_active and permanent delete)
--     NULL = active, NOT NULL = archived (recoverable)
ALTER TABLE quick_replies
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE quick_replies
  ADD COLUMN IF NOT EXISTS archived_by VARCHAR(100);

-- 11. Indexes
CREATE INDEX IF NOT EXISTS idx_quick_replies_media_id
  ON quick_replies (media_id) WHERE media_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quick_replies_pinned
  ON quick_replies (pinned) WHERE pinned = TRUE;
CREATE INDEX IF NOT EXISTS idx_quick_replies_last_used
  ON quick_replies (last_used_at DESC NULLS LAST) WHERE last_used_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quick_replies_archived
  ON quick_replies (archived_at) WHERE archived_at IS NOT NULL;
```

- [ ] **Step 2: Apply the migration manually and verify**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot
psql "$DATABASE_URL" -f erp/migrations/028_quick_reply_modernize.sql
```

Then verify:
```bash
psql "$DATABASE_URL" -c "\d quick_replies"
```

Expected: columns `media_id`, `caption`, `updated_at` present; constraint shows 11 types; trigger `trg_quick_replies_updated_at` listed.

If you cannot run psql, verify by running the Next.js build after the repository changes — TypeScript will catch mismatches.

- [ ] **Step 3: Commit**

```bash
git add erp/migrations/028_quick_reply_modernize.sql
git commit -m "feat(quick-reply): migration 028 — expand content_type, add media_id/caption/updated_at"
```

---

### Task 2: Data migration script — base64 → Media Library

**Files:**
- Create: `scripts/migrate-quick-reply-media.ts`

**Interfaces:**
- Consumes: `quick_replies.media_content` (base64 data URI), `media_library` table, `FilesystemProvider` from `@/lib/media/filesystem-provider`
- Produces: `quick_replies.media_id` set, `media_library` rows created, `reference_count` incremented. `media_content` is NOT nulled — deferred to Phase 5.4D.

This script is **idempotent**: rows with `media_id IS NOT NULL` are skipped. Safe to re-run after interruption.

- [ ] **Step 1: Write the migration script**

Create `scripts/migrate-quick-reply-media.ts`:

```typescript
/**
 * Phase 5.4C data migration: move base64 media_content from quick_replies → media_library.
 *
 * Run: npx ts-node --project erp/tsconfig.json scripts/migrate-quick-reply-media.ts
 *
 * Safe to re-run: rows with media_id already set are skipped.
 * media_content is NOT nulled — Phase 5.4D will null + drop it after updating the relay.
 */
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const UPLOAD_DIR = process.env.MEDIA_UPLOAD_DIR ?? '/uploads/media';

const MIME_TO_TYPE: Record<string, string> = {
  'image/jpeg': 'IMAGE', 'image/png': 'IMAGE', 'image/webp': 'IMAGE',
  'image/gif': 'GIF',
  'video/mp4': 'VIDEO', 'video/mpeg': 'VIDEO', 'video/quicktime': 'VIDEO',
  'audio/mpeg': 'AUDIO', 'audio/ogg': 'AUDIO', 'audio/wav': 'AUDIO',
  'application/pdf': 'PDF',
  'application/zip': 'ZIP',
  'application/vnd.android.package-archive': 'APK',
  'application/octet-stream': 'DOCUMENT',
};

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/mpeg': 'mpeg', 'video/quicktime': 'mov',
  'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/vnd.android.package-archive': 'apk',
  'application/octet-stream': 'bin',
};

async function run() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const { rows } = await pool.query<{
    id: number; media_content: string; content_type: string; created_by: string;
  }>(
    `SELECT id, media_content, content_type, created_by
     FROM quick_replies
     WHERE media_content IS NOT NULL AND media_id IS NULL`
  );

  console.log(`Found ${rows.length} rows to migrate.`);
  let migrated = 0, skipped = 0, failed = 0;

  for (const row of rows) {
    try {
      // Parse data URI: data:<mime>;base64,<data>
      const match = /^data:([^;]+);base64,(.+)$/.exec(row.media_content);
      if (!match) { console.warn(`Row ${row.id}: unrecognised data URI format — skipping`); skipped++; continue; }
      const [, mimeType, b64] = match;
      const buffer = Buffer.from(b64, 'base64');

      // Compute SHA-256 for dedup
      const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
      const ext = MIME_TO_EXT[mimeType] ?? 'bin';
      const storageKey = `${fileHash}.${ext}`;
      const mediaType = MIME_TO_TYPE[mimeType] ?? 'DOCUMENT';

      // Check for existing media_library row (dedup)
      const existing = await pool.query<{ id: number }>(
        `SELECT id FROM media_library WHERE file_hash = $1`, [fileHash]
      );

      let mediaId: number;
      if (existing.rows.length > 0) {
        mediaId = existing.rows[0].id;
        console.log(`Row ${row.id}: dedup → media_id=${mediaId}`);
      } else {
        // Write file to disk
        const filePath = path.join(UPLOAD_DIR, storageKey);
        if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, buffer);

        // Insert media_library row
        const displayName = `quick-reply-${row.id}.${ext}`;
        const inserted = await pool.query<{ id: number }>(
          `INSERT INTO media_library
             (file_hash, storage_key, storage_provider, media_type, mime_type, extension,
              original_filename, display_name, file_size)
           VALUES ($1,$2,'LOCAL',$3,$4,$5,$6,$7,$8)
           RETURNING id`,
          [fileHash, storageKey, mediaType, mimeType, ext, displayName, displayName, buffer.length]
        );
        mediaId = inserted.rows[0].id;
        console.log(`Row ${row.id}: created media_id=${mediaId}`);
      }

      // Set media_id and increment reference_count
      await pool.query(`UPDATE quick_replies SET media_id = $1 WHERE id = $2`, [mediaId, row.id]);
      await pool.query(
        `UPDATE media_library SET reference_count = reference_count + 1 WHERE id = $1`,
        [mediaId]
      );
      migrated++;
    } catch (err) {
      console.error(`Row ${row.id}: ERROR —`, err);
      failed++;
    }
  }

  console.log(`Done. migrated=${migrated} skipped=${skipped} failed=${failed}`);
  await pool.end();
}

run().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Run the script (if there is existing media_content data)**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot
DATABASE_URL="$DATABASE_URL" MEDIA_UPLOAD_DIR="/uploads/media" \
  npx ts-node --project erp/tsconfig.json scripts/migrate-quick-reply-media.ts
```

Expected output (if no existing data): `Found 0 rows to migrate. Done. migrated=0 skipped=0 failed=0`

- [ ] **Step 3: Verify (after running)**

```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM quick_replies WHERE media_content IS NOT NULL AND media_id IS NULL;"
```

Expected: `0` (all migrated rows now have `media_id` set).

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-quick-reply-media.ts
git commit -m "feat(quick-reply): data migration script — base64 media_content → media_library"
```

---

### Task 3: Update QuickReply types and repository

**Files:**
- Modify: `erp/src/lib/types.ts` (lines 300–318)
- Modify: `erp/src/lib/repositories/support_repo.ts` (lines 440–568)

**Interfaces:**
- Consumes: `MediaRecord` from `@/lib/media/types`; `pool` from `@/lib/db`
- Produces:
  - `QuickReplyContentType` (exported type)
  - `QuickReply` interface (updated — adds `caption`, `media_id`, `media?`, `updated_at`)
  - `getQuickReplies(adminUsername)` — unchanged signature, updated columns
  - `getAllQuickRepliesAdmin()` — unchanged signature, updated columns
  - `getQuickReplyById(id)` — returns `QuickReply & { media_content: string | null }` (keep `media_content` for 5.4D relay path)
  - `createQuickReply(data)` — new `data` shape (removes `media_content`, adds `media_id`, `caption`)
  - `updateQuickReply(id, data)` — new `data` shape (removes `media_content`, adds `media_id`, `caption`)
  - `deleteQuickReply(id)` — now decrements `reference_count` if `media_id` was set

- [ ] **Step 1: Write failing tests**

Create `erp/tests/quick-reply-repo.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pool before importing the module
vi.mock('@/lib/db', () => ({
  default: { query: vi.fn() },
}));

import pool from '@/lib/db';
import {
  getQuickReplies,
  getAllQuickRepliesAdmin,
  createQuickReply,
  updateQuickReply,
  deleteQuickReply,
} from '@/lib/repositories/support_repo';

beforeEach(() => vi.clearAllMocks());

const baseRow = {
  id: 1, category_id: null, category_name: null, title: 'Hi', body: 'Hello',
  caption: null, content_type: 'TEXT', media_id: null, is_active: true,
  sort_order: 0, is_favorite: false, created_at: '2026-01-01', updated_at: '2026-01-01',
  ml_id: null, ml_media_type: null, ml_mime_type: null, ml_extension: null,
  ml_original_filename: null, ml_display_name: null, ml_file_size: null,
  ml_storage_key: null, ml_storage_provider: null, ml_file_hash: null,
  ml_width: null, ml_height: null, ml_duration: null,
  ml_thumbnail_key: null, ml_thumbnail_status: null, ml_metadata: null,
  ml_usage_count: null, ml_reference_count: null, ml_last_used_at: null,
  ml_last_used_module: null, ml_download_count: null, ml_last_downloaded_at: null,
  ml_created_by: null, ml_created_at: null, ml_updated_at: null,
  ml_is_active: null, ml_deleted_at: null, ml_deleted_by: null, ml_tenant_id: null,
};

describe('getQuickReplies', () => {
  it('returns mapped quick reply records without media', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [baseRow] } as never);
    const result = await getQuickReplies('admin1');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 1, title: 'Hi', body: 'Hello', media: undefined });
  });
});

describe('createQuickReply', () => {
  it('inserts without media_id and does not touch reference_count', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [baseRow] } as never);
    const result = await createQuickReply({
      category_id: null, title: 'Hi', body: 'Hello', content_type: 'TEXT',
      media_id: null, caption: null, sort_order: 0, created_by: 'admin1',
    });
    expect(result.title).toBe('Hi');
    expect(vi.mocked(pool.query)).toHaveBeenCalledTimes(1); // only INSERT, no refcount
  });

  it('increments reference_count when media_id provided', async () => {
    const rowWithMedia = { ...baseRow, media_id: 42, content_type: 'IMAGE' };
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [rowWithMedia] } as never) // INSERT
      .mockResolvedValueOnce({ rows: [] } as never);             // UPDATE reference_count
    await createQuickReply({
      category_id: null, title: 'Photo', body: '', content_type: 'IMAGE',
      media_id: 42, caption: 'A photo', sort_order: 0, created_by: 'admin1',
    });
    expect(vi.mocked(pool.query)).toHaveBeenCalledTimes(2);
    const refCall = vi.mocked(pool.query).mock.calls[1];
    expect(refCall[0]).toContain('reference_count + 1');
    expect(refCall[1]).toEqual([42]);
  });
});

describe('updateQuickReply', () => {
  it('decrements old and increments new when media_id changes', async () => {
    // Simulate: current row has media_id=10, update sets media_id=20
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ media_id: 10 }] } as never)  // SELECT current
      .mockResolvedValueOnce({ rows: [baseRow] } as never)             // UPDATE
      .mockResolvedValueOnce({ rows: [] } as never)                    // decrement old
      .mockResolvedValueOnce({ rows: [] } as never);                   // increment new
    await updateQuickReply(1, { media_id: 20 });
    const calls = vi.mocked(pool.query).mock.calls;
    expect(calls[2][0]).toContain('reference_count - 1');
    expect(calls[2][1]).toEqual([10]);
    expect(calls[3][0]).toContain('reference_count + 1');
    expect(calls[3][1]).toEqual([20]);
  });
});

describe('deleteQuickReply', () => {
  it('decrements reference_count when quick reply had media_id', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ media_id: 5 }] } as never) // SELECT current
      .mockResolvedValueOnce({ rows: [] } as never)                  // DELETE
      .mockResolvedValueOnce({ rows: [] } as never);                 // decrement
    await deleteQuickReply(1);
    const calls = vi.mocked(pool.query).mock.calls;
    expect(calls[2][0]).toContain('reference_count - 1');
    expect(calls[2][1]).toEqual([5]);
  });

  it('does not touch reference_count when media_id was null', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ media_id: null }] } as never) // SELECT current
      .mockResolvedValueOnce({ rows: [] } as never);                    // DELETE
    await deleteQuickReply(2);
    expect(vi.mocked(pool.query)).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd erp && npm test -- tests/quick-reply-repo.test.ts 2>&1 | tail -10
```

Expected: FAIL (functions don't have the new signatures yet).

- [ ] **Step 3: Update `erp/src/lib/types.ts`**

Read the file first. Replace lines 300–318 (the QuickReply block) with:

```typescript
export type QuickReplyContentType =
  | 'TEXT' | 'IMAGE' | 'GIF' | 'VIDEO' | 'AUDIO' | 'VOICE'
  | 'DOCUMENT' | 'PDF' | 'APK' | 'ZIP' | 'RAR';

export interface QuickReplyCategory {
  id: number;
  name: string;
  sort_order: number;
}

export interface QuickReply {
  id: number;
  category_id: number | null;
  category_name: string | null;
  title: string;
  /** Text body. For TEXT type: the sent message. For media types: used as fallback text. */
  body: string;
  /** Optional caption displayed under media. Separate from body. */
  caption: string | null;
  content_type: QuickReplyContentType;
  /** FK to media_library. NULL for TEXT type. */
  media_id: number | null;
  /** Joined media record — present in admin list responses only. */
  media?: import('@/lib/media/types').MediaRecord;
  is_active: boolean;
  sort_order: number;
  is_favorite?: boolean;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 4: Update `erp/src/lib/repositories/support_repo.ts`**

Read the file. Replace the entire Quick Replies section (lines 440–568) with the following. Keep all code before line 440 and after line 568 unchanged.

```typescript
// ── Quick Replies ─────────────────────────────────────────────────────────────

import type { MediaRecord, MediaModule, MediaType, ThumbnailStatus } from '@/lib/media/types';
import type { QuickReplyContentType } from '@/lib/types';

// Converts a joined media_library row (prefixed ml_*) to MediaRecord.
// Returns undefined if ml_id is null (no joined media).
function mediaFromRow(row: Record<string, unknown>): MediaRecord | undefined {
  if (row.ml_id == null) return undefined;
  return {
    id:               row.ml_id as number,
    tenantId:         row.ml_tenant_id as number | null,
    fileHash:         row.ml_file_hash as string,
    storageKey:       row.ml_storage_key as string,
    storageProvider:  row.ml_storage_provider as string,
    mediaType:        row.ml_media_type as MediaType,
    mimeType:         row.ml_mime_type as string,
    extension:        row.ml_extension as string,
    originalFilename: row.ml_original_filename as string,
    displayName:      row.ml_display_name as string,
    fileSize:         Number(row.ml_file_size),
    width:            row.ml_width != null ? Number(row.ml_width) : null,
    height:           row.ml_height != null ? Number(row.ml_height) : null,
    duration:         row.ml_duration != null ? Number(row.ml_duration) : null,
    thumbnailKey:     row.ml_thumbnail_key as string | null,
    thumbnailStatus:  row.ml_thumbnail_status as ThumbnailStatus,
    metadata:         (row.ml_metadata ?? {}) as Record<string, unknown>,
    usageCount:       Number(row.ml_usage_count ?? 0),
    referenceCount:   Number(row.ml_reference_count ?? 0),
    lastUsedAt:       row.ml_last_used_at as string | null,
    lastUsedModule:   row.ml_last_used_module as MediaModule | null,
    downloadCount:    Number(row.ml_download_count ?? 0),
    lastDownloadedAt: row.ml_last_downloaded_at as string | null,
    createdBy:        row.ml_created_by != null ? Number(row.ml_created_by) : null,
    createdAt:        row.ml_created_at as string,
    updatedAt:        row.ml_updated_at as string,
    isActive:         row.ml_is_active as boolean,
    deletedAt:        row.ml_deleted_at as string | null,
    deletedBy:        row.ml_deleted_by != null ? Number(row.ml_deleted_by) : null,
  };
}

// Columns from quick_replies (no media_content — excluded for payload size)
const QR_COLS = `
  qr.id, qr.category_id, qrc.name AS category_name, qr.title, qr.body,
  qr.caption, qr.content_type, qr.media_id, qr.is_active, qr.sort_order,
  qr.created_at, qr.updated_at`;

// Columns from media_library joined as ml_* aliases
const ML_COLS = `
  ml.id              AS ml_id,
  ml.tenant_id       AS ml_tenant_id,
  ml.file_hash       AS ml_file_hash,
  ml.storage_key     AS ml_storage_key,
  ml.storage_provider AS ml_storage_provider,
  ml.media_type      AS ml_media_type,
  ml.mime_type       AS ml_mime_type,
  ml.extension       AS ml_extension,
  ml.original_filename AS ml_original_filename,
  ml.display_name    AS ml_display_name,
  ml.file_size       AS ml_file_size,
  ml.width           AS ml_width,
  ml.height          AS ml_height,
  ml.duration        AS ml_duration,
  ml.thumbnail_key   AS ml_thumbnail_key,
  ml.thumbnail_status AS ml_thumbnail_status,
  ml.metadata        AS ml_metadata,
  ml.usage_count     AS ml_usage_count,
  ml.reference_count AS ml_reference_count,
  ml.last_used_at    AS ml_last_used_at,
  ml.last_used_module AS ml_last_used_module,
  ml.download_count  AS ml_download_count,
  ml.last_downloaded_at AS ml_last_downloaded_at,
  ml.created_by      AS ml_created_by,
  ml.created_at      AS ml_created_at,
  ml.updated_at      AS ml_updated_at,
  ml.is_active       AS ml_is_active,
  ml.deleted_at      AS ml_deleted_at,
  ml.deleted_by      AS ml_deleted_by`;

function qrFromRow(row: Record<string, unknown>, isFavorite = false): import('@/lib/types').QuickReply {
  return {
    id:            row.id as number,
    category_id:   row.category_id as number | null,
    category_name: row.category_name as string | null,
    title:         row.title as string,
    body:          row.body as string,
    caption:       row.caption as string | null,
    content_type:  row.content_type as QuickReplyContentType,
    media_id:      row.media_id as number | null,
    media:         mediaFromRow(row),
    is_active:     row.is_active as boolean,
    sort_order:    row.sort_order as number,
    is_favorite:   row.is_favorite != null ? (row.is_favorite as boolean) : isFavorite,
    created_at:    row.created_at as string,
    updated_at:    row.updated_at as string,
  };
}

async function incrementRefCount(mediaId: number): Promise<void> {
  await pool.query(
    `UPDATE media_library SET reference_count = reference_count + 1 WHERE id = $1`,
    [mediaId]
  );
}

async function decrementRefCount(mediaId: number): Promise<void> {
  await pool.query(
    `UPDATE media_library SET reference_count = GREATEST(0, reference_count - 1) WHERE id = $1`,
    [mediaId]
  );
}

export async function getQuickReplies(adminUsername: string): Promise<import('@/lib/types').QuickReply[]> {
  // Active replies only — used by the ReplyBox picker.
  const { rows } = await pool.query(
    `SELECT ${QR_COLS},
            (qrf.admin_username IS NOT NULL) AS is_favorite,
            ${ML_COLS}
     FROM quick_replies qr
     LEFT JOIN quick_reply_categories qrc ON qrc.id = qr.category_id
     LEFT JOIN quick_reply_favorites  qrf ON qrf.reply_id = qr.id AND qrf.admin_username = $1
     LEFT JOIN media_library ml           ON ml.id = qr.media_id AND ml.deleted_at IS NULL
     WHERE qr.is_active = TRUE
     ORDER BY qrc.sort_order NULLS LAST, qr.sort_order, qr.id`,
    [adminUsername]
  );
  return rows.map(r => qrFromRow(r as Record<string, unknown>));
}

export async function getAllQuickRepliesAdmin(): Promise<import('@/lib/types').QuickReply[]> {
  // All replies (active + inactive) — used by the manager page.
  const { rows } = await pool.query(
    `SELECT ${QR_COLS},
            FALSE AS is_favorite,
            ${ML_COLS}
     FROM quick_replies qr
     LEFT JOIN quick_reply_categories qrc ON qrc.id = qr.category_id
     LEFT JOIN media_library ml           ON ml.id = qr.media_id AND ml.deleted_at IS NULL
     ORDER BY qrc.sort_order NULLS LAST, qr.sort_order, qr.id`
  );
  return rows.map(r => qrFromRow(r as Record<string, unknown>));
}

export async function getQuickReplyById(
  id: number
): Promise<(import('@/lib/types').QuickReply & { media_content: string | null }) | null> {
  // Used by the relay send path — includes media_content for 5.4D backward compat.
  const { rows } = await pool.query(
    `SELECT ${QR_COLS}, FALSE AS is_favorite, qr.media_content, ${ML_COLS}
     FROM quick_replies qr
     LEFT JOIN quick_reply_categories qrc ON qrc.id = qr.category_id
     LEFT JOIN media_library ml           ON ml.id = qr.media_id AND ml.deleted_at IS NULL
     WHERE qr.id = $1`,
    [id]
  );
  if (!rows[0]) return null;
  const row = rows[0] as Record<string, unknown>;
  return {
    ...qrFromRow(row),
    media_content: row.media_content as string | null,
  };
}

export async function getQuickReplyCategories(): Promise<import('@/lib/types').QuickReplyCategory[]> {
  const { rows } = await pool.query(
    `SELECT id, name, sort_order FROM quick_reply_categories ORDER BY sort_order`
  );
  return rows;
}

export async function createQuickReply(data: {
  category_id: number | null;
  title: string;
  body: string;
  content_type: QuickReplyContentType;
  media_id: number | null;
  caption: string | null;
  sort_order: number;
  created_by: string;
}): Promise<import('@/lib/types').QuickReply> {
  const { rows } = await pool.query(
    `INSERT INTO quick_replies
       (category_id, title, body, content_type, media_id, caption, sort_order, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, category_id, NULL AS category_name, title, body, caption,
               content_type, media_id, is_active, sort_order, created_at, updated_at,
               FALSE AS is_favorite`,
    [data.category_id, data.title, data.body, data.content_type,
     data.media_id, data.caption, data.sort_order, data.created_by]
  );
  const row = rows[0] as Record<string, unknown>;
  if (data.media_id) await incrementRefCount(data.media_id);
  return qrFromRow(row);
}

export async function updateQuickReply(
  id: number,
  data: {
    category_id?: number | null;
    title?: string;
    body?: string;
    caption?: string | null;
    sort_order?: number;
    is_active?: boolean;
    content_type?: QuickReplyContentType;
    media_id?: number | null;
    is_favorite?: boolean;
  }
): Promise<import('@/lib/types').QuickReply | null> {
  // Fetch current media_id to compute reference_count delta
  const current = await pool.query<{ media_id: number | null }>(
    `SELECT media_id FROM quick_replies WHERE id = $1`, [id]
  );
  if (!current.rows[0]) return null;
  const oldMediaId = current.rows[0].media_id;

  const sets: string[] = [];
  const params: (string | number | boolean | null)[] = [];
  let i = 1;
  if ('category_id'  in data) { sets.push(`category_id=$${i++}`);  params.push(data.category_id ?? null); }
  if (data.title     !== undefined) { sets.push(`title=$${i++}`);    params.push(data.title); }
  if (data.body      !== undefined) { sets.push(`body=$${i++}`);     params.push(data.body); }
  if ('caption'      in data) { sets.push(`caption=$${i++}`);       params.push(data.caption ?? null); }
  if (data.sort_order!== undefined) { sets.push(`sort_order=$${i++}`); params.push(data.sort_order); }
  if (data.is_active !== undefined) { sets.push(`is_active=$${i++}`); params.push(data.is_active); }
  if (data.content_type !== undefined) { sets.push(`content_type=$${i++}`); params.push(data.content_type); }
  if ('media_id'     in data) { sets.push(`media_id=$${i++}`);      params.push(data.media_id ?? null); }
  if (!sets.length) return null;

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE quick_replies SET ${sets.join(', ')} WHERE id=$${i}
     RETURNING id, category_id, NULL AS category_name, title, body, caption,
               content_type, media_id, is_active, sort_order, created_at, updated_at,
               FALSE AS is_favorite`,
    params
  );
  if (!rows[0]) return null;

  // Handle reference_count changes
  if ('media_id' in data) {
    const newMediaId = data.media_id ?? null;
    if (oldMediaId !== newMediaId) {
      if (oldMediaId) await decrementRefCount(oldMediaId);
      if (newMediaId) await incrementRefCount(newMediaId);
    }
  }

  // Handle is_favorite separately (uses quick_reply_favorites table)
  if (data.is_favorite !== undefined) {
    if (data.is_favorite) {
      await pool.query(
        // cannot get admin_username here — is_favorite is handled in the route
        // Route must call toggleFavoriteQuickReply directly
        `SELECT 1` // no-op placeholder
      );
    }
  }

  return qrFromRow(rows[0] as Record<string, unknown>);
}

export async function deleteQuickReply(id: number): Promise<void> {
  const current = await pool.query<{ media_id: number | null }>(
    `SELECT media_id FROM quick_replies WHERE id = $1`, [id]
  );
  const mediaId = current.rows[0]?.media_id ?? null;
  await pool.query(`DELETE FROM quick_replies WHERE id = $1`, [id]);
  if (mediaId) await decrementRefCount(mediaId);
}

export async function toggleFavoriteQuickReply(
  adminUsername: string,
  replyId: number,
  isFavorite: boolean
): Promise<void> {
  if (isFavorite) {
    await pool.query(
      `INSERT INTO quick_reply_favorites (admin_username, reply_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [adminUsername, replyId]
    );
  } else {
    await pool.query(
      `DELETE FROM quick_reply_favorites WHERE admin_username=$1 AND reply_id=$2`,
      [adminUsername, replyId]
    );
  }
}
```

**Important note on `is_favorite` in `updateQuickReply`:** Remove the `is_favorite` branch from `updateQuickReply` — the `no-op placeholder` above is wrong. Instead, the `PATCH /[id]` route will call `toggleFavoriteQuickReply` directly when it sees `is_favorite` in the body, and will NOT pass `is_favorite` to `updateQuickReply`. Remove `is_favorite` from `updateQuickReply`'s `data` type entirely, and remove the `is_favorite` branch from the implementation.

The correct `updateQuickReply` `data` type:
```typescript
data: {
  category_id?: number | null;
  title?: string;
  body?: string;
  caption?: string | null;
  sort_order?: number;
  is_active?: boolean;
  content_type?: QuickReplyContentType;
  media_id?: number | null;
  // is_favorite is NOT here — handled by toggleFavoriteQuickReply
}
```

- [ ] **Step 5: Run tests**

```bash
cd erp && npm test -- tests/quick-reply-repo.test.ts 2>&1 | tail -10
```

Expected: All tests PASS.

- [ ] **Step 6: TypeScript check**

```bash
cd erp && npm run lint 2>&1 | tail -5
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add erp/src/lib/types.ts erp/src/lib/repositories/support_repo.ts erp/tests/quick-reply-repo.test.ts
git commit -m "feat(quick-reply): update types and repository for media_id, caption, reference counting"
```

---

### Task 4: Update API routes — GET/POST and new PATCH/DELETE [id]

**Files:**
- Modify: `erp/src/app/api/livechat/quick-replies/route.ts`
- Create: `erp/src/app/api/livechat/quick-replies/[id]/route.ts`
- Create: `erp/tests/quick-reply-route.test.ts`
- Create: `erp/tests/quick-reply-id-route.test.ts`

**Interfaces:**
- Consumes: `getQuickReplies`, `getAllQuickRepliesAdmin`, `getQuickReplyCategories`, `createQuickReply` from `support_repo`; `updateQuickReply`, `deleteQuickReply`, `toggleFavoriteQuickReply` from `support_repo`
- Produces:
  - `GET /api/livechat/quick-replies` → `{ replies: QuickReply[], categories: QuickReplyCategory[] }` (unchanged URL, updated shape with media/caption)
  - `POST /api/livechat/quick-replies` → `{ reply: QuickReply }` (body: `{ title, body?, content_type, media_id?, caption?, category_id?, sort_order? }`)
  - `PATCH /api/livechat/quick-replies/:id` → `{ reply: QuickReply }` (body: any subset of fields + `is_favorite?`)
  - `DELETE /api/livechat/quick-replies/:id` → `{ ok: true }`

- [ ] **Step 1: Write failing tests**

Create `erp/tests/quick-reply-route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  verifyJWT: vi.fn().mockResolvedValue({ sub: 1, username: 'admin1', role: 'ADMIN' }),
  COOKIE_NAME: 'token',
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => ({ value: 'tok' }) }),
}));
vi.mock('@/lib/repositories/support_repo', () => ({
  getQuickReplies: vi.fn(),
  getAllQuickRepliesAdmin: vi.fn(),
  getQuickReplyCategories: vi.fn(),
  createQuickReply: vi.fn(),
}));

import { GET, POST } from '@/app/api/livechat/quick-replies/route';
import {
  getAllQuickRepliesAdmin,
  getQuickReplies,
  getQuickReplyCategories,
  createQuickReply,
} from '@/lib/repositories/support_repo';

const BASE_REPLY = {
  id: 1, category_id: null, category_name: null, title: 'Hi', body: 'Hello',
  caption: null, content_type: 'TEXT', media_id: null, media: undefined,
  is_active: true, sort_order: 0, is_favorite: false,
  created_at: '2026-01-01', updated_at: '2026-01-01',
};

beforeEach(() => vi.clearAllMocks());

describe('GET /api/livechat/quick-replies', () => {
  it('returns admin list when ?admin=1', async () => {
    vi.mocked(getAllQuickRepliesAdmin).mockResolvedValueOnce([BASE_REPLY]);
    vi.mocked(getQuickReplyCategories).mockResolvedValueOnce([]);
    const res = await GET(new NextRequest('http://localhost/api/livechat/quick-replies?admin=1'));
    const d = await res.json() as { replies: unknown[]; categories: unknown[] };
    expect(d.replies).toHaveLength(1);
    expect(getAllQuickRepliesAdmin).toHaveBeenCalledTimes(1);
    expect(getQuickReplies).not.toHaveBeenCalled();
  });
});

describe('POST /api/livechat/quick-replies', () => {
  it('creates TEXT reply', async () => {
    vi.mocked(createQuickReply).mockResolvedValueOnce(BASE_REPLY);
    const res = await POST(new NextRequest('http://localhost/api/livechat/quick-replies', {
      method: 'POST',
      body: JSON.stringify({ title: 'Hi', body: 'Hello', content_type: 'TEXT' }),
    }));
    expect(res.status).toBe(201);
    expect(createQuickReply).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Hi', body: 'Hello', content_type: 'TEXT', media_id: null,
    }));
  });

  it('creates IMAGE reply with media_id', async () => {
    const reply = { ...BASE_REPLY, content_type: 'IMAGE', media_id: 5, caption: 'A photo' };
    vi.mocked(createQuickReply).mockResolvedValueOnce(reply);
    const res = await POST(new NextRequest('http://localhost/api/livechat/quick-replies', {
      method: 'POST',
      body: JSON.stringify({ title: 'Photo', body: '', content_type: 'IMAGE', media_id: 5, caption: 'A photo' }),
    }));
    expect(res.status).toBe(201);
    expect(createQuickReply).toHaveBeenCalledWith(expect.objectContaining({ media_id: 5, caption: 'A photo' }));
  });

  it('returns 400 when title missing', async () => {
    const res = await POST(new NextRequest('http://localhost/api/livechat/quick-replies', {
      method: 'POST',
      body: JSON.stringify({ body: 'text', content_type: 'TEXT' }),
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for unknown content_type', async () => {
    const res = await POST(new NextRequest('http://localhost/api/livechat/quick-replies', {
      method: 'POST',
      body: JSON.stringify({ title: 'X', content_type: 'INVALID' }),
    }));
    expect(res.status).toBe(400);
  });
});
```

Create `erp/tests/quick-reply-id-route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  verifyJWT: vi.fn().mockResolvedValue({ sub: 1, username: 'admin1', role: 'ADMIN' }),
  COOKIE_NAME: 'token',
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => ({ value: 'tok' }) }),
}));
vi.mock('@/lib/repositories/support_repo', () => ({
  updateQuickReply: vi.fn(),
  deleteQuickReply: vi.fn(),
  toggleFavoriteQuickReply: vi.fn(),
}));

import { PATCH, DELETE } from '@/app/api/livechat/quick-replies/[id]/route';
import { updateQuickReply, deleteQuickReply, toggleFavoriteQuickReply } from '@/lib/repositories/support_repo';

const BASE_REPLY = {
  id: 1, title: 'Hi', body: 'Hello', caption: null, content_type: 'TEXT',
  media_id: null, is_active: true, sort_order: 0, is_favorite: false,
  category_id: null, category_name: null, created_at: '2026-01-01', updated_at: '2026-01-01',
};

beforeEach(() => vi.clearAllMocks());

const makeParams = (id: string) =>
  ({ params: Promise.resolve({ id }) }) as { params: Promise<{ id: string }> };

describe('PATCH /api/livechat/quick-replies/:id', () => {
  it('updates is_active', async () => {
    vi.mocked(updateQuickReply).mockResolvedValueOnce({ ...BASE_REPLY, is_active: false });
    const res = await PATCH(
      new NextRequest('http://localhost/api/livechat/quick-replies/1', {
        method: 'PATCH', body: JSON.stringify({ is_active: false }),
      }),
      makeParams('1')
    );
    expect(res.status).toBe(200);
    expect(updateQuickReply).toHaveBeenCalledWith(1, { is_active: false });
  });

  it('calls toggleFavoriteQuickReply for is_favorite', async () => {
    vi.mocked(toggleFavoriteQuickReply).mockResolvedValueOnce(undefined);
    vi.mocked(updateQuickReply).mockResolvedValueOnce(BASE_REPLY);
    const res = await PATCH(
      new NextRequest('http://localhost/api/livechat/quick-replies/1', {
        method: 'PATCH', body: JSON.stringify({ is_favorite: true }),
      }),
      makeParams('1')
    );
    expect(res.status).toBe(200);
    expect(toggleFavoriteQuickReply).toHaveBeenCalledWith('admin1', 1, true);
  });

  it('returns 400 for invalid id', async () => {
    const res = await PATCH(
      new NextRequest('http://localhost/api/livechat/quick-replies/abc', {
        method: 'PATCH', body: JSON.stringify({ is_active: true }),
      }),
      makeParams('abc')
    );
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/livechat/quick-replies/:id', () => {
  it('deletes and returns ok', async () => {
    vi.mocked(deleteQuickReply).mockResolvedValueOnce(undefined);
    const res = await DELETE(
      new NextRequest('http://localhost/api/livechat/quick-replies/1', { method: 'DELETE' }),
      makeParams('1')
    );
    expect(res.status).toBe(200);
    const d = await res.json() as { ok: boolean };
    expect(d.ok).toBe(true);
    expect(deleteQuickReply).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd erp && npm test -- tests/quick-reply-route.test.ts tests/quick-reply-id-route.test.ts 2>&1 | tail -10
```

Expected: FAIL (routes not implemented yet).

- [ ] **Step 3: Update `erp/src/app/api/livechat/quick-replies/route.ts`**

Replace the entire file:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import {
  getQuickReplies,
  getAllQuickRepliesAdmin,
  getQuickReplyCategories,
  createQuickReply,
} from '@/lib/repositories/support_repo';

const VALID_CONTENT_TYPES = new Set([
  'TEXT','IMAGE','GIF','VIDEO','AUDIO','VOICE','DOCUMENT','PDF','APK','ZIP','RAR',
]);

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  const adminUsername = payload?.username ?? '';

  const isAdmin = req.nextUrl.searchParams.get('admin') === '1';
  const [replies, categories] = await Promise.all([
    isAdmin ? getAllQuickRepliesAdmin() : getQuickReplies(adminUsername),
    getQuickReplyCategories(),
  ]);
  return NextResponse.json({ replies, categories });
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });

  const contentType = typeof body.content_type === 'string'
    ? body.content_type.toUpperCase()
    : 'TEXT';
  if (!VALID_CONTENT_TYPES.has(contentType)) {
    return NextResponse.json({ error: `invalid content_type: ${contentType}` }, { status: 400 });
  }

  const textBody = typeof body.body === 'string' ? body.body.trim() : '';
  if (contentType === 'TEXT' && !textBody) {
    return NextResponse.json({ error: 'body required for TEXT type' }, { status: 400 });
  }

  const mediaId = typeof body.media_id === 'number' ? body.media_id : null;
  if (contentType !== 'TEXT' && !mediaId) {
    return NextResponse.json({ error: 'media_id required for media type' }, { status: 400 });
  }

  const reply = await createQuickReply({
    category_id: typeof body.category_id === 'number' ? body.category_id : null,
    title,
    body: textBody,
    content_type: contentType as import('@/lib/types').QuickReplyContentType,
    media_id: mediaId,
    caption: typeof body.caption === 'string' ? body.caption.trim() || null : null,
    sort_order: typeof body.sort_order === 'number' ? body.sort_order : 0,
    created_by: payload.username,
  });
  return NextResponse.json({ reply }, { status: 201 });
}
```

- [ ] **Step 4: Create `erp/src/app/api/livechat/quick-replies/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import {
  updateQuickReply,
  deleteQuickReply,
  toggleFavoriteQuickReply,
} from '@/lib/repositories/support_repo';

async function getPayload() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  return token ? await verifyJWT(token) : null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await getPayload();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const replyId = parseInt(id, 10);
  if (isNaN(replyId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;

  // Handle favorite toggle first (separate table)
  if (typeof body.is_favorite === 'boolean') {
    await toggleFavoriteQuickReply(payload.username, replyId, body.is_favorite);
  }

  // Build update payload (exclude is_favorite — handled above)
  const updateData: Parameters<typeof updateQuickReply>[1] = {};
  if ('category_id'  in body) updateData.category_id  = (body.category_id  as number | null);
  if ('title'        in body) updateData.title        = body.title        as string;
  if ('body'         in body) updateData.body         = body.body         as string;
  if ('caption'      in body) updateData.caption      = (body.caption     as string | null);
  if ('sort_order'   in body) updateData.sort_order   = body.sort_order   as number;
  if ('is_active'    in body) updateData.is_active    = body.is_active    as boolean;
  if ('content_type' in body) updateData.content_type = body.content_type as import('@/lib/types').QuickReplyContentType;
  if ('media_id'     in body) updateData.media_id     = (body.media_id    as number | null);

  // If only is_favorite changed, updateQuickReply has no sets — return current state
  let reply: import('@/lib/types').QuickReply | null = null;
  if (Object.keys(updateData).length > 0) {
    reply = await updateQuickReply(replyId, updateData);
    if (!reply) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, reply });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await getPayload();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const replyId = parseInt(id, 10);
  if (isNaN(replyId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  await deleteQuickReply(replyId);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Run all tests**

```bash
cd erp && npm test -- tests/quick-reply-route.test.ts tests/quick-reply-id-route.test.ts tests/quick-reply-repo.test.ts 2>&1 | tail -10
```

Expected: All tests PASS.

- [ ] **Step 6: Full test suite**

```bash
cd erp && npm test 2>&1 | tail -5
```

Expected: All existing 79 + new tests PASS.

- [ ] **Step 7: TypeScript check**

```bash
cd erp && npm run lint 2>&1 | tail -5
```

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add erp/src/app/api/livechat/quick-replies/route.ts \
        erp/src/app/api/livechat/quick-replies/\[id\]/route.ts \
        erp/tests/quick-reply-route.test.ts \
        erp/tests/quick-reply-id-route.test.ts
git commit -m "feat(quick-reply): update GET/POST route and add PATCH/DELETE [id] route"
```

---

### Task 5: MediaPicker component

**Files:**
- Create: `erp/src/app/(dashboard)/media-library/MediaPicker.tsx`

**Interfaces:**
- Consumes: `MediaRecord` from `@/lib/media/types`; `MediaCard` from `./MediaCard`; `UploadZone` from `./UploadZone`; `GET /api/media` endpoint
- Produces: `export function MediaPicker({ onSelect, onClose, allowedTypes? })`

The MediaPicker is a fixed modal overlay. It shows the Media Library grid with type filters, search, and an "Upload New" tab. Clicking a card selects it; the "Select" button calls `onSelect(media)` and `onClose()`.

- [ ] **Step 1: Create `erp/src/app/(dashboard)/media-library/MediaPicker.tsx`**

```typescript
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { MediaRecord } from '@/lib/media/types';
import { MediaCard } from './MediaCard';
import { UploadZone } from './UploadZone';

const PICKER_FILTERS = [
  { label: 'All',       value: '' },
  { label: 'Images',    value: 'IMAGE' },
  { label: 'GIF',       value: 'GIF' },
  { label: 'Videos',    value: 'VIDEO' },
  { label: 'Audio',     value: 'AUDIO' },
  { label: 'Documents', value: 'DOCUMENT' },
  { label: 'PDF',       value: 'PDF' },
  { label: 'APK',       value: 'APK' },
];

const LIMIT = 24;

export function MediaPicker({
  onSelect,
  onClose,
  allowedTypes,
}: {
  onSelect: (media: MediaRecord) => void;
  onClose: () => void;
  /** If provided, only these types are shown and the type filter is hidden. */
  allowedTypes?: string[];
}) {
  const [tab, setTab]           = useState<'browse' | 'upload'>('browse');
  const [media, setMedia]       = useState<MediaRecord[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [typeFilter, setTypeFilter] = useState(allowedTypes?.[0] ?? '');
  const [selected, setSelected] = useState<MediaRecord | null>(null);
  const [loading, setLoading]   = useState(true);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const loadMedia = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ page: String(page), limit: String(LIMIT), sort: 'newest' });
    if (search)     p.set('search', search);
    if (typeFilter) p.set('type', typeFilter);
    const r = await fetch(`/api/media?${p.toString()}`);
    if (r.ok) {
      const d = await r.json() as { media: MediaRecord[]; total: number };
      setMedia(d.media);
      setTotal(d.total);
    }
    setLoading(false);
  }, [page, search, typeFilter]);

  useEffect(() => { void loadMedia(); }, [loadMedia]);

  // Debounce search — reset page when search changes
  const handleSearchChange = (value: string) => {
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 300);
  };

  function handleUploadComplete() {
    void loadMedia();
    setTab('browse');
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white rounded-xl shadow-2xl w-[860px] max-h-[88vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <h2 className="text-lg font-semibold">Choose Media</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-5 shrink-0">
          {(['browse', 'upload'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-2.5 px-4 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-400 hover:text-gray-700'
              }`}
            >
              {t === 'browse' ? 'Media Library' : 'Upload New'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 min-h-0">
          {tab === 'upload' ? (
            <UploadZone onUploadComplete={handleUploadComplete} />
          ) : (
            <div className="space-y-3">
              {/* Filters */}
              <div className="flex flex-wrap gap-2 items-center">
                <Input
                  placeholder="Search…"
                  defaultValue=""
                  onChange={e => handleSearchChange(e.target.value)}
                  className="w-40 h-8 text-sm"
                />
                {!allowedTypes && (
                  <div className="flex gap-1 flex-wrap">
                    {PICKER_FILTERS.map(f => (
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
                )}
              </div>

              {/* Grid */}
              {loading ? (
                <div className="h-52 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
              ) : media.length === 0 ? (
                <div className="h-52 flex flex-col items-center justify-center gap-2 text-gray-400 text-sm">
                  <span>No media found.</span>
                  <button
                    onClick={() => setTab('upload')}
                    className="text-gray-700 underline text-xs"
                  >Upload something</button>
                </div>
              ) : (
                <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
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

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center gap-2 justify-end text-sm pt-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded px-2 py-1 border text-xs disabled:opacity-40 hover:bg-gray-50"
                  >Prev</button>
                  <span className="text-gray-400">{page} / {totalPages}</span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="rounded px-2 py-1 border text-xs disabled:opacity-40 hover:bg-gray-50"
                  >Next</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer (browse tab only) */}
        {tab === 'browse' && (
          <div className="flex items-center justify-between px-5 py-3 border-t bg-gray-50 rounded-b-xl shrink-0">
            <span className="text-sm text-gray-500 truncate max-w-xs">
              {selected ? selected.displayName : 'No media selected'}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button
                size="sm"
                disabled={!selected}
                onClick={() => { if (selected) { onSelect(selected); onClose(); } }}
              >
                Select
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd erp && npm run lint 2>&1 | tail -5
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add erp/src/app/\(dashboard\)/media-library/MediaPicker.tsx
git commit -m "feat(quick-reply): add MediaPicker component for selecting from Media Library"
```

---

### Task 6: Quick Reply Manager page

**Files:**
- Create: `erp/src/app/(dashboard)/livechat/quick-replies/page.tsx`

**Interfaces:**
- Consumes: `QuickReply`, `QuickReplyCategory`, `QuickReplyContentType` from `@/lib/types`; `MediaRecord` from `@/lib/media/types`; `MediaPicker` from `@/app/(dashboard)/media-library/MediaPicker`; `formatBytes` from `@/lib/utils/format-bytes`; all quick-reply API routes
- Produces: `/livechat/quick-replies` page (full Quick Reply Manager)

The page uses a split layout:
- Left: scrollable list with search, category filter, type chips, sort, bulk-select
- Right panel (280px): create/edit form — appears when "+ New" clicked or card clicked

The form handles: title, content_type chips, media picker + preview, caption, category, sort_order, active toggle.

- [ ] **Step 1: Create `erp/src/app/(dashboard)/livechat/quick-replies/page.tsx`**

```typescript
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MessageSquare, Image, Film, Music, FileText, File, Package, Archive,
  Star, Copy, Trash2, Eye, EyeOff, Plus, X, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { QuickReply, QuickReplyCategory, QuickReplyContentType } from '@/lib/types';
import type { MediaRecord } from '@/lib/media/types';
import { formatBytes } from '@/lib/utils/format-bytes';
import { MediaPicker } from '@/app/(dashboard)/media-library/MediaPicker';

// ── Content type config ───────────────────────────────────────────────────────

const CONTENT_TYPES: { value: QuickReplyContentType; label: string; icon: React.ElementType }[] = [
  { value: 'TEXT',     label: 'Text',     icon: MessageSquare },
  { value: 'IMAGE',    label: 'Image',    icon: Image },
  { value: 'GIF',      label: 'GIF',      icon: Image },
  { value: 'VIDEO',    label: 'Video',    icon: Film },
  { value: 'AUDIO',    label: 'Audio',    icon: Music },
  { value: 'VOICE',    label: 'Voice',    icon: Music },
  { value: 'DOCUMENT', label: 'Document', icon: FileText },
  { value: 'PDF',      label: 'PDF',      icon: FileText },
  { value: 'APK',      label: 'APK',      icon: Package },
  { value: 'ZIP',      label: 'ZIP',      icon: Archive },
  { value: 'RAR',      label: 'RAR',      icon: Archive },
];

const TYPE_ICON: Record<string, React.ElementType> = {
  TEXT: MessageSquare, IMAGE: Image, GIF: Image, VIDEO: Film, AUDIO: Music, VOICE: Music,
  DOCUMENT: FileText, PDF: FileText, APK: Package, ZIP: Archive, RAR: Archive,
};

const TYPE_BADGE: Record<string, string> = {
  TEXT: 'bg-gray-100 text-gray-600', IMAGE: 'bg-blue-100 text-blue-700',
  GIF: 'bg-purple-100 text-purple-700', VIDEO: 'bg-red-100 text-red-700',
  AUDIO: 'bg-green-100 text-green-700', VOICE: 'bg-teal-100 text-teal-700',
  DOCUMENT: 'bg-gray-100 text-gray-700', PDF: 'bg-orange-100 text-orange-700',
  APK: 'bg-yellow-100 text-yellow-700', ZIP: 'bg-indigo-100 text-indigo-700',
  RAR: 'bg-indigo-100 text-indigo-700',
};

const SORT_OPTIONS = [
  { label: 'Sort Order',     value: 'sort_order' },
  { label: 'Newest First',   value: 'newest' },
  { label: 'A → Z',          value: 'alpha' },
];

// ── Blank form ────────────────────────────────────────────────────────────────

interface FormState {
  title: string;
  body: string;
  caption: string;
  contentType: QuickReplyContentType;
  mediaId: number | null;
  mediaRecord: MediaRecord | null;
  categoryId: number | null;
  sortOrder: number;
  isActive: boolean;
}

function blankForm(): FormState {
  return {
    title: '', body: '', caption: '', contentType: 'TEXT',
    mediaId: null, mediaRecord: null, categoryId: null, sortOrder: 0, isActive: true,
  };
}

function replyToForm(r: QuickReply): FormState {
  return {
    title:       r.title,
    body:        r.body,
    caption:     r.caption ?? '',
    contentType: r.content_type,
    mediaId:     r.media_id,
    mediaRecord: r.media ?? null,
    categoryId:  r.category_id,
    sortOrder:   r.sort_order,
    isActive:    r.is_active,
  };
}

// ── Page component ────────────────────────────────────────────────────────────

export default function QuickRepliesPage() {
  const [replies, setReplies]         = useState<QuickReply[]>([]);
  const [categories, setCategories]   = useState<QuickReplyCategory[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [catFilter, setCatFilter]     = useState<number | null>(null);
  const [typeFilter, setTypeFilter]   = useState<string>('');
  const [sort, setSort]               = useState('sort_order');
  const [selected, setSelected]       = useState<QuickReply | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkMode, setBulkMode]       = useState(false);

  // Form
  const [form, setForm]               = useState<FormState>(blankForm());
  const [editingId, setEditingId]     = useState<number | null>(null); // null = new
  const [showForm, setShowForm]       = useState(false);
  const [formBusy, setFormBusy]       = useState(false);
  const [formError, setFormError]     = useState('');
  const [showPicker, setShowPicker]   = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/livechat/quick-replies?admin=1');
      if (res.ok) {
        const d = await res.json() as { replies: QuickReply[]; categories: QuickReplyCategory[] };
        setReplies(d.replies);
        setCategories(d.categories);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  // ── Filter + sort ─────────────────────────────────────────────────────────

  const filtered = replies
    .filter(r => {
      if (search && !r.title.toLowerCase().includes(search.toLowerCase()) &&
          !r.body.toLowerCase().includes(search.toLowerCase())) return false;
      if (catFilter !== null && r.category_id !== catFilter) return false;
      if (typeFilter && r.content_type !== typeFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (sort === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sort === 'alpha')  return a.title.localeCompare(b.title);
      return (a.sort_order - b.sort_order) || a.id - b.id;
    });

  // ── Form actions ──────────────────────────────────────────────────────────

  function openNew() {
    setEditingId(null);
    setForm(blankForm());
    setFormError('');
    setShowForm(true);
    setSelected(null);
  }

  function openEdit(r: QuickReply) {
    setEditingId(r.id);
    setForm(replyToForm(r));
    setFormError('');
    setShowForm(true);
    setSelected(r);
  }

  function openDuplicate(r: QuickReply) {
    setEditingId(null);
    setForm({ ...replyToForm(r), title: `${r.title} (copy)`, sortOrder: 0 });
    setFormError('');
    setShowForm(true);
    setSelected(null);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(blankForm());
    setFormError('');
  }

  const handleSubmit = async () => {
    setFormError('');
    if (!form.title.trim()) { setFormError('Title is required.'); return; }
    if (form.contentType === 'TEXT' && !form.body.trim()) {
      setFormError('Body is required for Text type.'); return;
    }
    if (form.contentType !== 'TEXT' && !form.mediaId) {
      setFormError('Please select a media file.'); return;
    }
    setFormBusy(true);
    try {
      const payload = {
        title:        form.title.trim(),
        body:         form.body.trim(),
        caption:      form.caption.trim() || null,
        content_type: form.contentType,
        media_id:     form.mediaId,
        category_id:  form.categoryId,
        sort_order:   form.sortOrder,
        is_active:    form.isActive,
      };
      const isEdit = editingId !== null;
      const res = await fetch(
        isEdit ? `/api/livechat/quick-replies/${editingId}` : '/api/livechat/quick-replies',
        { method: isEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      );
      if (res.ok) {
        closeForm();
        await loadData();
      } else {
        const d = await res.json() as { error?: string };
        setFormError(d.error ?? 'Failed');
      }
    } finally {
      setFormBusy(false);
    }
  };

  // ── Card actions ──────────────────────────────────────────────────────────

  const handleToggleActive = async (r: QuickReply) => {
    const next = !r.is_active;
    setReplies(prev => prev.map(x => x.id === r.id ? { ...x, is_active: next } : x));
    const res = await fetch(`/api/livechat/quick-replies/${r.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: next }),
    });
    if (!res.ok) setReplies(prev => prev.map(x => x.id === r.id ? { ...x, is_active: r.is_active } : x));
  };

  const handleToggleFavorite = async (r: QuickReply) => {
    const next = !r.is_favorite;
    setReplies(prev => prev.map(x => x.id === r.id ? { ...x, is_favorite: next } : x));
    await fetch(`/api/livechat/quick-replies/${r.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_favorite: next }),
    });
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this quick reply?')) return;
    const res = await fetch(`/api/livechat/quick-replies/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setReplies(prev => prev.filter(r => r.id !== id));
      if (selected?.id === id) closeForm();
    }
  };

  // ── Bulk actions ──────────────────────────────────────────────────────────

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} quick replies?`)) return;
    await Promise.all([...selectedIds].map(id =>
      fetch(`/api/livechat/quick-replies/${id}`, { method: 'DELETE' })
    ));
    setSelectedIds(new Set());
    setBulkMode(false);
    await loadData();
  };

  const handleBulkToggle = async (active: boolean) => {
    await Promise.all([...selectedIds].map(id =>
      fetch(`/api/livechat/quick-replies/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: active }),
      })
    ));
    setSelectedIds(new Set());
    setBulkMode(false);
    await loadData();
  };

  // ── Media picker ──────────────────────────────────────────────────────────

  function handleMediaSelected(media: MediaRecord) {
    setForm(f => ({ ...f, mediaId: media.id, mediaRecord: media }));
  }

  function clearMedia() {
    setForm(f => ({ ...f, mediaId: null, mediaRecord: null }));
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex gap-0 h-full min-h-0">
      {/* ── Left panel: list ──────────────────────────────────────────────── */}
      <div className={`flex flex-col min-h-0 overflow-hidden ${showForm ? 'flex-1' : 'w-full'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-white shrink-0">
          <h1 className="text-xl font-bold">Quick Replies</h1>
          <div className="flex gap-2">
            <Button
              variant="outline" size="sm"
              onClick={() => { setBulkMode(v => !v); setSelectedIds(new Set()); }}
            >
              {bulkMode ? 'Cancel Select' : 'Select'}
            </Button>
            <Button size="sm" onClick={openNew}>
              <Plus className="w-4 h-4 mr-1" /> New
            </Button>
          </div>
        </div>

        {/* Bulk actions bar */}
        {bulkMode && selectedIds.size > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b text-sm shrink-0">
            <span className="text-blue-700 font-medium">{selectedIds.size} selected</span>
            <Button size="sm" variant="outline" onClick={() => void handleBulkToggle(true)}>Enable</Button>
            <Button size="sm" variant="outline" onClick={() => void handleBulkToggle(false)}>Disable</Button>
            <Button size="sm" variant="outline" onClick={() => void handleBulkDelete()} className="text-red-600 border-red-200 hover:bg-red-50">Delete</Button>
          </div>
        )}

        {/* Filter bar */}
        <div className="flex flex-wrap gap-2 px-4 py-2 border-b bg-white shrink-0">
          <Input
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-44 h-8 text-sm"
          />
          {/* Category chips */}
          <div className="flex gap-1 flex-wrap items-center">
            <button
              onClick={() => setCatFilter(null)}
              className={`rounded-full px-3 py-1 text-xs font-medium border ${catFilter === null ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'}`}
            >All</button>
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => setCatFilter(c.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium border ${catFilter === c.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'}`}
              >{c.name}</button>
            ))}
          </div>
          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400"
          >
            <option value="">All Types</option>
            {CONTENT_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          {/* Sort */}
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400 ml-auto"
          >
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-gray-400 text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-gray-400 text-sm">
              {search || catFilter || typeFilter ? 'No results.' : 'No quick replies yet.'}
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map(r => {
                const Icon = TYPE_ICON[r.content_type] ?? File;
                const isChecked = selectedIds.has(r.id);
                return (
                  <div
                    key={r.id}
                    className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer ${!r.is_active ? 'opacity-60' : ''} ${selected?.id === r.id && showForm ? 'bg-blue-50 hover:bg-blue-50' : ''}`}
                    onClick={() => { if (bulkMode) { setSelectedIds(prev => { const s = new Set(prev); s.has(r.id) ? s.delete(r.id) : s.add(r.id); return s; }); } else { openEdit(r); } }}
                  >
                    {/* Checkbox / favorite */}
                    {bulkMode ? (
                      <input type="checkbox" checked={isChecked} readOnly className="mt-1 shrink-0" />
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); void handleToggleFavorite(r); }}
                        className={`mt-0.5 shrink-0 text-xl leading-none ${r.is_favorite ? 'text-yellow-400' : 'text-gray-200 hover:text-yellow-300'}`}
                      >★</button>
                    )}

                    {/* Thumbnail / icon */}
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center">
                      {r.media_id && (r.content_type === 'IMAGE' || r.content_type === 'GIF') ? (
                        <img
                          src={`/api/media/${r.media_id}/thumbnail`}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <Icon className="w-5 h-5 text-gray-400" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${TYPE_BADGE[r.content_type] ?? 'bg-gray-100 text-gray-600'}`}>
                          {r.content_type}
                        </span>
                        {r.category_name && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                            {r.category_name}
                          </span>
                        )}
                        <span className="font-medium text-sm truncate">{r.title}</span>
                        {!r.is_active && <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Disabled</span>}
                      </div>
                      <p className="text-xs text-gray-400 truncate">
                        {r.body || r.caption || (r.media ? r.media.displayName : '—')}
                      </p>
                    </div>

                    {/* Actions */}
                    {!bulkMode && (
                      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => void handleToggleActive(r)}
                          title={r.is_active ? 'Disable' : 'Enable'}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                        >
                          {r.is_active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => openDuplicate(r)}
                          title="Duplicate"
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => void handleDelete(r.id)}
                          title="Delete"
                          className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer: item count */}
        <div className="px-4 py-2 border-t bg-gray-50 text-xs text-gray-400 shrink-0">
          {filtered.length} of {replies.length} replies
        </div>
      </div>

      {/* ── Right panel: form ─────────────────────────────────────────────── */}
      {showForm && (
        <div className="w-80 border-l bg-white flex flex-col shrink-0 overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
            <h2 className="font-semibold text-sm">
              {editingId !== null ? 'Edit Quick Reply' : 'New Quick Reply'}
            </h2>
            <button onClick={closeForm} className="text-gray-400 hover:text-gray-700">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Title */}
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Title <span className="text-red-500">*</span></Label>
              <Input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Welcome message"
                className="text-sm"
              />
            </div>

            {/* Content type chips */}
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Type</Label>
              <div className="flex flex-wrap gap-1">
                {CONTENT_TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => {
                      setForm(f => ({
                        ...f,
                        contentType: t.value,
                        // Clear media if switching to TEXT
                        ...(t.value === 'TEXT' ? { mediaId: null, mediaRecord: null } : {}),
                      }));
                    }}
                    className={`flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium border transition-colors ${
                      form.contentType === t.value
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                    }`}
                  >
                    <t.icon className="w-3 h-3" />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Media section (non-TEXT) */}
            {form.contentType !== 'TEXT' && (
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Media <span className="text-red-500">*</span></Label>
                {form.mediaRecord ? (
                  <div className="rounded-lg border p-3 space-y-2">
                    {/* Preview */}
                    {(form.contentType === 'IMAGE' || form.contentType === 'GIF') && (
                      <img
                        src={`/api/media/${form.mediaRecord.id}/thumbnail`}
                        alt=""
                        className="w-full rounded object-cover max-h-32"
                      />
                    )}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{form.mediaRecord.displayName}</p>
                        <p className="text-[10px] text-gray-400">{formatBytes(form.mediaRecord.fileSize)}</p>
                      </div>
                      <button onClick={clearMedia} className="text-gray-400 hover:text-red-500 shrink-0">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <button
                      onClick={() => setShowPicker(true)}
                      className="text-xs text-blue-600 hover:text-blue-800 underline"
                    >Change</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowPicker(true)}
                    className="w-full rounded-lg border-2 border-dashed border-gray-300 py-4 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
                  >
                    Choose from Library
                  </button>
                )}
              </div>
            )}

            {/* Body (TEXT only) */}
            {form.contentType === 'TEXT' && (
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Message <span className="text-red-500">*</span></Label>
                <textarea
                  value={form.body}
                  onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                  rows={4}
                  placeholder="Message text…"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 resize-none"
                />
              </div>
            )}

            {/* Caption (all types) */}
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Caption <span className="text-gray-400">(optional)</span></Label>
              <Input
                value={form.caption}
                onChange={e => setForm(f => ({ ...f, caption: e.target.value }))}
                placeholder="Caption shown under media…"
                className="text-sm"
              />
            </div>

            {/* Category */}
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Category</Label>
              <select
                value={form.categoryId ?? ''}
                onChange={e => setForm(f => ({ ...f, categoryId: e.target.value ? parseInt(e.target.value, 10) : null }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              >
                <option value="">None</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Sort Order */}
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Sort Order</Label>
              <Input
                type="number"
                value={form.sortOrder}
                onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value, 10) || 0 }))}
                className="text-sm w-24"
              />
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between">
              <Label className="text-xs text-gray-500">Active</Label>
              <button
                onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                className={`relative w-10 h-5 rounded-full transition-colors ${form.isActive ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            {formError && <p className="text-xs text-red-500">{formError}</p>}
          </div>

          {/* Form footer */}
          <div className="flex gap-2 px-4 py-3 border-t shrink-0">
            <Button variant="outline" size="sm" onClick={closeForm} className="flex-1">Cancel</Button>
            <Button size="sm" onClick={() => void handleSubmit()} disabled={formBusy} className="flex-1">
              {formBusy ? 'Saving…' : editingId !== null ? 'Save' : 'Create'}
            </Button>
          </div>
        </div>
      )}

      {/* MediaPicker modal */}
      {showPicker && (
        <MediaPicker
          onSelect={handleMediaSelected}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd erp && npm run lint 2>&1 | tail -5
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add erp/src/app/\(dashboard\)/livechat/quick-replies/page.tsx
git commit -m "feat(quick-reply): add Quick Reply Manager page (/livechat/quick-replies)"
```

---

### Task 7: Sidebar update + settings page redirect

**Files:**
- Modify: `erp/src/components/sidebar.tsx`
- Modify: `erp/src/app/(dashboard)/livechat/settings/page.tsx`

**Interfaces:**
- Consumes: `MessageSquare` icon already imported; `useRouter` from next/navigation (in settings page)
- Produces: "Quick Replies" nav entry; settings page redirects to `/livechat/quick-replies`

- [ ] **Step 1: Read sidebar.tsx**

Read `erp/src/components/sidebar.tsx`.

- [ ] **Step 2: Add Quick Replies to sidebar**

In `erp/src/components/sidebar.tsx`, add `Zap` to the lucide-react import. Then in the first `NAV_GROUPS` items array (the one containing `{ href: '/livechat', label: 'Live Chat', icon: MessageSquare }`), insert Quick Replies after Live Chat:

```typescript
// Add Zap to import:
import { ..., Zap } from 'lucide-react';

// In NAV_GROUPS, first group items, after the Live Chat entry:
{ href: '/livechat/quick-replies', label: 'Quick Replies', icon: Zap },
```

- [ ] **Step 3: Replace settings page with redirect**

Read `erp/src/app/(dashboard)/livechat/settings/page.tsx`.

Replace the entire file with a redirect component:

```typescript
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LiveChatSettingsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/livechat/quick-replies'); }, [router]);
  return (
    <div className="flex h-40 items-center justify-center text-gray-400 text-sm">
      Redirecting to Quick Replies…
    </div>
  );
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd erp && npm run lint 2>&1 | tail -5
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add erp/src/components/sidebar.tsx \
        erp/src/app/\(dashboard\)/livechat/settings/page.tsx
git commit -m "feat(quick-reply): add Quick Replies sidebar entry, redirect settings page"
```

---

### Task 8: Build verification + regression

**Files:**
- No new files. Verification only.

- [ ] **Step 1: Run full test suite**

```bash
cd erp && npm test 2>&1 | tail -10
```

Expected: All tests PASS. Count ≥ 79 (existing) + new repo + route tests. Note exact count.

- [ ] **Step 2: TypeScript check**

```bash
cd erp && npm run lint 2>&1 | tail -5
```

Expected: Zero errors.

- [ ] **Step 3: Production build**

```bash
cd erp && npm run build 2>&1 | tail -15
```

Expected: `✓ Compiled successfully`. New routes in output:
- `ƒ /livechat/quick-replies`
- `ƒ /api/livechat/quick-replies/[id]`

- [ ] **Step 4: Architecture guard — no forbidden patterns in new files**

```bash
# No pool.query in new routes
grep -rn "pool\.query" \
  erp/src/app/api/livechat/quick-replies/route.ts \
  erp/src/app/api/livechat/quick-replies/\[id\]/route.ts
```
Expected: zero matches.

```bash
# No mediaService import in UI
grep -rn "mediaService" \
  erp/src/app/\(dashboard\)/livechat/quick-replies/ \
  erp/src/app/\(dashboard\)/media-library/MediaPicker.tsx
```
Expected: zero matches.

```bash
# No base64 in quick reply files
grep -rn "base64\|data:image\|data:video" \
  erp/src/app/\(dashboard\)/livechat/quick-replies/ \
  erp/src/app/api/livechat/quick-replies/
```
Expected: zero matches.

- [ ] **Step 5: Python regression**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot && python -m pytest tests/ -x --tb=short 2>&1 | tail -10
```

Expected: same 11 pre-existing failures from Phase 4.3, no new failures.

- [ ] **Step 6: Verification commit**

```bash
git commit --allow-empty -m "chore(quick-reply): Phase 5.4C build verification — all tests pass, build clean"
```

- [ ] **Step 7: Write report**

Write the full verification report to `.superpowers/sdd/task-8-5.4c-report.md`. Include:
- Test count (N/N passing)
- TypeScript result
- Next.js build result (compiled / new routes)
- Architecture guard results (all ZERO)
- Python regression result
- All git commits for Phase 5.4C (from base commit to HEAD)
- Recommendation: READY FOR 5.4D or BLOCKED (with reason)

---

## Self-Review

**1. Spec coverage:**
- ✅ All 11 content types: TEXT, IMAGE, GIF, VIDEO, AUDIO, VOICE, DOCUMENT, PDF, APK, ZIP, RAR
- ✅ Caption on all types
- ✅ Choose from Media Library (MediaPicker)
- ✅ Upload new media (UploadZone inside MediaPicker)
- ✅ Ctrl+V — handled by UploadZone's existing paste listener (present when MediaPicker is on Upload tab)
- ✅ Drag+drop — handled by UploadZone
- ✅ Media preview (in form: thumbnail + filename + size)
- ✅ Categories (filter by category; create categories still via existing API — no categories CRUD page in 5.4C scope)
- ✅ Favorites (star toggle)
- ✅ Recent — sort by "Newest First" provides this
- ✅ Search
- ✅ Sort (3 options)
- ✅ Enable/disable
- ✅ Copy Quick Reply (Duplicate button → opens form pre-filled)
- ✅ Bulk management (select + delete/enable/disable)
- ✅ All media comes from Media Library (no base64 storage)
- ✅ reference_count managed in repository layer

**Known Phase 5.4C limitation:**
- Media quick replies created in 5.4C won't send media via relay until Phase 5.4D updates `messages/route.ts` to call `MediaService.getForRelay(media_id)`. The relay send path still uses `media_content` (which is NULL for new entries). Phase 5.4D fixes this.
- `media_content` column is NOT dropped in 5.4C.

**2. Placeholder scan:** None found.

**3. Type consistency:**
- `QuickReplyContentType` defined in Task 3 (types.ts), used in Tasks 3, 4, 6 ✅
- `createQuickReply` data shape defined in Task 3, consumed in Task 4 route ✅
- `updateQuickReply` data shape defined in Task 3, consumed in Task 4 [id] route ✅
- `MediaPicker.onSelect` receives `MediaRecord`, sets `form.mediaRecord` in Task 6 ✅
- `formatBytes` imported from `@/lib/utils/format-bytes` (created in Phase 5.4B) in Task 6 ✅
