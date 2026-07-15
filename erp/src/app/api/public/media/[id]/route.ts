import { NextRequest, NextResponse } from 'next/server';
import { mediaService } from '@/lib/media';
import { findMediaById } from '@/lib/repositories/media_repo';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const mediaId = parseInt(id, 10);
  if (isNaN(mediaId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const result = await mediaService.getBuffer(mediaId);
  if (!result) {
    // Distinguish record-not-found vs file-missing for better diagnostics
    const record = await findMediaById(mediaId).catch(() => null);
    if (record) {
      console.warn(`[public/media] file missing on disk for media id=${mediaId} key=${record.storageKey}`);
      return NextResponse.json(
        { error: 'FILE_MISSING', file_id: String(mediaId), filename: record.originalFilename },
        { status: 404 }
      );
    }
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return new NextResponse(result.buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type':   result.mimeType,
      'Content-Length': String(result.buffer.length),
      'Cache-Control':  'public, max-age=3600',
    },
  });
}
