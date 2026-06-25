import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import pool from '@/lib/db';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { logAudit } from '@/lib/repositories/audit_repo';

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
    return NextResponse.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
