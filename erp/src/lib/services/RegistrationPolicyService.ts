import pool from '@/lib/db';

export interface RegistrationPolicy {
  security_enabled: boolean;
  registration_mode: string;
  phone_check_enabled: boolean;
  phone_max_accounts: number;    // 1=unique, 0=unlimited
  bank_check_enabled: boolean;
  bank_max_members: number;
  telegram_check_enabled: boolean;
  email_check_enabled: boolean;
  device_protection_enabled: boolean;
  device_max_per_24h: number;
  ip_protection_enabled: boolean;
  ip_max_per_24h: number;
}

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
  whitelist: boolean;
  count: number;
  max: number;
}

// ── 30-second in-memory cache ─────────────────────────────────────────────────
const policyCache = new Map<string, { policy: RegistrationPolicy; expires: number }>();
const CACHE_TTL = 30_000;

export function invalidatePolicyCache(): void {
  policyCache.clear();
}

// ── Load policy from DB (with brand override) ─────────────────────────────────
export async function loadPolicy(brandName?: string): Promise<RegistrationPolicy> {
  const cacheKey = brandName ?? '__global__';
  const cached = policyCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.policy;

  const { rows } = await pool.query<{ key: string; value: string }>(
    'SELECT key, value FROM registration_security_config'
  );
  const cfg: Record<string, string> = {};
  for (const r of rows) cfg[r.key] = r.value;

  const policy: RegistrationPolicy = {
    security_enabled:          cfg['security_enabled']          !== 'false',
    registration_mode:         cfg['registration_mode']         ?? 'STANDARD',
    phone_check_enabled:       cfg['phone_check_enabled']       !== 'false',
    phone_max_accounts:        parseInt(cfg['phone_max_accounts'] ?? '1', 10),
    bank_check_enabled:        cfg['bank_check_enabled']        !== 'false',
    bank_max_members:          parseInt(cfg['bank_max_members']  ?? '1', 10),
    telegram_check_enabled:    cfg['telegram_check_enabled']    === 'true',
    email_check_enabled:       cfg['email_check_enabled']       === 'true',
    device_protection_enabled: cfg['device_protection_enabled'] === 'true',
    device_max_per_24h:        parseInt(cfg['device_max_per_24h'] ?? '3', 10),
    ip_protection_enabled:     cfg['ip_protection_enabled']     === 'true',
    ip_max_per_24h:            parseInt(cfg['ip_max_per_24h']   ?? '10', 10),
  };

  // Apply brand override
  if (brandName) {
    try {
      const ov = await pool.query<{
        phone_check_enabled: boolean | null; phone_max_accounts: number | null;
        bank_check_enabled: boolean | null;  bank_max_members: number | null;
      }>('SELECT * FROM brand_registration_override WHERE brand_name = $1', [brandName]);
      if (ov.rows[0]) {
        const o = ov.rows[0];
        if (o.phone_check_enabled !== null) policy.phone_check_enabled = o.phone_check_enabled;
        if (o.phone_max_accounts !== null)  policy.phone_max_accounts  = o.phone_max_accounts;
        if (o.bank_check_enabled !== null)  policy.bank_check_enabled  = o.bank_check_enabled;
        if (o.bank_max_members !== null)    policy.bank_max_members    = o.bank_max_members;
      }
    } catch { /* table not yet migrated — use global */ }
  }

  policyCache.set(cacheKey, { policy, expires: Date.now() + CACHE_TTL });
  return policy;
}

// ── Phone check ───────────────────────────────────────────────────────────────
export async function checkPhonePolicy(
  phone: string,
  excludeUserId?: number,
  brandName?: string
): Promise<PolicyDecision> {
  const policy = await loadPolicy(brandName);
  if (!policy.security_enabled || !policy.phone_check_enabled) {
    return { allowed: true, whitelist: false, count: 0, max: 0 };
  }

  try {
    const wl = await pool.query<{ id: number }>(
      'SELECT id FROM registration_whitelist_phones WHERE phone = $1 LIMIT 1', [phone]
    );
    if (wl.rows.length > 0) {
      return { allowed: true, whitelist: true, count: 0, max: policy.phone_max_accounts };
    }
  } catch { /* whitelist not yet migrated */ }

  const countQ = excludeUserId
    ? await pool.query<{ cnt: number }>('SELECT COUNT(*)::int AS cnt FROM users WHERE phone = $1 AND id != $2', [phone, excludeUserId])
    : await pool.query<{ cnt: number }>('SELECT COUNT(*)::int AS cnt FROM users WHERE phone = $1', [phone]);
  const count = countQ.rows[0]?.cnt ?? 0;
  const max = policy.phone_max_accounts;

  if (max === 0 || count < max) return { allowed: true, whitelist: false, count, max };
  return { allowed: false, whitelist: false, count, max, reason: '该手机号已注册' };
}

