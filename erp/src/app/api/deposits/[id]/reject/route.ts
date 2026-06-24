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

  // Identical to bot's deposit_repo.py::reject_deposit
  const { rows } = await pool.query(
    `UPDATE deposit_requests
     SET status = 'REJECTED', reviewed_by = $2, admin_note = $3, reviewed_at = NOW()
     WHERE id = $1 AND status = 'PENDING'
     RETURNING id`,
    [parseInt(id, 10), adminId, null]
  );
  if (!rows[0]) {
    return NextResponse.json(
      { error: 'Not found or already processed' },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true });
}
