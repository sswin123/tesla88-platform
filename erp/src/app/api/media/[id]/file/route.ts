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
  return new NextResponse(result.buffer as unknown as BodyInit, {
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
