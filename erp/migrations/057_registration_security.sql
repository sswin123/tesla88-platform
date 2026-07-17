-- Migration 057: Registration Security Center
-- Unified registration policy system across Website, ERP, Bot, and API

-- ── Core policy config ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS registration_security_config (
  key         TEXT PRIMARY KEY,
  value       TEXT        NOT NULL DEFAULT '',
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO registration_security_config (key, value, description) VALUES
  ('security_enabled',          'true',     'Master switch — disable to bypass ALL security checks'),
  ('registration_mode',         'STANDARD', 'STRICT | STANDARD | RELAXED | CUSTOM'),
  ('phone_check_enabled',       'true',     'Block duplicate phone numbers'),
  ('phone_policy',              'UNIQUE',   'UNIQUE | ALLOW_2 | ALLOW_3 | UNLIMITED'),
  ('phone_max_accounts',        '1',        'Max web accounts per phone (0 = unlimited)'),
  ('bank_check_enabled',        'true',     'Block duplicate bank accounts'),
  ('bank_policy',               'UNIQUE',   'UNIQUE | ALLOW_2 | ALLOW_3 | ALLOW_5 | UNLIMITED'),
  ('bank_max_members',          '1',        'Max members per bank account (0 = unlimited)'),
  ('telegram_check_enabled',    'false',    'Block duplicate Telegram User ID'),
  ('email_check_enabled',       'false',    'Block duplicate email address'),
  ('device_protection_enabled', 'false',    'Rate-limit new registrations per device / IP'),
  ('device_max_per_24h',        '3',        'Max registrations per device fingerprint per 24 h'),
  ('ip_protection_enabled',     'false',    'Rate-limit new registrations per IP address'),
  ('ip_max_per_24h',            '10',       'Max registrations per IP address per 24 h')
ON CONFLICT (key) DO NOTHING;

-- ── Phone whitelist ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS registration_whitelist_phones (
  id         SERIAL      PRIMARY KEY,
  phone      VARCHAR(20) UNIQUE NOT NULL,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Bank account whitelist ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS registration_whitelist_banks (
  id             SERIAL       PRIMARY KEY,
  bank_name      VARCHAR(100) NOT NULL,
  account_number VARCHAR(50)  NOT NULL,
  note           TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(bank_name, account_number)
);

-- ── Per-brand policy override ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brand_registration_override (
  id                  SERIAL      PRIMARY KEY,
  brand_name          VARCHAR(50) UNIQUE NOT NULL,
  phone_check_enabled BOOLEAN,        -- NULL = inherit global
  phone_max_accounts  INTEGER,        -- NULL = inherit global
  bank_check_enabled  BOOLEAN,
  bank_max_members    INTEGER,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Security audit log ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS registration_security_audit (
  id           BIGSERIAL    PRIMARY KEY,
  event_type   VARCHAR(50)  NOT NULL,
  event_data   JSONB,
  phone        VARCHAR(20),
  bank_account VARCHAR(50),
  ip_address   VARCHAR(50),
  brand_name   VARCHAR(50),
  admin_id     INTEGER,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reg_sec_audit_created ON registration_security_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reg_sec_audit_type    ON registration_security_audit(event_type);
CREATE INDEX IF NOT EXISTS idx_reg_sec_audit_phone   ON registration_security_audit(phone) WHERE phone IS NOT NULL;

-- ── Normalize existing bank accounts (safe: check duplicates first) ──────────
DO $$
DECLARE
  dup_count INTEGER;
  upd_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT REGEXP_REPLACE(bank_account, '[\s\-\.]', '', 'g') AS n
    FROM users WHERE bank_account IS NOT NULL
    GROUP BY REGEXP_REPLACE(bank_account, '[\s\-\.]', '', 'g')
    HAVING COUNT(*) > 1
  ) t;

  IF dup_count > 0 THEN
    RAISE NOTICE '[057] % bank account group(s) would conflict after normalization — normalization skipped. Review at /registration-security.', dup_count;
  ELSE
    UPDATE users
    SET bank_account = REGEXP_REPLACE(bank_account, '[\s\-\.]', '', 'g')
    WHERE bank_account IS NOT NULL AND bank_account ~ '[\s\-\.]';
    GET DIAGNOSTICS upd_count = ROW_COUNT;
    RAISE NOTICE '[057] Normalized % bank account(s).', upd_count;
  END IF;
END $$;

-- ── Report duplicate phones ──────────────────────────────────────────────────
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT phone FROM users WHERE phone IS NOT NULL
    GROUP BY phone HAVING COUNT(*) > 1
  ) t;
  IF dup_count > 0 THEN
    RAISE NOTICE '[057] % duplicate phone group(s) detected. Review at /registration-security (Duplicate Report tab).', dup_count;
  END IF;
END $$;
