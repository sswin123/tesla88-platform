import { NextRequest, NextResponse } from 'next/server';
import { mediaService } from '@/lib/media';
import { findMediaById } from '@/lib/repositories/media_repo';
import { logAudit } from '@/lib/repositories/audit_repo';
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

  const media = await findMediaById(mediaId);
  if (!media || media.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ media });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('media.view');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const mediaId = parseInt(id, 10);
  if (isNaN(mediaId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const updates: { displayName?: string; isActive?: boolean } = {};
  if (typeof body.display_name === 'string') updates.displayName = body.display_name;
  if (typeof body.is_active === 'boolean') updates.isActive = body.is_active;

  const media = await mediaService.update(mediaId, updates);
  if (!media) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  logAudit({
    admin_id:    payload.sub,
    action:      'MEDIA_UPDATED',
    target_type: 'media',
    target_id:   mediaId,
    new_value:   updates as Record<string, unknown>,
  }).catch(() => {});

  return NextResponse.json({ ok: true, media });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('media.view');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const mediaId = parseInt(id, 10);
  if (isNaN(mediaId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  // Check reference_count before attempting delete
  const media = await findMediaById(mediaId);
  if (!media) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (media.referenceCount > 0) {
    return NextResponse.json(
      { ok: false, error: 'REFERENCED', referenceCount: media.referenceCount },
      { status: 409 }
    );
  }

  const ok = await mediaService.softDelete(mediaId, payload.sub);
  if (!ok) return NextResponse.json({ error: 'Delete failed' }, { status: 500 });

  logAudit({
    admin_id:    payload.sub,
    action:      'MEDIA_SOFT_DELETE',
    target_type: 'media',
    target_id:   mediaId,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
