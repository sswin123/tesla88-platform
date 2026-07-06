import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getMember } from '@/lib/member-auth';

export async function GET() {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const res = await pool.query(
    `SELECT id, deposit_amount, bonus_amount, status, provider, created_at, reviewed_at
     FROM deposit_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [member.sub]
  );
  return NextResponse.json(res.rows);
}

export async function POST(req: NextRequest) {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { amount?: number; provider?: string; promotion_id?: number };
  if (!body.amount || body.amount <= 0)
    return NextResponse.json({ error: 'amount required and must be positive' }, { status: 400 });
  if (!body.provider)
    return NextResponse.json({ error: 'provider required' }, { status: 400 });

  const res = await pool.query(
    `INSERT INTO deposit_requests
       (user_id, provider, deposit_amount, bonus_amount, credit_amount, status, promotion_id)
     VALUES ($1, $2, $3, 0, $3, 'PENDING', $4)
     RETURNING id`,
    [member.sub, body.provider, body.amount, body.promotion_id ?? null]
  );
  return NextResponse.json({ ok: true, id: res.rows[0].id }, { status: 201 });
}
