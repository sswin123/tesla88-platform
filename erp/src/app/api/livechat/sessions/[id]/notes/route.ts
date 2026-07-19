import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getSessionNotes, createSessionNote } from '@/lib/repositories/support_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authPayload = await requirePermission('livechat.view');
  if (!authPayload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const notes = await getSessionNotes(parseInt(id, 10));
  return NextResponse.json({ notes });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('livechat.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const text: string = (body.body ?? '').trim();
  if (!text) return NextResponse.json({ error: 'body required' }, { status: 400 });

  const note = await createSessionNote({
    session_id: parseInt(id, 10),
    author: payload.username,
    body: text,
  });
  logAudit({
    admin_id: payload.sub,
    action: 'LIVECHAT_NOTE_CREATED',
    target_type: 'support_session',
    target_id: Number(id),
  }).catch(() => {});
  return NextResponse.json({ note }, { status: 201 });
}
