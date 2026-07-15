import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { createHash, randomUUID } from 'crypto';
import { getMember } from '@/lib/member-auth';
import pool from '@/lib/db';

export const runtime = 'nodejs';

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');
const RECEIPT_SUBDIR = 'receipts';
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME: Record<string, { ext: string; mediaType: string }> = {
  'image/jpeg': { ext: 'jpg',  mediaType: 'IMAGE' },
  'image/png':  { ext: 'png',  mediaType: 'IMAGE' },
  'image/webp': { ext: 'webp', mediaType: 'IMAGE' },
  'image/gif':  { ext: 'gif',  mediaType: 'GIF'   },
};

export async function POST(req: NextRequest) {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });

  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: '文件过大（最大10MB）' }, { status: 413 });

  const allowed = ALLOWED_MIME[file.type];
  if (!allowed) return NextResponse.json({ error: '只支持 JPG、PNG、WEBP、GIF 格式' }, { status: 415 });

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const fileHash = createHash('sha256').update(buffer).digest('hex');

  // Deduplication: if same file already uploaded, reuse the media_id
  const existing = await pool.query<{ id: number }>(
    `SELECT id FROM media_library WHERE file_hash = $1`,
    [fileHash]
  );
  if (existing.rows[0]) {
    return NextResponse.json({ ok: true, media_id: existing.rows[0].id }, { status: 200 });
  }

  const uuid = randomUUID();
  const fileName = `${uuid}.${allowed.ext}`;
  const storageKey = `${RECEIPT_SUBDIR}/${fileName}`;
  const dir = join(UPLOAD_DIR, RECEIPT_SUBDIR);

  try {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, fileName), buffer);
  } catch {
    return NextResponse.json({ error: '上传失败，请重试' }, { status: 500 });
  }

  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO media_library
       (file_hash, storage_key, storage_provider, media_type, mime_type, extension,
        original_filename, display_name, file_size, created_by)
     VALUES ($1, $2, 'LOCAL', $3, $4, $5, $6, $7, $8, NULL)
     RETURNING id`,
    [
      fileHash,
      storageKey,
      allowed.mediaType,
      file.type,
      allowed.ext,
      file.name,
      file.name,
      file.size,
    ]
  );

  return NextResponse.json({ ok: true, media_id: rows[0].id }, { status: 201 });
}
