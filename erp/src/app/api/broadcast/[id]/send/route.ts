import { NextRequest, NextResponse } from 'next/server';
import { getBroadcastById, updateBroadcast } from '@/lib/repositories/broadcast_repo';
import { sendBroadcast } from '@/lib/broadcast/send';
import { logAudit } from '@/lib/repositories/audit_repo';
import { requirePermission } from '@/lib/require_permission';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('broadcast.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id, 10);

  const broadcast = await getBroadcastById(numId);
  if (!broadcast) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!['DRAFT', 'SCHEDULED'].includes(broadcast.status))
    return NextResponse.json({ error: `Cannot send broadcast with status: ${broadcast.status}` }, { status: 400 });

  const body = await req.json().catch(() => ({})) as { scheduled_at?: string };

  // Schedule for later
  if (body.scheduled_at) {
    const scheduledTime = new Date(body.scheduled_at);
    if (scheduledTime > new Date()) {
      const updated = await updateBroadcast(numId, { status: 'SCHEDULED', scheduled_at: body.scheduled_at });
      Promise.resolve(logAudit({
        admin_id: payload.sub, action: 'BROADCAST_SCHEDULED',
        target_type: 'broadcast', target_id: numId,
        new_value: { scheduled_at: body.scheduled_at },
      })).catch(() => {});
      return NextResponse.json({ ok: true, status: 'SCHEDULED', broadcast: updated });
    }
  }

  // Send now
  const result = await sendBroadcast(numId);
  Promise.resolve(logAudit({
    admin_id: payload.sub, action: 'BROADCAST_SENT',
    target_type: 'broadcast', target_id: numId,
    new_value: { sent: result.sent, failed: result.failed, total: result.total },
  })).catch(() => {});
  return NextResponse.json({ ok: true, ...result });
}
