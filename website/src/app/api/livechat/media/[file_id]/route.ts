import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, existsSync } from 'fs';
import { join, extname } from 'path';
import { Readable } from 'stream';

export const runtime = 'nodejs';

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');

const EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ file_id: string }> }
) {
  const { file_id } = await params;

  // Decode explicitly: Next.js may leave %3A un-decoded in route params
  const decodedId = decodeURIComponent(file_id);

  if (!decodedId.startsWith('local:')) {
    return new NextResponse('Not a local file', { status: 400 });
  }

  // Sanitize: strip path separators to prevent directory traversal
  const rawName = decodedId.slice('local:'.length);
  const safeName = rawName.replace(/[/\\]/g, '');
  const filePath = join(UPLOAD_DIR, safeName);

  if (!existsSync(filePath)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const mime = EXT_MIME[extname(safeName).toLowerCase()] ?? 'application/octet-stream';
  const stream = createReadStream(filePath);

  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=3600, immutable',
      'Content-Disposition': 'inline',
    },
  });
}
