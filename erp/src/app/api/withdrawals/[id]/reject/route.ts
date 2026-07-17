import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { logAudit } from '@/lib/repositories/audit_repo';
import { getSetting } from '@/lib/repositories/settings_repo';
import { requirePermission } from '@/lib/require_permission';
import { ActivityLogService } from '@/lib/services/activity-log';

const BOT_RELAY_URL = process.env.BOT_RELAY_URL ?? 'http://localhost:8090';
const BOT_RELAY_AUTH_TOKEN = process.env.BOT_RELAY_AUTH_TOKEN ?? 'change_me_relay_token';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('withdraw.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const adminId = payload.sub;

  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { reason?: string };
  const reason: string = body.reason ?? '';
  const rejId = parseInt(id, 10);

  /* Reject the withdrawal — DB trigger automatically decrements users.pending_withdrawal,
     returning the locked funds to available_balance with no extra UPDATE needed. */
  const { rows } = await pool.query<{
    id: number; user_id: number; withdraw_amount: string; bank_name: string; bank_account: string;
  }>(
    `UPDATE withdrawal_requests
     SET status = 'REJECTED', reviewed_by = $2, reject_reason = $3, reviewed_at = NOW()
     WHERE id = $1 AND status = 'PENDING'
     RETURNING id, user_id, withdraw_amount, bank_name, bank_account`,
    [rejId, adminId, reason || null]
  );

  if (!rows[0]) {
    return NextResponse.json({ error: 'Not found or already processed' }, { status: 404 });
  }

  const wr = rows[0];
  const amount = parseFloat(wr.withdraw_amount);

  await Promise.all([
    logAudit({
      admin_id:    adminId,
      action:      'WITHDRAWAL_REJECT',
      target_type: 'withdrawal',
      target_id:   rejId,
      new_value:   { status: 'REJECTED', reason: reason || null },
    }),
    ActivityLogService.log({
      member_id:     wr.user_id,
      category:      'WITHDRAWAL',
      action:        'Withdrawal Rejected',
      title:         `出款拒绝 RM ${amount.toFixed(2)}（余额已归还）`,
      description:   reason ? `原因: ${reason}` : undefined,
      amount:        amount,
      reference_type: 'withdrawal',
      reference_id:   rejId,
      operator_type:  'STAFF',
      operator_id:    adminId,
      operator_name:  typeof payload.username === 'string' ? payload.username : null,
      source:         'ERP',
      level:          'WARNING',
      remark:         reason || null,
      metadata:       { bank_name: wr.bank_name, last4: String(wr.bank_account).slice(-4) },
    }),
  ]);

  /* Notify customer via bot relay (fire-and-forget) */
  const notifyWithdrawal = await getSetting('notify_withdrawal').catch(() => null);
  if (notifyWithdrawal !== 'false') fetch(`${BOT_RELAY_URL}/notify/withdrawal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${BOT_RELAY_AUTH_TOKEN}` },
    body: JSON.stringify({ request_id: rejId, status: 'REJECTED', reason }),
  }).then(async (r) => {
    if (!r.ok) {
      logAudit({ admin_id: adminId, action: 'NOTIFICATION_FAILED', target_type: 'withdrawal', target_id: rejId, new_value: { relay_status: r.status } }).catch(() => {});
    }
  }).catch(() => {
    logAudit({ admin_id: adminId, action: 'NOTIFICATION_FAILED', target_type: 'withdrawal', target_id: rejId, new_value: { error: 'relay_unreachable' } }).catch(() => {});
  });

  return NextResponse.json({ ok: true });
}
