import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { hashPassword, signMemberJWT, COOKIE_NAME, BANK_COOKIE_NAME, COOKIE_MAXAGE } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { normalizePhone } from '@/lib/phone';

function setBankCookie(res: NextResponse) {
  res.cookies.set(BANK_COOKIE_NAME, '1', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAXAGE,
    path: '/',
    sameSite: 'lax',
  });
}

async function getSettings(keys: string[]): Promise<Record<string, string>> {
  try {
    const { rows } = await pool.query<{ key: string; value: string }>(
      `SELECT key, value FROM system_settings WHERE key = ANY($1)`,
      [keys]
    );
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  } catch {
    return {};
  }
}

export async function POST(req: NextRequest) {
  // Check if website registration is enabled
  const settings = await getSettings([
    'website_registration', 'phone_unique', 'bank_unique', 'email_unique', 'telegram_unique',
  ]);

  if (settings['website_registration'] !== 'true') {
    return NextResponse.json(
      { error: '网站注册暂未开放，请联系在线客服或 Telegram 客服开通会员。' },
      { status: 403 }
    );
  }

  const ip = getClientIp(req);
  const rl = rateLimit(`register:${ip}`, 3, 60 * 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: '注册请求过于频繁，请稍后再试' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSecs) } }
    );
  }

  const body = await req.json() as {
    phone?: string;
    password?: string;
    first_name?: string;
    telegram_username?: string;
    referral_code?: string;
    email?: string;
  };

  const { password } = body;
  const rawPhone = body.phone ?? '';
  const firstName = (body.first_name ?? '').trim();
  const telegramUsername = (body.telegram_username ?? '').trim() || null;
  const referralCode = (body.referral_code ?? '').trim() || null;
  const email = (body.email ?? '').trim() || null;

  if (!rawPhone || !password || !firstName)
    return NextResponse.json({ error: 'name, phone and password required' }, { status: 400 });
  if (password.length < 8)
    return NextResponse.json({ error: '密码至少需要8个字符' }, { status: 400 });

  const phone = normalizePhone(rawPhone);
  if (!phone)
    return NextResponse.json({ error: '手机号格式无效' }, { status: 400 });

  // Validation: phone uniqueness (skip if phone exists but has no web password yet — Telegram user upgrade flow handled below)
  if (settings['phone_unique'] !== 'false') {
    const phoneCheck = await pool.query<{ website_password_hash: string | null }>(
      `SELECT website_password_hash FROM users WHERE phone = $1 AND status = 'ACTIVE' LIMIT 1`, [phone]
    );
    if (phoneCheck.rows[0]?.website_password_hash) {
      return NextResponse.json({ error: 'Number is already registered.' }, { status: 409 });
    }
  }

  // Validation: email uniqueness
  if (email && settings['email_unique'] === 'true') {
    const emailCheck = await pool.query<{ id: number }>(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`, [email]
    );
    if (emailCheck.rows.length > 0) {
      return NextResponse.json({ error: 'Email is already registered.' }, { status: 409 });
    }
  }

  // Validation: telegram uniqueness
  if (telegramUsername && settings['telegram_unique'] === 'true') {
    const tgCheck = await pool.query<{ id: number }>(
      `SELECT id FROM users WHERE telegram_username = $1 AND telegram_username IS NOT NULL LIMIT 1`,
      [telegramUsername]
    );
    if (tgCheck.rows.length > 0) {
      return NextResponse.json({ error: 'Telegram username is already registered.' }, { status: 409 });
    }
  }

  // Check if phone already exists (for upgrading Telegram-only accounts)
  const existing = await pool.query<{
    id: number;
    first_name: string;
    website_password_hash: string | null;
    bank_account: string | null;
  }>(
    `SELECT id, first_name, website_password_hash, bank_account
     FROM users WHERE phone = $1 AND status = 'ACTIVE'`,
    [phone]
  );

  const hash = await hashPassword(password);

  if (existing.rows.length > 0) {
    const user = existing.rows[0];
    if (user.website_password_hash) {
      // Phone exists and already has a web password — full duplicate
      return NextResponse.json(
        { error: '该手机号已注册，请直接登录' },
        { status: 409 }
      );
    }
    // Telegram member setting web password for first time
    await pool.query(
      'UPDATE users SET website_password_hash = $1, website_registered_at = NOW() WHERE id = $2',
      [hash, user.id]
    );
    const token = await signMemberJWT({ sub: user.id, phone, first_name: user.first_name });
    const res = NextResponse.json({ ok: true, first_name: user.first_name, new_user: false });
    // If this Telegram member already has bank info bound, set bank_ok cookie immediately
    if (user.bank_account) setBankCookie(res);
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: COOKIE_MAXAGE,
      path: '/',
      sameSite: 'lax',
    });
    return res;
  }

  // Resolve referral code → referred_by user id
  let referredById: number | null = null;
  if (referralCode) {
    const refRow = await pool.query<{ id: number }>(
      `SELECT id FROM users WHERE referral_code = $1 AND status = 'ACTIVE' LIMIT 1`,
      [referralCode]
    );
    referredById = refRow.rows[0]?.id ?? null;
  }

  // Create new user (migration 029 must be applied first to allow NULL telegram_id/bank fields)
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const newUser = await client.query<{ id: number }>(
      `INSERT INTO users
         (first_name, phone, telegram_username, website_password_hash, website_registered_at,
          eligible_free_credit, referred_by, register_source)
       VALUES ($1, $2, $3, $4, NOW(), FALSE, $5, 'WEBSITE')
       RETURNING id`,
      [firstName, phone, telegramUsername, hash, referredById]
    );

    const userId = newUser.rows[0].id;

    // Fetch brand prefix for public_id generation
    const brandRow = await client.query<{ value: string }>(
      `SELECT value FROM system_settings WHERE key = 'member_id_prefix' LIMIT 1`
    );
    const prefix = brandRow.rows[0]?.value ?? 'SS';
    const publicId = `${prefix}${1000000 + userId}`;

    await client.query(
      `UPDATE users SET public_id = $1, referral_code = $1 WHERE id = $2`,
      [publicId, userId]
    );

    // Update referrer's count
    if (referredById) {
      await client.query(
        `UPDATE users SET referral_count = referral_count + 1 WHERE id = $1`,
        [referredById]
      );
    }

    await client.query('COMMIT');

    const token = await signMemberJWT({ sub: userId, phone, first_name: firstName });
    const res = NextResponse.json({ ok: true, first_name: firstName, new_user: true }, { status: 201 });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: COOKIE_MAXAGE,
      path: '/',
      sameSite: 'lax',
    });
    return res;
  } catch (err) {
    await client.query('ROLLBACK');
    const pgErr = err as Record<string, unknown>;
    if (pgErr.code === '23505') {
      // Unique constraint violation (phone or bank_account duplicate)
      return NextResponse.json({ error: '该手机号已被注册' }, { status: 409 });
    }
    if (pgErr.code === '23502') {
      // NOT NULL constraint — migration 029 likely not applied; log detail, show friendly message
      console.error('[auth/register] NOT NULL violation — migration 029 required:', pgErr);
      return NextResponse.json(
        { error: '注册暂时不可用，请稍后再试或联系客服' },
        { status: 503 }
      );
    }
    console.error('[auth/register] create error:', err);
    return NextResponse.json({ error: '注册暂时不可用，请稍后再试或联系客服' }, { status: 500 });
  } finally {
    client.release();
  }
}
