import { NextRequest, NextResponse } from 'next/server';
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

  // v1.0: no cross-module reference table yet. Phase 5.4C adds quick_replies.media_id.
  return NextResponse.json({ references: [] });
}
