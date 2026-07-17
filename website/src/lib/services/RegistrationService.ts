import pool from '@/lib/db';
import bcrypt from 'bcryptjs';
import { normalizePhone } from '@/lib/phone';
import {
  checkPhonePolicy,
  checkTelegramPolicy,
  checkEmailPolicy,
  checkIpPolicy,
  logRegistrationEvent,
} from './RegistrationPolicyService';

// ── Types ─────────────────────────────────────────────────────────────────────

export type RegisterSource = 'WEBSITE' | 'ERP' | 'BOT' | 'API';

export type RegisterErrorCode =
  | 'PHONE_INVALID'
  | 'PHONE_DUPLICATE'
  | 'TELEGRAM_DUPLICATE'
  | 'EMAIL_DUPLICATE'
  | 'IP_RATE_LIMITED'
  | 'VALIDATION_ERROR'
  | 'DB_MISSING_COLUMN'
  | 'DB_NOT_NULL'
  | 'DB_CONSTRAINT'
  | 'DB_ERROR';

export type ReferralSource = 'URL_REF' | 'MANUAL' | 'ERP' | 'BOT';

export interface RegisterInput {
  first_name: string;
  raw_phone: string;
  raw_password: string;
  min_password_length?: number;
  telegram_username?: string | null;
  telegram_id?: number | null;
  email?: string | null;
  referral_code?: string | null;
  referral_source?: ReferralSource | null;
  vip_level?: number;
  status?: 'ACTIVE' | 'FROZEN';
  register_source: RegisterSource;
  allow_upgrade?: boolean;    // allow Telegram-member to set web password
  ignore_duplicate?: boolean; // Super Admin bypass
  brand_name?: string;
  ip_address?: string;
  admin_id?: number;
}

export interface RegisterSuccess {
  ok: true;
  user_id: number;
  public_id: string;
  phone: string;
  first_name: string;
  is_upgrade: boolean;
  bank_account: string | null;
}

export interface RegisterFailure {
  ok: false;
  error: string;
  error_code: RegisterErrorCode;
  http_status: number;
}

export type RegisterResult = RegisterSuccess | RegisterFailure;

// ── Main entry point ──────────────────────────────────────────────────────────

