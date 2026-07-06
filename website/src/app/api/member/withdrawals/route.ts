import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getMember } from '@/lib/member-auth';

export async function GET() {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const res = await pool.query(
    `SELECT id, withdraw_amount, status, bank_name, bank_account, created_at, reviewed_at
     FROM withdrawal_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [member.sub]
  );
  return NextResponse.json(res.rows);
}

export async function POST(req: NextRequest) {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { amount?: number };
  if (!body.amount || body.amount <= 0)
    return NextResponse.json({ error: 'amount required and must be positive' }, { status: 400 });

  const userRes = await pool.query<{ bank_name: string; bank_account: string; bank_holder_name: string }>(
    'SELECT bank_name, bank_account, bank_holder_name FROM users WHERE id = $1',
    [member.sub]
  );
  const u = userRes.rows[0];
  if (!u?.bank_account)
    return NextResponse.json({ error: 'No bank account on file. Contact support.' }, { status: 400 });

  const res = await pool.query(
    `INSERT INTO withdrawal_requests
       (user_id, withdraw_amount, bank_name, bank_account, bank_holder_name, status, provider, game_username)
     VALUES ($1, $2, $3, $4, $5, 'PENDING', 'MANUAL', '')
     RETURNING id`,
    [member.sub, body.amount, u.bank_name, u.bank_account, u.bank_holder_name]
  );
  return NextResponse.json({ ok: true, id: res.rows[0].id }, { status: 201 });
}
