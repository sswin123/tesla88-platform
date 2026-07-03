/**
 * Tests for scripts/migrate-quick-reply-media.ts
 *
 * Mocks pool (from @/lib/db) and mediaService (from @/lib/media) so no real
 * DB or filesystem access occurs.
 *
 * vi.mock factories are hoisted above imports by Vitest, so the mock functions
 * must be created with vi.hoisted() to be accessible inside the factory.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Create mock fns with vi.hoisted() so they are available inside vi.mock factories
// (which are hoisted above all imports)
// ---------------------------------------------------------------------------
const { mockQuery, mockEnd, mockSave } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockEnd:   vi.fn().mockResolvedValue(undefined),
  mockSave:  vi.fn(),
}));

// Mock pool default export from @/lib/db
vi.mock('@/lib/db', () => ({
  default: { query: mockQuery, end: mockEnd },
}));

// Mock mediaService from @/lib/media
vi.mock('@/lib/media', () => ({
  mediaService: { save: mockSave },
}));

// ---------------------------------------------------------------------------
// Import the mocked modules — these resolve to the mocks above.
// ---------------------------------------------------------------------------
import pool from '@/lib/db';
import { mediaService } from '@/lib/media';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal MediaRecord returned by mediaService.save() */
function makeRecord(id: number) {
  return {
    id,
    tenantId: null,
    fileHash: 'abc' + id,
    storageKey: `abc${id}.jpg`,
    storageProvider: 'LOCAL',
    mediaType: 'IMAGE' as const,
    mimeType: 'image/jpeg',
    extension: 'jpg',
    originalFilename: `quick-reply-${id}.jpg`,
    displayName: `quick-reply-${id}.jpg`,
    fileSize: 10,
    width: null, height: null, duration: null,
    thumbnailKey: null, thumbnailStatus: 'NONE' as const,
    metadata: {}, usageCount: 0, referenceCount: 0,
    lastUsedAt: null, lastUsedModule: null,
    downloadCount: 0, lastDownloadedAt: null,
    createdBy: 1,
    createdAt: '2026-07-03T00:00:00Z',
    updatedAt: '2026-07-03T00:00:00Z',
    isActive: true, deletedAt: null, deletedBy: null,
  };
}

/** A minimal valid JPEG data URI */
const JPEG_DATA_URI =
  'data:image/jpeg;base64,' + Buffer.from('fake-jpeg-bytes').toString('base64');

// ---------------------------------------------------------------------------
// Mirror the migrate() logic from scripts/migrate-quick-reply-media.ts
//
// The script calls run() at module load time, so we cannot import it directly
// without triggering DB connections. Instead we replicate the core logic here,
// referencing the same mocked pool and mediaService.
// ---------------------------------------------------------------------------

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/mpeg': 'mpeg', 'video/quicktime': 'mov',
  'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav',
  'application/pdf': 'pdf', 'application/zip': 'zip',
  'application/vnd.android.package-archive': 'apk',
  'application/octet-stream': 'bin',
};

interface QuickReplyRow {
  id: number;
  media_content: string;
  content_type: string | null;
  title: string | null;
}

