import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { normalizePhone } from '@/lib/phone';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit(`forgot-password:${ip}`, 5, 15 * 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: '请求过于频繁，请稍后再试' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSecs) } }
    );
  }

  const body = await req.json() as { phone?: string; password?: string };
  const rawPhone = body.phone ?? '';
  const { password } = body;

  if (!rawPhone)
    return NextResponse.json({ error: '请输入手机号' }, { status: 400 });

  const phone = normalizePhone(rawPhone);
  if (!phone)
    return NextResponse.json({ error: '手机号格式无效' }, { status: 400 });

  // Step 1: check phone only (no password provided)
  if (!password) {
    const row = await pool.query<{ id: number }>(
      `SELECT id FROM users WHERE phone = $1 AND status = 'ACTIVE' LIMIT 1`,
      [phone]
    );
    if (row.rows.length === 0) {
      return NextResponse.json({ error: '该手机号未注册' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, found: true });
  }

  // Step 2: reset password
  if (password.length < 8)
    return NextResponse.json({ error: '密码至少需要8个字符' }, { status: 400 });

  const hash = await hashPassword(password);
  const result = await pool.query(
    `UPDATE users SET website_password_hash = $1 WHERE phone = $2 AND status = 'ACTIVE'`,
    [hash, phone]
  );

  if ((result.rowCount ?? 0) === 0) {
    return NextResponse.json({ error: '该手机号未注册' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, reset: true });
}
