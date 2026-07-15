import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { comparePassword, signMemberJWT, COOKIE_NAME, BANK_COOKIE_NAME, COOKIE_MAXAGE } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { normalizePhone } from '@/lib/phone';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit(`login:${ip}`, 5, 15 * 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: '登录尝试过于频繁，请稍后再试' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSecs) } }
    );
  }

  const body = await req.json() as { phone?: string; password?: string };
  const { password } = body;
  const rawPhone = body.phone ?? '';

  if (!rawPhone || !password)
    return NextResponse.json({ error: 'phone and password required' }, { status: 400 });

  const phone = normalizePhone(rawPhone);
  if (!phone)
    return NextResponse.json({ error: '手机号格式无效' }, { status: 400 });

  const res = await pool.query<{ id: number; first_name: string; website_password_hash: string | null; status: string; bank_account: string | null }>(
    'SELECT id, first_name, website_password_hash, status, bank_account FROM users WHERE phone = $1',
    [phone]
  );
  const user = res.rows[0];
  if (!user || !user.website_password_hash)
    return NextResponse.json({ error: 'Invalid phone or password' }, { status: 401 });
  if (user.status !== 'ACTIVE')
    return NextResponse.json({ error: 'Account is frozen. Contact support.' }, { status: 403 });

  const ok = await comparePassword(password, user.website_password_hash);
  if (!ok) return NextResponse.json({ error: 'Invalid phone or password' }, { status: 401 });

  const token = await signMemberJWT({ sub: user.id, phone, first_name: user.first_name });
  const bankComplete = !!(user.bank_account);
  const response = NextResponse.json({ ok: true, first_name: user.first_name, bank_complete: bankComplete });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAXAGE,
    path: '/',
    sameSite: 'lax',
  });
  if (bankComplete) {
    response.cookies.set(BANK_COOKIE_NAME, '1', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: COOKIE_MAXAGE,
      path: '/',
      sameSite: 'lax',
    });
  }
  return response;
}
