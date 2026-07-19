import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { deleteSessionNote } from '@/lib/repositories/support_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const payload = await requirePermission('livechat.manage');
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
