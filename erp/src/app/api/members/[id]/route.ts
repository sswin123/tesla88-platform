import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { rows } = await pool.query(
    `SELECT u.*,
       (SELECT COUNT(*)::int FROM deposit_requests   WHERE user_id = u.id AND status = 'APPROVED') AS deposit_count,
       (SELECT COUNT(*)::int FROM withdrawal_requests WHERE user_id = u.id AND status = 'PAID')    AS withdrawal_count
     FROM users u
     WHERE u.id = $1`,
    [parseInt(id, 10)]
  );
  if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body: { status?: string } = await request.json();

  if (!body.status || !['ACTIVE', 'FROZEN'].includes(body.status)) {
    return NextResponse.json({ error: 'status must be ACTIVE or FROZEN' }, { status: 400 });
  }

  const { rows } = await pool.query(
    'UPDATE users SET status = $1 WHERE id = $2 RETURNING id, status',
    [body.status, parseInt(id, 10)]
  );
  if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(rows[0]);
}
