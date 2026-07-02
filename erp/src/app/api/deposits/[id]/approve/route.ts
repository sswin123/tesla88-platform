import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import pool from '@/lib/db';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { logAudit } from '@/lib/repositories/audit_repo';
import { getSetting } from '@/lib/repositories/settings_repo';

const BOT_RELAY_URL = process.env.BOT_RELAY_URL ?? 'http://localhost:8090';
const BOT_RELAY_AUTH_TOKEN = process.env.BOT_RELAY_AUTH_TOKEN ?? 'change_me_relay_token';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Get admin ID from JWT (same as bot's reviewed_by field)
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const adminId = payload.sub; // admins.id integer

  const { id } = await params;
  const requestId = parseInt(id, 10);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check exists and is PENDING (matches bot's SELECT before approve)
    const { rows } = await client.query(
      "SELECT * FROM deposit_requests WHERE id = $1 AND status = 'PENDING'",
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

    // Identical to bot's deposit_repo.py::approve_deposit UPDATE
    await client.query(
      `UPDATE deposit_requests
       SET status = 'APPROVED', reviewed_by = $2, admin_note = $3, reviewed_at = NOW()
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
    const notifyDeposit = await getSetting('notify_deposit');
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
    throw err;
  } finally {
    client.release();
  }
}
