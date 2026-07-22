import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME, getAdminByUsername, comparePassword, hashPassword } from '@/lib/auth';
import { logAudit } from '@/lib/repositories/audit_repo';
import pool from '@/lib/db';

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { current_password?: string; new_password?: string; confirm_password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { current_password, new_password, confirm_password } = body;

  if (!current_password) {
    return NextResponse.json({ error: 'Current password is required' }, { status: 400 });
  }
  if (!new_password || new_password.length < 8) {
    return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 });
  }
  if (new_password !== confirm_password) {
    return NextResponse.json({ error: 'Passwords do not match' }, { status: 400 });
  }
  if (current_password === new_password) {
    return NextResponse.json({ error: 'New password must be different from current password' }, { status: 400 });
  }

  const admin = await getAdminByUsername(payload.username);
  if (!admin || !admin.erp_password_hash) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const valid = await comparePassword(current_password, admin.erp_password_hash);
  if (!valid) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 403 });
  }

  const newHash = await hashPassword(new_password);
  await pool.query(
    `UPDATE admins SET erp_password_hash = $1 WHERE id = $2`,
    [newHash, payload.sub]
  );

  logAudit({
    admin_id:    payload.sub,
    action:      'PASSWORD_CHANGED',
    target_type: 'admin',
    target_id:   payload.sub,
    new_value:   { username: payload.username },
  }).catch(() => {});

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(COOKIE_NAME);
  return response;
}