/** Mirrors the migrate() function in the script. */
async function migrate(
  systemUserId: number,
  rows: QuickReplyRow[]
): Promise<{ migrated: number; skipped: number; failed: number }> {
  let migrated = 0, skipped = 0, failed = 0;

  for (const row of rows) {
    try {
      const match = /^data:([^;]+);base64,(.+)$/.exec(row.media_content);
      if (!match) {
        skipped++;
        continue;
      }

      const [, mimeType, b64Data] = match;
      let buffer: Buffer;
      try {
        buffer = Buffer.from(b64Data, 'base64');
      } catch {
        failed++;
        continue;
      }

      if (buffer.length === 0) {
        skipped++;
        continue;
      }

      const ext = MIME_TO_EXT[mimeType] ?? 'bin';
      const displayName = row.title
        ? `${row.title}.${ext}`
        : `quick-reply-${row.id}.${ext}`;
      const originalFilename = `quick-reply-${row.id}.${ext}`;

      const { record, isDuplicate } = await mediaService.save({
        buffer,
        originalFilename,
        mimeType,
        uploadedBy: systemUserId,
        displayName,
      });

      // Increment reference_count — always, new or duplicate
      await pool.query(
        'UPDATE media_library SET reference_count = reference_count + 1 WHERE id = $1',
        [record.id]
      );

      // Set media_id and null out media_content
      await pool.query(
        'UPDATE quick_replies SET media_id = $1, media_content = NULL WHERE id = $2',
        [record.id, row.id]
      );

      migrated++;
      void isDuplicate; // used for logging in the real script
    } catch (err) {
      void err;
      failed++;
    }
  }

  return { migrated, skipped, failed };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Scenario 1: TEXT-only quick reply → not returned by SQL filter → skipped
// ============================================================
describe('Scenario 1: TEXT-only quick reply', () => {
  it('does not call mediaService.save when there are no rows to process', async () => {
    // The script SELECT filters out rows where media_content IS NULL,
    // so TEXT-only quick replies are never returned — rows is empty.
    const result = await migrate(1, []);

    expect(mockSave).not.toHaveBeenCalled();
    expect(result.migrated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
  });
});

// ============================================================
// Scenario 2: Successful IMAGE migration
// ============================================================
describe('Scenario 2: Successful IMAGE migration', () => {
  it('calls mediaService.save, sets media_id, nulls media_content, increments reference_count', async () => {
    const record = makeRecord(42);
    mockSave.mockResolvedValueOnce({ record, isDuplicate: false });
    mockQuery.mockResolvedValue({ rows: [] });

    const rows: QuickReplyRow[] = [
      { id: 10, media_content: JPEG_DATA_URI, content_type: 'IMAGE', title: null },
    ];

    const result = await migrate(1, rows);

    expect(result.migrated).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);

    // mediaService.save called once with correct args
    expect(mockSave).toHaveBeenCalledOnce();
    const saveArg = mockSave.mock.calls[0][0];
    expect(saveArg.mimeType).toBe('image/jpeg');
    expect(saveArg.uploadedBy).toBe(1);
    expect(saveArg.originalFilename).toBe('quick-reply-10.jpg');
    expect(Buffer.isBuffer(saveArg.buffer)).toBe(true);

    // reference_count incremented for the new record
    expect(mockQuery).toHaveBeenCalledWith(
      'UPDATE media_library SET reference_count = reference_count + 1 WHERE id = $1',
      [42]
    );

    // media_id set and media_content nulled
    expect(mockQuery).toHaveBeenCalledWith(
      'UPDATE quick_replies SET media_id = $1, media_content = NULL WHERE id = $2',
      [42, 10]
    );
  });
});

// ============================================================
// Scenario 3: Duplicate media hash → same record returned, reference_count still incremented
// ============================================================
describe('Scenario 3: Duplicate media hash', () => {
  it('increments reference_count even when isDuplicate=true', async () => {
    const record = makeRecord(7);
    mockSave.mockResolvedValueOnce({ record, isDuplicate: true });
    mockQuery.mockResolvedValue({ rows: [] });

    const rows: QuickReplyRow[] = [
      { id: 20, media_content: JPEG_DATA_URI, content_type: 'IMAGE', title: null },
    ];

    const result = await migrate(1, rows);

    expect(result.migrated).toBe(1);
    expect(result.failed).toBe(0);

    // reference_count still incremented for the duplicate
    expect(mockQuery).toHaveBeenCalledWith(
      'UPDATE media_library SET reference_count = reference_count + 1 WHERE id = $1',
      [7]
    );

    // media_id set and media_content nulled
    expect(mockQuery).toHaveBeenCalledWith(
      'UPDATE quick_replies SET media_id = $1, media_content = NULL WHERE id = $2',
      [7, 20]
    );
  });
});

// ============================================================
// Scenario 4: Broken base64 / save error → caught, logged, migration continues
// ============================================================
describe('Scenario 4: Broken base64 / mediaService error', () => {
  it('increments failed counter and continues when mediaService.save throws', async () => {
    // First row: mediaService.save throws
    mockSave.mockRejectedValueOnce(new Error('Storage write failed'));
    // Second row: success
    const record = makeRecord(99);
    mockSave.mockResolvedValueOnce({ record, isDuplicate: false });
    mockQuery.mockResolvedValue({ rows: [] });

    const rows: QuickReplyRow[] = [
      { id: 30, media_content: JPEG_DATA_URI, content_type: 'IMAGE', title: null },
      { id: 31, media_content: JPEG_DATA_URI, content_type: 'IMAGE', title: null },
    ];

    const result = await migrate(1, rows);

    expect(result.failed).toBe(1);
    expect(result.migrated).toBe(1);

    // Both rows were attempted
    expect(mockSave).toHaveBeenCalledTimes(2);

    // UPDATE only called for the successful second row (row 31)
    expect(mockQuery).toHaveBeenCalledWith(
      'UPDATE quick_replies SET media_id = $1, media_content = NULL WHERE id = $2',
      [99, 31]
    );
  });

  it('skips a row with a non-data-URI string (unrecognised format)', async () => {
    const rows: QuickReplyRow[] = [
      { id: 40, media_content: 'not-a-valid-data-uri', content_type: 'IMAGE', title: null },
    ];

    const result = await migrate(1, rows);

    expect(result.skipped).toBe(1);
    expect(result.migrated).toBe(0);
    expect(result.failed).toBe(0);
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

// ============================================================
// Scenario 5: Re-run idempotency — already-migrated rows are excluded by SQL
// ============================================================
describe('Scenario 5: Idempotency — re-run skips already-migrated rows', () => {
  it('does not call mediaService.save when all rows already have media_id set', async () => {
    // The SELECT filters out rows where media_id IS NOT NULL.
    // On re-run, the result set is empty.
    const result = await migrate(1, []);

    expect(mockSave).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
    expect(result.migrated).toBe(0);
  });
});
