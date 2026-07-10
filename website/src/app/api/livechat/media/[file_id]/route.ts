import { NextRequest, NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';

export const runtime = 'nodejs';

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');

const EXT_MIME: Record<string, string> = {
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.mov':  'video/quicktime',
  '.pdf':  'application/pdf',
  '.txt':  'text/plain',
  '.csv':  'text/csv',
  '.doc':  'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls':  'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.zip':  'application/zip',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ file_id: string }> }
) {
  const { file_id } = await params;

  // Decode explicitly: Next.js may leave %3A un-decoded in route params
  const decodedId = decodeURIComponent(file_id);

  console.log('[media] request', { file_id, decodedId, UPLOAD_DIR });

  if (!decodedId.startsWith('local:')) {
    console.log('[media] rejected - not a local file_id');
    return new NextResponse('Not a local file', { status: 400 });
  }

  // Sanitize: strip path separators to prevent directory traversal
  const rawName = decodedId.slice('local:'.length);
  const safeName = rawName.replace(/[/\\]/g, '');
  const filePath = join(UPLOAD_DIR, safeName);
  const exists = existsSync(filePath);

  console.log('[media] file', { rawName, safeName, filePath, exists });

  if (!exists) {
    return new NextResponse('Not found', { status: 404 });
  }

  const ext = extname(safeName).toLowerCase();
  const mime = EXT_MIME[ext] ?? 'application/octet-stream';
  const isInline = ext === '.pdf' || mime.startsWith('image/') || mime.startsWith('video/');

  try {
    const data = await readFile(filePath);
    return new NextResponse(data, {
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=3600, immutable',
        'Content-Disposition': isInline ? 'inline' : `attachment; filename="${safeName}"`,
      },
    });
  } catch (err) {
    console.error('[media] read error', err);
    return new NextResponse('Read failed', { status: 500 });
  }
}