// ── Bank account check ────────────────────────────────────────────────────────
export async function checkBankPolicy(
  accountNumber: string,   // already normalized
  bankName?: string,
  excludeUserId?: number,
  brandName?: string
): Promise<PolicyDecision> {
  const policy = await loadPolicy(brandName);
  if (!policy.security_enabled || !policy.bank_check_enabled) {
    return { allowed: true, whitelist: false, count: 0, max: 0 };
  }

  if (bankName) {
    try {
      const wl = await pool.query<{ id: number }>(
        'SELECT id FROM registration_whitelist_banks WHERE account_number = $1 AND bank_name = $2 LIMIT 1',
        [accountNumber, bankName]
      );
      if (wl.rows.length > 0) {
        return { allowed: true, whitelist: true, count: 0, max: policy.bank_max_members };
      }
    } catch { /* not yet migrated */ }
  }

  const countQ = excludeUserId
    ? await pool.query<{ cnt: number }>(
        'SELECT COUNT(*)::int AS cnt FROM users WHERE bank_account = $1 AND id != $2 AND bank_account IS NOT NULL',
        [accountNumber, excludeUserId]
      )
    : await pool.query<{ cnt: number }>(
        'SELECT COUNT(*)::int AS cnt FROM users WHERE bank_account = $1 AND bank_account IS NOT NULL',
        [accountNumber]
      );
  const count = countQ.rows[0]?.cnt ?? 0;
  const max = policy.bank_max_members;

  if (max === 0 || count < max) return { allowed: true, whitelist: false, count, max };
  return { allowed: false, whitelist: false, count, max, reason: '该银行账号已被其他会员使用' };
}

// ── Telegram check ────────────────────────────────────────────────────────────
export async function checkTelegramPolicy(
  telegramId?: number | null,
  telegramUsername?: string | null,
  excludeUserId?: number,
  brandName?: string
): Promise<PolicyDecision> {
  const policy = await loadPolicy(brandName);
  if (!policy.security_enabled || !policy.telegram_check_enabled) {
    return { allowed: true, whitelist: false, count: 0, max: 1 };
  }

  if (telegramId) {
    const q = excludeUserId
      ? await pool.query<{ cnt: number }>('SELECT COUNT(*)::int AS cnt FROM users WHERE telegram_id = $1 AND id != $2', [telegramId, excludeUserId])
      : await pool.query<{ cnt: number }>('SELECT COUNT(*)::int AS cnt FROM users WHERE telegram_id = $1', [telegramId]);
    if ((q.rows[0]?.cnt ?? 0) > 0) {
      return { allowed: false, whitelist: false, count: q.rows[0].cnt, max: 1, reason: '该 Telegram 账号已被其他会员绑定' };
    }
  } else if (telegramUsername) {
    const q = excludeUserId
      ? await pool.query<{ cnt: number }>('SELECT COUNT(*)::int AS cnt FROM users WHERE telegram_username = $1 AND id != $2', [telegramUsername, excludeUserId])
      : await pool.query<{ cnt: number }>('SELECT COUNT(*)::int AS cnt FROM users WHERE telegram_username = $1', [telegramUsername]);
    if ((q.rows[0]?.cnt ?? 0) > 0) {
      return { allowed: false, whitelist: false, count: q.rows[0].cnt, max: 1, reason: '该 Telegram 账号已被其他会员绑定' };
    }
  }

  return { allowed: true, whitelist: false, count: 0, max: 1 };
}

// ── Email check ───────────────────────────────────────────────────────────────
export async function checkEmailPolicy(
  email: string,
  excludeUserId?: number,
  brandName?: string
): Promise<PolicyDecision> {
  const policy = await loadPolicy(brandName);
  if (!policy.security_enabled || !policy.email_check_enabled) {
    return { allowed: true, whitelist: false, count: 0, max: 1 };
  }

  try {
    const q = excludeUserId
      ? await pool.query<{ cnt: number }>('SELECT COUNT(*)::int AS cnt FROM users WHERE LOWER(email) = LOWER($1) AND id != $2', [email, excludeUserId])
      : await pool.query<{ cnt: number }>('SELECT COUNT(*)::int AS cnt FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    const count = q.rows[0]?.cnt ?? 0;
    if (count > 0) return { allowed: false, whitelist: false, count, max: 1, reason: '该 Email 已被注册' };
    return { allowed: true, whitelist: false, count: 0, max: 1 };
  } catch {
    // users.email column does not exist yet — treat as no duplicate
    return { allowed: true, whitelist: false, count: 0, max: 1 };
  }
}

// ── IP rate limit check ───────────────────────────────────────────────────────
export async function checkIpPolicy(
  ipAddress: string,
  brandName?: string
): Promise<PolicyDecision> {
  const policy = await loadPolicy(brandName);
  if (!policy.security_enabled || !policy.ip_protection_enabled) {
    return { allowed: true, whitelist: false, count: 0, max: 0 };
  }

  try {
    const q = await pool.query<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt FROM registration_security_audit
       WHERE event_type = 'REGISTRATION_SUCCESS'
         AND ip_address = $1
         AND created_at > NOW() - INTERVAL '24 hours'`,
      [ipAddress]
    );
    const count = q.rows[0]?.cnt ?? 0;
    const max = policy.ip_max_per_24h;
    if (count >= max) {
      return { allowed: false, whitelist: false, count, max, reason: '该 IP 24 小时内注册次数已达上限，请稍后再试' };
    }
  } catch { /* audit table not yet created */ }

  return { allowed: true, whitelist: false, count: 0, max: policy.ip_max_per_24h };
}

// ── Audit logger ──────────────────────────────────────────────────────────────
export async function logRegistrationEvent(event: {
  event_type: string;
  phone?: string;
  bank_account?: string;
  ip_address?: string;
  brand_name?: string;
  admin_id?: number;
  data?: Record<string, unknown>;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO registration_security_audit
         (event_type, event_data, phone, bank_account, ip_address, brand_name, admin_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        event.event_type,
        event.data ? JSON.stringify(event.data) : null,
        event.phone    ?? null,
        event.bank_account ?? null,
        event.ip_address   ?? null,
        event.brand_name   ?? null,
        event.admin_id     ?? null,
      ]
    );
  } catch (e) {
    console.error('[RegistrationPolicyService] audit log failed:', e);
  }
}
