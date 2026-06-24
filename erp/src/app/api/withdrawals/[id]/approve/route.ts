import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import pool from '@/lib/db';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';

export async function POST(
  _req: NextRequest,
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
  const requestId = parseInt(id, 10);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check exists and is PENDING (matches bot's SELECT before mark_withdrawal_paid)
    const { rows } = await client.query(
      "SELECT * FROM withdrawal_requests WHERE id = $1 AND status = 'PENDING'",
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

    // Identical to bot's withdrawal_repo.py::mark_withdrawal_paid UPDATE
    // NOTE: status is 'PAID' not 'APPROVED'
    await client.query(
      `UPDATE withdrawal_requests
       SET status = 'PAID', reviewed_by = $2, admin_note = $3, reviewed_at = NOW()
       WHERE id = $1`,
      [requestId, adminId, null]
    );

    // Identical to bot's user balance update
    await client.query(
      'UPDATE users SET total_withdraw = total_withdraw + $2 WHERE id = $1',
      [req.user_id, req.withdraw_amount]
    );

    await client.query('COMMIT');
    return NextResponse.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
