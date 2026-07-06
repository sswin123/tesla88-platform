import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getMember } from '@/lib/member-auth';
import { hashPassword } from '@/lib/auth';

export async function GET() {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const res = await pool.query(
    `SELECT id, first_name, phone, bank_name, bank_account, bank_holder_name,
            status, total_deposit, total_withdraw, total_bonus, net_deposit,
            referral_code, created_at, last_seen_at
     FROM users WHERE id = $1`,
    [member.sub]
  );
  if (res.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(res.rows[0]);
}

export async function PATCH(req: NextRequest) {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { new_password?: string };
  if (!body.new_password)
    return NextResponse.json({ error: 'new_password required' }, { status: 400 });
  if (body.new_password.length < 8)
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });

  const hash = await hashPassword(body.new_password);
  await pool.query('UPDATE users SET website_password_hash = $1 WHERE id = $2', [hash, member.sub]);
  return NextResponse.json({ ok: true });
}
