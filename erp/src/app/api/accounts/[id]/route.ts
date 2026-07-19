import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { reassignAccount, updateAccountStatus } from '@/lib/repositories/account_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const accountId = parseInt(id, 10);
  if (isNaN(accountId)) {
    return NextResponse.json({ error: 'Invalid account id' }, { status: 400 });
  }

  let body: { assigned_user_id?: number | null; status?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if ('assigned_user_id' in body) {
    const newUserId = body.assigned_user_id ?? null;
    try {
      await reassignAccount(accountId, newUserId, payload.username ?? 'system');
    } catch (err) {
      console.error('[accounts PATCH]', err);
      return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }
    logAudit({
      admin_id: payload.sub,
      action: 'ACCOUNT_REASSIGNED',
      target_type: 'account_pool',
      target_id: accountId,
      new_value: { assigned_user_id: body.assigned_user_id },
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  if (body.status) {
    const allowed = ['AVAILABLE', 'ASSIGNED', 'DISABLED'];
    if (!allowed.includes(body.status)) {
      return NextResponse.json({ error: `status must be one of ${allowed.join(', ')}` }, { status: 400 });
    }
    try {
      await updateAccountStatus(accountId, body.status);
    } catch (err) {
      console.error('[accounts PATCH]', err);
      return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }
    logAudit({
      admin_id: payload.sub,
      action: 'ACCOUNT_STATUS_CHANGED',
      target_type: 'account_pool',
      target_id: accountId,
      new_value: { status: body.status },
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Provide assigned_user_id or status' }, { status: 400 });
}
