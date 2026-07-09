import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { hashPassword, signMemberJWT, COOKIE_NAME, COOKIE_MAXAGE } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit(`register:${ip}`, 3, 60 * 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: '注册请求过于频繁，请稍后再试' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSecs) } }
    );
  }

  const body = await req.json() as { phone?: string; password?: string; first_name?: string };
  const { phone, password } = body;

  if (!phone || !password)
    return NextResponse.json({ error: 'phone and password required' }, { status: 400 });
  if (password.length < 8)
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });

  const existing = await pool.query<{ id: number; first_name: string; website_password_hash: string | null }>(
    `SELECT id, first_name, website_password_hash
     FROM users WHERE phone = $1 AND status = 'ACTIVE'`,
    [phone]
  );
  if (existing.rows.length === 0)
    return NextResponse.json({ error: 'Phone number not found. Please register via Telegram first.' }, { status: 404 });
  if (existing.rows[0].website_password_hash)
    return NextResponse.json({ error: 'Web access already activated. Please login instead.' }, { status: 409 });

  const hash = await hashPassword(password);
  await pool.query(
    'UPDATE users SET website_password_hash = $1, website_registered_at = NOW() WHERE id = $2',
    [hash, existing.rows[0].id]
  );

  const token = await signMemberJWT({
    sub: existing.rows[0].id,
    phone,
    first_name: body.first_name ?? existing.rows[0].first_name,
  });
  const res = NextResponse.json({ ok: true, first_name: existing.rows[0].first_name });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAXAGE,
    path: '/',
    sameSite: 'lax',
  });
  return res;
}
