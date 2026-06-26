import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { deleteSessionNote } from '@/lib/repositories/support_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, noteId } = await params;
  await deleteSessionNote(parseInt(noteId, 10));
  logAudit({
    admin_id: payload.sub,
    action: 'LIVECHAT_NOTE_DELETED',
    target_type: 'support_session',
    target_id: Number(id),
  }).catch(() => {});
  return NextResponse.json({ ok: true });
}
