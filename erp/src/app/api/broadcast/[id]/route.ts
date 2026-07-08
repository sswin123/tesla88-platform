import { NextRequest, NextResponse } from 'next/server';
import { getBroadcastById, updateBroadcast, deleteBroadcast } from '@/lib/repositories/broadcast_repo';
import { logAudit } from '@/lib/repositories/audit_repo';
import { requirePermission } from '@/lib/require_permission';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('broadcast.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const broadcast = await getBroadcastById(parseInt(id, 10));
  if (!broadcast) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(broadcast);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('broadcast.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const broadcast = await updateBroadcast(parseInt(id, 10), body);
  if (!broadcast) return NextResponse.json({ error: 'Not found or nothing to update' }, { status: 404 });
  return NextResponse.json({ ok: true, broadcast });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('broadcast.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const numId = parseInt(id, 10);
  const ok = await deleteBroadcast(numId);
  if (!ok) return NextResponse.json({ error: 'Not found or not a draft' }, { status: 404 });
  Promise.resolve(logAudit({
    admin_id: payload.sub, action: 'BROADCAST_DELETED',
    target_type: 'broadcast', target_id: numId,
  })).catch(() => {});
  return NextResponse.json({ ok: true });
}
