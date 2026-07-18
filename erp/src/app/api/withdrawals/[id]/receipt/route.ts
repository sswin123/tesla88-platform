import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { logAudit } from '@/lib/repositories/audit_repo';
import { getSetting } from '@/lib/repositories/settings_repo';
import { requirePermission } from '@/lib/require_permission';
import { mediaService, MediaValidationError } from '@/lib/media';
import { ActivityLogService } from '@/lib/services/activity-log';

const BOT_RELAY_URL = process.env.BOT_RELAY_URL ?? 'http://localhost:8090';
const BOT_RELAY_AUTH_TOKEN = process.env.BOT_RELAY_AUTH_TOKEN ?? 'change_me_relay_token';

// POST: upload receipt for an approved withdrawal.
// When status = AWAITING_RECEIPT: saves receipt, completes payment (status → PAID, debits balance).
// When status = PAID (already completed): just replaces the receipt file.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('withdraw.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const withdrawalId = parseInt(id, 10);
  if (isNaN(withdrawalId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

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
     WHERE wr.id = $1 AND wr.status IN ('AWAITING_RECEIPT', 'PAID')`,
    [withdrawalId]
  );
  if (!check.rows[0]) {
    return NextResponse.json(
      { error: 'Withdrawal not found or not approved yet' },
      { status: 404 }
    );
  }

  const wr = check.rows[0];
  const needsPayment = wr.status === 'AWAITING_RECEIPT';

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let mediaId: number;
  try {
    const result = await mediaService.save({
      buffer,
      originalFilename: file.name,
      mimeType: file.type || 'application/octet-stream',
      uploadedBy: payload.sub,
      displayName: `WD-${withdrawalId}-receipt`,
    });
    mediaId = result.record.id;
  } catch (err) {
    if (err instanceof MediaValidationError) {
      return NextResponse.json({ error: err.reason }, { status: 422 });
    }
    console.error('[withdrawal/receipt POST] media save error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }

  if (needsPayment) {
    /* Complete the payment: mark PAID, debit balance, record wallet transaction */
    const amount       = parseFloat(wr.withdraw_amount);
    const balanceBefore = parseFloat(wr.available_balance);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE withdrawal_requests
         SET status = 'PAID', receipt_media_id = $2, paid_at = NOW()
         WHERE id = $1`,
        [withdrawalId, mediaId]
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
      console.error('[withdrawal/receipt POST] payment error:', err);
      return NextResponse.json({ error: 'Failed to complete payment' }, { status: 500 });
    } finally {
      client.release();
    }

    await Promise.all([
      logAudit({
        admin_id:    payload.sub,
        action:      'WITHDRAWAL_PAID',
        target_type: 'withdrawal',
        target_id:   withdrawalId,
        new_value:   { status: 'PAID', receipt_media_id: mediaId },
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

    /* Notify member via bot relay (fire-and-forget) */
    const notifyWithdrawal = await getSetting('notify_withdrawal').catch(() => null);
    if (notifyWithdrawal !== 'false') fetch(`${BOT_RELAY_URL}/notify/withdrawal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${BOT_RELAY_AUTH_TOKEN}` },
      body: JSON.stringify({ request_id: withdrawalId, status: 'PAID' }),
    }).then(async (r) => {
      if (!r.ok) {
        logAudit({ admin_id: payload.sub, action: 'NOTIFICATION_FAILED', target_type: 'withdrawal', target_id: withdrawalId, new_value: { relay_status: r.status } }).catch(() => {});
      }
    }).catch(() => {
      logAudit({ admin_id: payload.sub, action: 'NOTIFICATION_FAILED', target_type: 'withdrawal', target_id: withdrawalId, new_value: { error: 'relay_unreachable' } }).catch(() => {});
    });
  } else {
    /* Already PAID — just replace the receipt file */
    await pool.query(
      `UPDATE withdrawal_requests SET receipt_media_id = $1 WHERE id = $2`,
      [mediaId, withdrawalId]
    );

    logAudit({
      admin_id:    payload.sub,
      action:      'WITHDRAWAL_RECEIPT_UPLOAD',
      target_type: 'withdrawal',
      target_id:   withdrawalId,
      new_value:   { receipt_media_id: mediaId },
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, receipt_media_id: mediaId });
}

// DELETE: remove receipt from a withdrawal
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('withdraw.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const withdrawalId = parseInt(id, 10);
  if (isNaN(withdrawalId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  await pool.query(
    `UPDATE withdrawal_requests SET receipt_media_id = NULL WHERE id = $1`,
    [withdrawalId]
  );

  return NextResponse.json({ ok: true });
}
