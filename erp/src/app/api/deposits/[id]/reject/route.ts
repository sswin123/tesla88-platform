import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { logAudit } from '@/lib/repositories/audit_repo';
import { getSetting } from '@/lib/repositories/settings_repo';
import { requirePermission } from '@/lib/require_permission';

const BOT_RELAY_URL = process.env.BOT_RELAY_URL ?? 'http://localhost:8090';
const BOT_RELAY_AUTH_TOKEN = process.env.BOT_RELAY_AUTH_TOKEN ?? 'change_me_relay_token';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('deposit.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const adminId = payload.sub;

  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { reason?: string };
  const reason: string = body.reason ?? '';

  const rejId = parseInt(id, 10);

  try {
    const { rows } = await pool.query(
      `UPDATE deposit_requests
       SET status = 'REJECTED', reviewed_by = $2, reject_reason = $3, reviewed_at = NOW(),
           rejected_by = $2::int, rejected_at = NOW()
       WHERE id = $1 AND status IN ('PENDING', 'PROCESSING')
       RETURNING id`,
      [rejId, adminId, reason || null]
    );
    if (!rows[0]) {
      return NextResponse.json(
        { error: 'Not found or already processed' },
        { status: 404 }
      );
    }

    await logAudit({
      admin_id: adminId,
      action: 'DEPOSIT_REJECT',
      target_type: 'deposit',
      target_id: rejId,
      new_value: { status: 'REJECTED', reason: reason || null },
    });

    const notifyDeposit = await getSetting('notify_deposit').catch(() => null);
    if (notifyDeposit !== 'false') fetch(`${BOT_RELAY_URL}/notify/deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${BOT_RELAY_AUTH_TOKEN}` },
      body: JSON.stringify({ request_id: rejId, status: 'REJECTED', reason }),
    }).then(async (r) => {
      if (!r.ok) {
        logAudit({ admin_id: adminId, action: 'NOTIFICATION_FAILED', target_type: 'deposit', target_id: rejId, new_value: { relay_status: r.status } }).catch(() => {});
      }
    }).catch(() => {
      logAudit({ admin_id: adminId, action: 'NOTIFICATION_FAILED', target_type: 'deposit', target_id: rejId, new_value: { error: 'relay_unreachable' } }).catch(() => {});
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const code = typeof err === 'object' && err !== null ? (err as Record<string, unknown>).code : undefined;
    if (code === '42703') return NextResponse.json({ error: 'Database migration required. Run migrations first.' }, { status: 500 });
    if (code === '23514') return NextResponse.json({ error: 'Invalid status transition.' }, { status: 500 });
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[deposits/reject]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
