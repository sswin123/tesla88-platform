import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { logAudit } from '@/lib/repositories/audit_repo';
import { getSetting } from '@/lib/repositories/settings_repo';
import { requirePermission } from '@/lib/require_permission';
import { ActivityLogService } from '@/lib/services/activity-log';

const BOT_RELAY_URL = process.env.BOT_RELAY_URL ?? 'http://localhost:8090';
const BOT_RELAY_AUTH_TOKEN = process.env.BOT_RELAY_AUTH_TOKEN ?? 'change_me_relay_token';

// POST: staff confirms payment is done — moves AWAITING_RECEIPT → PAID.
// Receipt upload is optional; this is the final action that debits the member's balance.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('withdraw.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const withdrawalId = parseInt(id, 10);
  if (isNaN(withdrawalId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  // Fetch withdrawal — must be AWAITING_RECEIPT to proceed
  const check = await pool.query<{
    id: number; user_id: number; status: string;
    withdraw_amount: string; bank_name: string; bank_account: string;
    available_balance: string;
  }>(
    `SELECT wr.id, wr.user_id, wr.status,
            wr.withdraw_amount, wr.bank_name, wr.bank_account,
            u.available_balance
     FROM withdrawal_requests wr
     JOIN users u ON u.id = wr.user_id
     WHERE wr.id = $1 AND wr.status = 'AWAITING_RECEIPT'`,
    [withdrawalId]
  );
  if (!check.rows[0]) {
    return NextResponse.json(
      { error: 'Withdrawal not found or not in AWAITING_RECEIPT status' },
      { status: 404 }
    );
  }

  const wr = check.rows[0];
  const amount        = parseFloat(wr.withdraw_amount);
  const balanceBefore = parseFloat(wr.available_balance);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE withdrawal_requests
       SET status = 'PAID', paid_at = NOW()
       WHERE id = $1`,
      [withdrawalId]
    );

    await client.query(
      'UPDATE users SET total_withdraw = total_withdraw + $1 WHERE id = $2',
      [amount, wr.user_id]
    );

    await client.query(
      `INSERT INTO wallet_transactions
         (user_id, type, direction, amount, balance_before, balance_after,
          remark, operator_admin_id, reference_type, reference_id)
       VALUES ($1, 'WITHDRAWAL', 'D', $2, $3, $4, 'Withdrawal paid', $5, 'withdrawal', $6)`,
      [wr.user_id, amount, balanceBefore, balanceBefore - amount, payload.sub, withdrawalId]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[withdrawal/done POST] payment error:', err);
    return NextResponse.json({ error: 'Failed to complete payment' }, { status: 500 });
  } finally {
    client.release();
  }

  // Audit + activity log (fire-and-forget)
  await Promise.all([
    logAudit({
      admin_id:    payload.sub,
      action:      'WITHDRAWAL_PAID',
      target_type: 'withdrawal',
      target_id:   withdrawalId,
      new_value:   { status: 'PAID' },
    }),
    ActivityLogService.log({
      member_id:      wr.user_id,
      category:       'WITHDRAWAL',
      action:         'Withdrawal Paid',
      title:          `出款完成 RM ${amount.toFixed(2)}`,
      description:    `${wr.bank_name} · ****${String(wr.bank_account).slice(-4)}`,
      amount:         -amount,
      balance_before: balanceBefore,
      balance_after:  balanceBefore - amount,
      reference_type: 'withdrawal',
      reference_id:   withdrawalId,
      operator_type:  'STAFF',
      operator_id:    payload.sub,
      operator_name:  typeof payload.username === 'string' ? payload.username : null,
      source:         'ERP',
      level:          'INFO',
      metadata:       { bank_name: wr.bank_name },
    }),
  ]).catch(() => {});

  // Notify member via bot relay (fire-and-forget)
  const notifyWithdrawal = await getSetting('notify_withdrawal').catch(() => null);
  if (notifyWithdrawal !== 'false') {
    fetch(`${BOT_RELAY_URL}/notify/withdrawal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${BOT_RELAY_AUTH_TOKEN}` },
      body: JSON.stringify({ request_id: withdrawalId, status: 'PAID' }),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
