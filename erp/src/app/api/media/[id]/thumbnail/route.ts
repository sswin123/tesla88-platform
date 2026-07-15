import { NextRequest, NextResponse } from 'next/server';
import { mediaService } from '@/lib/media';
import { findMediaById } from '@/lib/repositories/media_repo';
import { requirePermission } from '@/lib/require_permission';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('media.view');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const mediaId = parseInt(id, 10);
  if (isNaN(mediaId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  // Phase 5.4A: thumbnail_status always NONE — getPreview returns original file
  const result = await mediaService.getPreview(mediaId);
  if (!result) {
    const record = await findMediaById(mediaId).catch(() => null);
    if (record) {
      console.warn(`[media/thumbnail] file missing on disk for id=${mediaId} key=${record.storageKey}`);
    }
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return new NextResponse(result.buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type':  result.mimeType,
      'Content-Length': String(result.buffer.length),
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
