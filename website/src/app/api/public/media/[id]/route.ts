import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import fs from 'fs/promises';
import path from 'path';

const ERP_MEDIA_DIR = process.env.ERP_MEDIA_DIR ?? '/uploads/media';
// Internal Docker network URL for ERP (e.g. http://erp:3000)
const ERP_INTERNAL_URL = (process.env.ERP_INTERNAL_URL ?? '').replace(/\/$/, '');

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numId = parseInt(id);
  if (isNaN(numId)) return new NextResponse(null, { status: 400 });

  let storageKey: string | null = null;
  let mimeType: string = 'application/octet-stream';
  let originalFilename: string = '';

  try {
    const res = await pool.query<{
      mime_type: string | null;
      original_filename: string;
      storage_key: string | null;
    }>(
      'SELECT mime_type, original_filename, storage_key FROM media_library WHERE id = $1 AND deleted_at IS NULL',
      [numId]
    );
    if (res.rows.length === 0) return new NextResponse(null, { status: 404 });

    storageKey      = res.rows[0].storage_key;
    mimeType        = res.rows[0].mime_type ?? 'application/octet-stream';
    originalFilename = res.rows[0].original_filename;
  } catch (err) {
    console.error('[public/media] DB query failed:', err);
    // DB unavailable — fall through to ERP proxy
  }

  // 1. Try shared ERP filesystem volume mount
  if (storageKey) {
    try {
      const buf = await fs.readFile(path.join(ERP_MEDIA_DIR, storageKey));
      return new NextResponse(buf, {
        headers: {
          'Content-Type':        mimeType,
          'Content-Disposition': `inline; filename="${originalFilename}"`,
          'Cache-Control':       'public, max-age=3600',
        },
      });
    } catch {
      // Volume not shared or file missing — fall through to ERP proxy
    }
  }

  // 2. Proxy to ERP internal API (works when on same Docker network)
  if (ERP_INTERNAL_URL) {
    try {
      const erpRes = await fetch(`${ERP_INTERNAL_URL}/api/public/media/${numId}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (erpRes.ok) {
        const buf = Buffer.from(await erpRes.arrayBuffer());
        return new NextResponse(buf, {
          headers: {
            'Content-Type':  erpRes.headers.get('content-type') ?? mimeType,
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }
    } catch {
      // ERP unreachable
    }
  }

  return new NextResponse(null, { status: 404 });
}
