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

// ---------------------------------------------------------------------------
// Insert / core CRUD
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Soft / hard delete
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Reference counting (used by MediaService when modules attach / detach media)
// ---------------------------------------------------------------------------

export async function incrementReferenceCount(id: number): Promise<void> {
  await pool.query(
    `UPDATE media_library
     SET reference_count = reference_count + 1
     WHERE id = $1`,
    [id]
  );
}

export async function decrementReferenceCount(id: number): Promise<void> {
  await pool.query(
    `UPDATE media_library
     SET reference_count = GREATEST(reference_count - 1, 0)
     WHERE id = $1`,
    [id]
  );
}

// ---------------------------------------------------------------------------
// Lookup by storage key (used by MediaService for deduplication checks)
// ---------------------------------------------------------------------------

export async function findMediaByStorageKey(key: string): Promise<MediaRecord | null> {
  const r = await pool.query(
    `SELECT * FROM media_library WHERE storage_key = $1 AND deleted_at IS NULL`,
    [key]
  );
  return r.rows[0] ? rowToRecord(r.rows[0]) : null;
}

// ---------------------------------------------------------------------------
// Paginated list (used by GET /api/media)
// ---------------------------------------------------------------------------

interface ListMediaOptions {
  limit: number;
  offset: number;
  mediaType?: string;
  isActive?: boolean;
}

export async function listMedia(
  opts: ListMediaOptions
): Promise<{ records: MediaRecord[]; total: number }> {
  const conditions: string[] = ['deleted_at IS NULL'];
  const vals: unknown[] = [];
  let i = 1;

  if (opts.mediaType !== undefined) {
    conditions.push(`media_type = $${i++}`);
    vals.push(opts.mediaType);
  }
  if (opts.isActive !== undefined) {
    conditions.push(`is_active = $${i++}`);
    vals.push(opts.isActive);
  }

  const where = conditions.join(' AND ');

  const countVals = [...vals];
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM media_library WHERE ${where}`,
    countVals
  );
  const total: number = countResult.rows[0].total;

  vals.push(opts.limit);
  vals.push(opts.offset);
  const dataResult = await pool.query(
    `SELECT * FROM media_library
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT $${i++} OFFSET $${i++}`,
    vals
  );

  return {
    records: dataResult.rows.map(rowToRecord),
    total,
  };
}

// ---------------------------------------------------------------------------
// Full-text search against display_name and original_filename
// ---------------------------------------------------------------------------

export async function searchMedia(
  query: string,
  opts: { limit: number; offset: number }
): Promise<{ records: MediaRecord[]; total: number }> {
  const pattern = `%${query}%`;

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM media_library
     WHERE deleted_at IS NULL
       AND (display_name ILIKE $1 OR original_filename ILIKE $1)`,
    [pattern]
  );
  const total: number = countResult.rows[0].total;

  const dataResult = await pool.query(
    `SELECT *
     FROM media_library
     WHERE deleted_at IS NULL
       AND (display_name ILIKE $1 OR original_filename ILIKE $1)
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [pattern, opts.limit, opts.offset]
  );

  return {
    records: dataResult.rows.map(rowToRecord),
    total,
  };
}

// ---------------------------------------------------------------------------
// Dashboard statistics
// ---------------------------------------------------------------------------

interface MediaStats {
  total: number;
  totalSize: number;
  byType: Record<string, number>;
}

export async function getMediaStats(): Promise<MediaStats> {
  const summaryResult = await pool.query(
    `SELECT COUNT(*)::int AS total, COALESCE(SUM(file_size), 0)::bigint AS total_size
     FROM media_library
     WHERE deleted_at IS NULL`
  );
  const { total, total_size } = summaryResult.rows[0];

  const byTypeResult = await pool.query(
    `SELECT media_type, COUNT(*)::int AS cnt
     FROM media_library
     WHERE deleted_at IS NULL
     GROUP BY media_type`
  );
  const byType: Record<string, number> = {};
  for (const row of byTypeResult.rows) {
    byType[row.media_type as string] = row.cnt as number;
  }

  return {
    total: total as number,
    totalSize: Number(total_size),
    byType,
  };
}
