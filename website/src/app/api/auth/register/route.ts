import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { signMemberJWT, COOKIE_NAME, BANK_COOKIE_NAME, COOKIE_MAXAGE } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { registerUser } from '@/lib/services/RegistrationService';

async function getSetting(key: string): Promise<string> {
  try {
    const { rows } = await pool.query<{ value: string }>(
      'SELECT value FROM system_settings WHERE key = $1 LIMIT 1', [key]
    );
    return rows[0]?.value ?? '';
  } catch { return ''; }
}

export async function POST(req: NextRequest) {
  // Check if website registration is open (system_settings controls the gate)
  const regEnabled = await getSetting('website_registration');
  if (regEnabled !== 'true') {
    return NextResponse.json(
      { error: '网站注册暂未开放，请联系在线客服或 Telegram 客服开通会员。' },
      { status: 403 }
    );
  }

  // IP-level rate limit (3 attempts/hour from same IP — early guard before DB checks)
  const ip = getClientIp(req);
  const rl = rateLimit(`register:${ip}`, 3, 60 * 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: '注册请求过于频繁，请稍后再试' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSecs) } }
    );
  }

  const body = await req.json() as {
    phone?: string; password?: string; first_name?: string;
    telegram_username?: string; referral_code?: string;
    referral_source?: string;
  };

  const result = await registerUser({
    first_name:        body.first_name        ?? '',
    raw_phone:         body.phone             ?? '',
    raw_password:      body.password          ?? '',
    min_password_length: 8,
    telegram_username: body.telegram_username,
    referral_code:     body.referral_code,
    referral_source:   body.referral_source === 'URL_REF' ? 'URL_REF' : 'MANUAL',
    register_source:   'WEBSITE',
    allow_upgrade:     true,   // Telegram members can set web password via website
    ip_address:        ip,
  });

  if (!result.ok) {
    console.error(`[register] ${result.error_code}: ${result.error} (ip=${ip})`);
    return NextResponse.json({ error: result.error }, { status: result.http_status });
  }

  const token = await signMemberJWT({ sub: result.user_id, phone: result.phone, first_name: result.first_name });
  const res = NextResponse.json(
    { ok: true, first_name: result.first_name, new_user: !result.is_upgrade },
    { status: result.is_upgrade ? 200 : 201 }
  );

  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAXAGE, path: '/', sameSite: 'lax',
  });

  // If Telegram upgrade and user already has bank, set bank cookie immediately
  if (result.is_upgrade && result.bank_account) {
    res.cookies.set(BANK_COOKIE_NAME, '1', {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      maxAge: COOKIE_MAXAGE, path: '/', sameSite: 'lax',
    });
  }

  return res;
}