export async function registerUser(input: RegisterInput): Promise<RegisterResult> {
  const {
    raw_phone,
    raw_password,
    min_password_length = 8,
    telegram_username: rawTg,
    telegram_id,
    email: rawEmail,
    referral_code: rawRef,
    referral_source = null,
    vip_level = 0,
    status = 'ACTIVE',
    register_source,
    allow_upgrade = false,
    ignore_duplicate = false,
    brand_name,
    ip_address,
    admin_id,
  } = input;

  const first_name       = input.first_name.trim();
  const telegramUsername = (rawTg ?? '').trim().replace(/^@/, '') || null;
  const email            = (rawEmail ?? '').trim().toLowerCase() || null;
  const referral_code    = (rawRef ?? '').trim() || null;

  // ── Input validation ───────────────────────────────────────────────────────
  if (!first_name) return fail('姓名不能为空', 'VALIDATION_ERROR', 400);
  if (!raw_password || raw_password.length < min_password_length)
    return fail(`密码至少需要 ${min_password_length} 个字符`, 'VALIDATION_ERROR', 400);

  const phone = normalizePhone(raw_phone);
  if (!phone) return fail('手机号格式无效，请输入马来西亚手机号（如 011-12345678）', 'PHONE_INVALID', 400);

  // ── IP rate limit ──────────────────────────────────────────────────────────
  if (ip_address && !ignore_duplicate) {
    const ipCheck = await checkIpPolicy(ip_address, brand_name);
    if (!ipCheck.allowed) {
      console.log(`[RegistrationService] IP rate limited: ${ip_address}`);
      await logRegistrationEvent({ event_type: 'IP_RATE_LIMITED', phone, ip_address, brand_name, data: { source: register_source } });
      return fail(ipCheck.reason ?? '注册过于频繁，请稍后再试', 'IP_RATE_LIMITED', 429);
    }
  }

  // ── Phone policy ───────────────────────────────────────────────────────────
  const phoneCheck = await checkPhonePolicy(phone, undefined, brand_name);
  if (!phoneCheck.allowed && !ignore_duplicate) {
    console.log(`[RegistrationService] Phone blocked: ${phone} (count=${phoneCheck.count})`);
    await logRegistrationEvent({ event_type: 'PHONE_DUPLICATE_BLOCKED', phone, ip_address, brand_name, data: { source: register_source, count: phoneCheck.count } });
    return fail(phoneCheck.reason ?? '该手机号已注册', 'PHONE_DUPLICATE', 409);
  }
  if (!phoneCheck.allowed && ignore_duplicate) {
    await logRegistrationEvent({ event_type: 'SUPER_ADMIN_BYPASS', phone, ip_address, brand_name, admin_id, data: { reason: 'phone_duplicate', count: phoneCheck.count, source: register_source } });
  }
  if (phoneCheck.whitelist) {
    await logRegistrationEvent({ event_type: 'WHITELIST_BYPASS', phone, ip_address, brand_name, data: { type: 'phone', source: register_source } });
  }

  // ── Email policy ───────────────────────────────────────────────────────────
  if (email && !ignore_duplicate) {
    const emailCheck = await checkEmailPolicy(email, undefined, brand_name);
    if (!emailCheck.allowed) {
      return fail(emailCheck.reason ?? '该 Email 已被注册', 'EMAIL_DUPLICATE', 409);
    }
  }

  // ── Telegram policy ────────────────────────────────────────────────────────
  if ((telegram_id || telegramUsername) && !ignore_duplicate) {
    const tgCheck = await checkTelegramPolicy(telegram_id, telegramUsername, undefined, brand_name);
    if (!tgCheck.allowed) {
      await logRegistrationEvent({ event_type: 'TELEGRAM_DUPLICATE_BLOCKED', phone, ip_address, brand_name, data: { source: register_source } });
      return fail(tgCheck.reason ?? '该 Telegram 账号已被其他会员绑定', 'TELEGRAM_DUPLICATE', 409);
    }
  }

  // ── Telegram upgrade flow ──────────────────────────────────────────────────
  const existingRow = await pool.query<{
    id: number; first_name: string;
    website_password_hash: string | null; bank_account: string | null;
  }>('SELECT id, first_name, website_password_hash, bank_account FROM users WHERE phone = $1 LIMIT 1', [phone]);

  const passwordHash = await bcrypt.hash(raw_password, 10);

  if (existingRow.rows.length > 0 && allow_upgrade) {
    const user = existingRow.rows[0];
    if (user.website_password_hash) {
      return fail('该手机号已注册，请直接登录', 'PHONE_DUPLICATE', 409);
    }
    await pool.query(
      'UPDATE users SET website_password_hash = $1, website_registered_at = NOW() WHERE id = $2',
      [passwordHash, user.id]
    );
    console.log(`[RegistrationService] Telegram upgrade: user_id=${user.id} phone=${phone}`);
    await logRegistrationEvent({ event_type: 'TELEGRAM_UPGRADE', phone, ip_address, brand_name, data: { user_id: user.id, source: register_source } });
    return { ok: true, user_id: user.id, public_id: '', phone, first_name: user.first_name, is_upgrade: true, bank_account: user.bank_account };
  }

  if (existingRow.rows.length > 0 && !ignore_duplicate) {
    return fail('该手机号已注册', 'PHONE_DUPLICATE', 409);
  }

  // ── Referral code validation (before transaction) ─────────────────────────
  // If registration came from a referral link, reject if code is missing.
  if (referral_source === 'URL_REF' && !referral_code) {
    return fail('推荐链接无效，推荐码不存在', 'VALIDATION_ERROR', 400);
  }

  let referredById: number | null = null;
  if (referral_code) {
    const refRow = await pool.query<{ id: number; status: string }>(
      'SELECT id, status FROM users WHERE referral_code = $1 LIMIT 1',
      [referral_code],
    );
    const referrer = refRow.rows[0];
    if (!referrer) {
      return fail('推荐码无效，请检查后重试', 'VALIDATION_ERROR', 400);
    }
    if (referrer.status !== 'ACTIVE') {
      return fail('推荐码对应的会员账号已被冻结，无法使用此推荐码', 'VALIDATION_ERROR', 400);
    }
    referredById = referrer.id;
  }

  // ── Create new user ────────────────────────────────────────────────────────
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const newUser = await client.query<{ id: number }>(
      `INSERT INTO users
         (first_name, phone, telegram_username, website_password_hash, website_registered_at,
          eligible_free_credit, referred_by, status, vip_level, register_source)
       VALUES ($1, $2, $3, $4, NOW(), FALSE, $5, $6, $7, $8)
       RETURNING id`,
      [first_name, phone, telegramUsername, passwordHash, referredById, status, vip_level, register_source],
    );
    const userId = newUser.rows[0].id;

    const brandRow = await client.query<{ value: string }>(
      `SELECT value FROM system_settings WHERE key = 'member_id_prefix' LIMIT 1`
    );
    const prefix  = brandRow.rows[0]?.value ?? 'SS';
    const publicId = `${prefix}${1000000 + userId}`;

    await client.query('UPDATE users SET public_id = $1, referral_code = $1 WHERE id = $2', [publicId, userId]);

    if (referredById) {
      await client.query('UPDATE users SET referral_count = referral_count + 1 WHERE id = $1', [referredById]);
    }

    await client.query('COMMIT');
    console.log(`[RegistrationService] Created user_id=${userId} phone=${phone} source=${register_source}`);
    await logRegistrationEvent({ event_type: 'REGISTRATION_SUCCESS', phone, ip_address, brand_name, admin_id, data: { user_id: userId, source: register_source } });
    return { ok: true, user_id: userId, public_id: publicId, phone, first_name, is_upgrade: false, bank_account: null };

  } catch (e) {
    await client.query('ROLLBACK');
    const pgErr = e as Record<string, unknown>;
    const code   = String(pgErr.code    ?? '');
    const message = String(pgErr.message ?? '');
    const detail  = String(pgErr.detail  ?? '');

    console.error(`[RegistrationService] DB error code=${code} detail=${detail}`, e);

    if (code === '23505') {
      if (detail.includes('phone'))        return fail('该手机号已注册', 'PHONE_DUPLICATE', 409);
      if (detail.includes('telegram'))     return fail('该 Telegram 账号已被绑定', 'TELEGRAM_DUPLICATE', 409);
      if (detail.includes('email'))        return fail('该 Email 已被注册', 'EMAIL_DUPLICATE', 409);
      if (detail.includes('bank_account')) return fail('该银行账号已被使用', 'DB_CONSTRAINT', 409);
      return fail(`唯一键冲突：${detail || message}`, 'DB_CONSTRAINT', 409);
    }
    if (code === '42703') return fail(`数据库字段不存在：${message}`, 'DB_MISSING_COLUMN', 500);
    if (code === '23502') return fail(`必填字段为空：${message}`, 'DB_NOT_NULL', 500);
    return fail(message || '注册失败，请稍后重试', 'DB_ERROR', 500);
  } finally {
    client.release();
  }
}

function fail(error: string, error_code: RegisterErrorCode, http_status: number): RegisterFailure {
  return { ok: false, error, error_code, http_status };
}
