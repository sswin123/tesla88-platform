import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { mediaService } from '@/lib/media';
import { logAudit } from '@/lib/repositories/audit_repo';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (payload.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const mediaId = parseInt(id, 10);
  if (isNaN(mediaId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  // permanentDelete requires: deleted_at IS NOT NULL AND reference_count == 0
  const ok = await mediaService.permanentDelete(mediaId, payload.sub);
  if (!ok) {
    return NextResponse.json(
      { error: 'Cannot permanently delete: must be soft-deleted first and have no references' },
      { status: 409 }
    );
  }

  logAudit({
    admin_id:    payload.sub,
    action:      'MEDIA_PERMANENT_DELETE',
    target_type: 'media',
    target_id:   mediaId,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
