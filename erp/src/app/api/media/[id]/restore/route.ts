import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { mediaService } from '@/lib/media';
import { logAudit } from '@/lib/repositories/audit_repo';

export async function POST(
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

  const media = await mediaService.restore(mediaId);
  if (!media) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  logAudit({
    admin_id:    payload.sub,
    action:      'MEDIA_RESTORE',
    target_type: 'media',
    target_id:   mediaId,
  }).catch(() => {});

  return NextResponse.json({ ok: true, media });
}
