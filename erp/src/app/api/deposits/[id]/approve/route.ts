import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { logAudit } from '@/lib/repositories/audit_repo';
import { getSetting } from '@/lib/repositories/settings_repo';
import { requirePermission } from '@/lib/require_permission';

const BOT_RELAY_URL = process.env.BOT_RELAY_URL ?? 'http://localhost:8090';
const BOT_RELAY_AUTH_TOKEN = process.env.BOT_RELAY_AUTH_TOKEN ?? 'change_me_relay_token';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Get admin ID from JWT (same as bot's reviewed_by field)
  const payload = await requirePermission('deposit.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const adminId = payload.sub; // admins.id integer

  const { id } = await params;
  const requestId = parseInt(id, 10);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Accept both PENDING and PROCESSING (multi-CS workflow)
    const { rows } = await client.query(
      "SELECT * FROM deposit_requests WHERE id = $1 AND status IN ('PENDING', 'PROCESSING')",
      [requestId]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: 'Not found or already processed' },
        { status: 404 }
      );
    }

    const req = rows[0];

    await client.query(
      `UPDATE deposit_requests
       SET status = 'APPROVED', reviewed_by = $2, admin_note = $3, reviewed_at = NOW(),
           approved_by = $2::int, approved_at = NOW()
       WHERE id = $1`,
      [requestId, adminId, null]
    );

    // Identical to bot's user balance update
    await client.query(
      `UPDATE users
       SET total_deposit = total_deposit + $2,
           total_bonus   = total_bonus   + $3
       WHERE id = $1`,
      [req.user_id, req.deposit_amount, req.bonus_amount]
    );

    await client.query('COMMIT');
    await logAudit({
      admin_id: adminId,
      action: 'DEPOSIT_APPROVE',
      target_type: 'deposit',
      target_id: requestId,
      new_value: { status: 'APPROVED', amount: req.deposit_amount },
    });

    // Notify customer via bot relay (fire-and-forget; failures are audit-logged)
    const notifyDeposit = await getSetting('notify_deposit').catch(() => null);
    if (notifyDeposit !== 'false') fetch(`${BOT_RELAY_URL}/notify/deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${BOT_RELAY_AUTH_TOKEN}` },
      body: JSON.stringify({ request_id: requestId, status: 'APPROVED' }),
    }).then(async (r) => {
      if (!r.ok) {
        logAudit({ admin_id: adminId, action: 'NOTIFICATION_FAILED', target_type: 'deposit', target_id: requestId, new_value: { relay_status: r.status } }).catch(() => {});
      }
    }).catch(() => {
      logAudit({ admin_id: adminId, action: 'NOTIFICATION_FAILED', target_type: 'deposit', target_id: requestId, new_value: { error: 'relay_unreachable' } }).catch(() => {});
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    const code = typeof err === 'object' && err !== null ? (err as Record<string, unknown>).code : undefined;
    if (code === '42703') {
      return NextResponse.json({ error: 'Database migration 065 not applied. Run migrations first.' }, { status: 500 });
    }
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[deposits/approve]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    client.release();
  }
}
