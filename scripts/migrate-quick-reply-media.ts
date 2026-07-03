/**
 * Phase 5.4C data migration: move base64 media_content from quick_replies → media_library
 * via the MediaService singleton.
 *
 * Run (from project root):
 *   npx ts-node --project erp/tsconfig.json -e "require('./scripts/migrate-quick-reply-media.ts')"
 *
 * Or via tsx:
 *   cd erp && DATABASE_URL="$DATABASE_URL" npx tsx scripts/migrate-quick-reply-media.ts
 *
 * Safe to re-run: rows with media_id already set are skipped.
 * media_content is set to NULL after migration. Phase 5.4D will drop the column.
 */

import pool from '@/lib/db';
import { mediaService } from '@/lib/media';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/mpeg': 'mpeg',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/vnd.android.package-archive': 'apk',
  'application/octet-stream': 'bin',
};

interface QuickReplyRow {
  id: number;
  media_content: string;
  content_type: string | null;
  title: string | null;
}

async function migrate(): Promise<void> {
  // Resolve system user ID for uploadedBy
  const { rows: adminRows } = await pool.query<{ id: number }>(
    'SELECT id FROM admins ORDER BY id LIMIT 1'
  );
  const systemUserId: number = adminRows[0]?.id ?? 1;
  console.log(`Using system user id=${systemUserId} for uploadedBy.`);

  // Fetch only rows that still need migration (idempotent)
  const { rows } = await pool.query<QuickReplyRow>(
    `SELECT id, media_content, content_type, title
     FROM quick_replies
     WHERE media_content IS NOT NULL AND media_id IS NULL`
  );

  console.log(`Found ${rows.length} row(s) to migrate.`);
  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      // Parse data URI: data:<mime>;base64,<data>
      const match = /^data:([^;]+);base64,(.+)$/.exec(row.media_content);
      if (!match) {
        console.warn(`Row ${row.id}: unrecognised media_content format (not a data URI) — skipping.`);
        skipped++;
        continue;
      }

      const [, mimeType, b64Data] = match;
      let buffer: Buffer;
      try {
        buffer = Buffer.from(b64Data, 'base64');
      } catch (decodeErr) {
        console.error(`Row ${row.id}: base64 decode failed —`, decodeErr);
        failed++;
        continue;
      }

      if (buffer.length === 0) {
        console.warn(`Row ${row.id}: decoded buffer is empty — skipping.`);
        skipped++;
        continue;
      }

      const ext = MIME_TO_EXT[mimeType] ?? 'bin';
      const displayName = row.title
        ? `${row.title}.${ext}`
        : `quick-reply-${row.id}.${ext}`;
      const originalFilename = `quick-reply-${row.id}.${ext}`;

      // Delegate to MediaService — handles dedup, file write, and DB insert
      const { record, isDuplicate } = await mediaService.save({
        buffer,
        originalFilename,
        mimeType,
        uploadedBy: systemUserId,
        displayName,
      });

      console.log(
        `Row ${row.id}: ${isDuplicate ? 'dedup' : 'created'} → media_id=${record.id}`
      );

      // Increment reference_count — always, whether new or duplicate
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
    } catch (err) {
      console.error(`Row ${row.id}: ERROR —`, err);
      failed++;
      // Continue to next row — do not abort the whole migration
    }
  }

  console.log(
    `\nMigration complete. migrated=${migrated} skipped=${skipped} failed=${failed}`
  );
}

async function validate(): Promise<void> {
  const {
    rows: [r],
  } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM quick_replies WHERE media_content IS NOT NULL AND media_id IS NULL`
  );
  console.log(`\nValidation — remaining un-migrated rows: ${r.count}`);
  if (parseInt(r.count, 10) > 0) {
    console.warn(
      'WARNING: Some rows still have media_content without media_id — check logs above.'
    );
  }
}

async function run(): Promise<void> {
  try {
    await migrate();
    await validate();
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
