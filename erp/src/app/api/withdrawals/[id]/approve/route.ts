import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { logAudit } from '@/lib/repositories/audit_repo';
import { getSetting } from '@/lib/repositories/settings_repo';
import { requirePermission } from '@/lib/require_permission';
import { ActivityLogService } from '@/lib/services/activity-log';

const BOT_RELAY_URL = process.env.BOT_RELAY_URL ?? 'http://localhost:8090';
const BOT_RELAY_AUTH_TOKEN = process.env.BOT_RELAY_AUTH_TOKEN ?? 'change_me_relay_token';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('withdraw.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const adminId = payload.sub;

  const { id } = await params;
  const requestId = parseInt(id, 10);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    /* Load withdrawal + member balance snapshot */
    const { rows } = await client.query<{
      user_id: number; withdraw_amount: string; bank_name: string; bank_account: string;
      available_balance: string;
    }>(
      `SELECT wr.user_id, wr.withdraw_amount, wr.bank_name, wr.bank_account,
              u.available_balance
       FROM withdrawal_requests wr
       JOIN users u ON u.id = wr.user_id
       WHERE wr.id = $1 AND wr.status IN ('PENDING', 'PROCESSING')`,
      [requestId]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Not found or already processed' }, { status: 404 });
    }

    const wr = rows[0];
    const amount       = parseFloat(wr.withdraw_amount);
    // available_balance already excludes pending_withdrawal; after approval both sides
    // move: pending_withdrawal decreases (trigger) AND total_withdraw increases.
    // The net effect on net_deposit is a decrease; available_balance will reflect this.
    const balanceBefore = parseFloat(wr.available_balance);

    /* Mark as PAID — DB trigger automatically decrements users.pending_withdrawal */
    await client.query(
      `UPDATE withdrawal_requests
       SET status = 'PAID', reviewed_by = $2, admin_note = $3, reviewed_at = NOW(),
           approved_by = $2, approved_at = NOW()
       WHERE id = $1`,
      [requestId, adminId, null]
    );

    /* Debit the actual balance (net_deposit) */
    await client.query(
      'UPDATE users SET total_withdraw = total_withdraw + $1 WHERE id = $2',
      [amount, wr.user_id]
    );

    /* Audit trail in wallet_transactions (H-3) */
    await client.query(
      `INSERT INTO wallet_transactions
         (user_id, type, direction, amount, balance_before, balance_after,
          remark, operator_admin_id, reference_type, reference_id)
       VALUES ($1, 'WITHDRAWAL', 'D', $2, $3, $4, 'Withdrawal approved', $5, 'withdrawal', $6)`,
      [wr.user_id, amount, balanceBefore, balanceBefore - amount, adminId, requestId]
    );

    await client.query('COMMIT');

    await Promise.all([
      logAudit({
        admin_id:    adminId,
        action:      'WITHDRAWAL_APPROVE',
        target_type: 'withdrawal',
        target_id:   requestId,
        new_value:   { status: 'PAID', amount },
      }),
      ActivityLogService.log({
        member_id:      wr.user_id,
        category:       'WITHDRAWAL',
        action:         'Withdrawal Approved',
        title:          `出款批准 RM ${amount.toFixed(2)}`,
        description:    `${wr.bank_name} · ****${String(wr.bank_account).slice(-4)}`,
        amount:         -amount,
        balance_before: balanceBefore,
        balance_after:  balanceBefore - amount,
        reference_type: 'withdrawal',
        reference_id:   requestId,
        operator_type:  'STAFF',
        operator_id:    adminId,
        operator_name:  typeof payload.username === 'string' ? payload.username : null,
        source:         'ERP',
        level:          'INFO',
        metadata:       { bank_name: wr.bank_name },
      }),
    ]);

    /* Notify customer via bot relay (fire-and-forget) */
    const notifyWithdrawal = await getSetting('notify_withdrawal').catch(() => null);
    if (notifyWithdrawal !== 'false') fetch(`${BOT_RELAY_URL}/notify/withdrawal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${BOT_RELAY_AUTH_TOKEN}` },
      body: JSON.stringify({ request_id: requestId, status: 'PAID' }),
    }).then(async (r) => {
      if (!r.ok) {
        logAudit({ admin_id: adminId, action: 'NOTIFICATION_FAILED', target_type: 'withdrawal', target_id: requestId, new_value: { relay_status: r.status } }).catch(() => {});
      }
    }).catch(() => {
      logAudit({ admin_id: adminId, action: 'NOTIFICATION_FAILED', target_type: 'withdrawal', target_id: requestId, new_value: { error: 'relay_unreachable' } }).catch(() => {});
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
