import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { updateRiskFlag } from '@/lib/repositories/risk_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('risk.view');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const flagId = parseInt(id, 10);

  const body = await request.json() as { status: string; note?: string };

  if (!body.status) {
    return NextResponse.json({ error: 'status is required' }, { status: 400 });
  }

  const updated = await updateRiskFlag(flagId, {
    status: body.status,
    reviewed_by: payload.username,
    note: body.note,
  });

  if (!updated) {
    return NextResponse.json({ error: 'Flag not found' }, { status: 404 });
  }

  logAudit({
    admin_id: payload.sub,
    action: 'RISK_FLAG_UPDATED',
    target_type: 'risk_flag',
    target_id: flagId,
    new_value: { status: body.status },
  }).catch(() => {});
  return NextResponse.json(updated);
}
