import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { comparePassword, signMemberJWT, COOKIE_NAME, COOKIE_MAXAGE } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const body = await req.json() as { phone?: string; password?: string };
  const { phone, password } = body;

  if (!phone || !password)
    return NextResponse.json({ error: 'phone and password required' }, { status: 400 });

  const res = await pool.query<{ id: number; first_name: string; website_password_hash: string | null; status: string }>(
    'SELECT id, first_name, website_password_hash, status FROM users WHERE phone = $1',
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
  const response = NextResponse.json({ ok: true, first_name: user.first_name });
  response.cookies.set(COOKIE_NAME, token, { httpOnly: true, maxAge: COOKIE_MAXAGE, path: '/', sameSite: 'lax' });
  return response;
}
