import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import pool from '@/lib/db';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { logAudit } from '@/lib/repositories/audit_repo';

const BOT_RELAY_URL = process.env.BOT_RELAY_URL ?? 'http://localhost:8090';
const BOT_RELAY_AUTH_TOKEN = process.env.BOT_RELAY_AUTH_TOKEN ?? 'change_me_relay_token';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const adminId = payload.sub;

  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { reason?: string };
  const reason: string = body.reason ?? '';

  const rejId = parseInt(id, 10);
  const { rows } = await pool.query(
    `UPDATE deposit_requests
     SET status = 'REJECTED', reviewed_by = $2, reject_reason = $3, reviewed_at = NOW()
     WHERE id = $1 AND status = 'PENDING'
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

  // Notify customer via bot relay (fire-and-forget; failures are audit-logged)
  fetch(`${BOT_RELAY_URL}/notify/deposit`, {
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
}
