import { NextRequest, NextResponse } from 'next/server';
import {
  comparePassword,
  signJWT,
  getAdminByUsername,
  COOKIE_NAME,
  COOKIE_MAX_AGE,
} from '@/lib/auth';

export async function POST(request: NextRequest) {
  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { username, password } = body;
  if (!username || !password) {
    return NextResponse.json(
      { error: 'Username and password are required' },
      { status: 400 }
    );
  }

  const admin = await getAdminByUsername(username);
  if (!admin || !admin.is_active) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const valid = await comparePassword(password, admin.erp_password_hash);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const token = await signJWT({
    sub: admin.id,
    username: admin.erp_username,
    role: admin.role,
  });

  const response = NextResponse.json({ ok: true, role: admin.role });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
  return response;
}
