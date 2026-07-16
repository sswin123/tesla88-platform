-- Migration 055: Provider Callback Framework Phase 2 — Production Hardening
-- Adds: provider_settings, idempotency guard, business audit log,
--        retry tracking on existing callback_logs.

-- ── Provider API settings (ERP-managed, replaces hard-coded secrets) ──────────
CREATE TABLE IF NOT EXISTS provider_settings (
  id               SERIAL       PRIMARY KEY,
  provider         VARCHAR(50)  NOT NULL,
  display_name     VARCHAR(100) NOT NULL DEFAULT '',
  enabled          BOOLEAN      NOT NULL DEFAULT false,
  agent_id         VARCHAR(255),
  secret_key       TEXT,
  callback_secret  TEXT,
  signature_type   VARCHAR(20)  NOT NULL DEFAULT 'MD5',   -- MD5 SHA256 HMAC256 RSA NONE
  signature_version VARCHAR(10) NOT NULL DEFAULT 'v1',
  wallet_type      VARCHAR(20)  NOT NULL DEFAULT 'SEAMLESS',
  currency         VARCHAR(10)  NOT NULL DEFAULT 'MYR',
  api_url          VARCHAR(500),
  whitelist_ips    TEXT,        -- comma-separated, empty = allow all
  response_format  VARCHAR(20)  NOT NULL DEFAULT 'JSON_SUCCESS',
                                -- JSON_SUCCESS | JILI | PG | EVOLUTION | PLAYTECH | CQ9
  notes            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_provider_settings_provider UNIQUE (provider)
);

-- Seed known providers (disabled by default)
INSERT INTO provider_settings (provider, display_name, signature_type, response_format) VALUES
  ('JILI',      'JILI Games',         'MD5',      'JILI'),
  ('PG',        'PG Soft',            'NONE',     'PG'),
  ('PRAGMATIC', 'Pragmatic Play',     'MD5',      'JSON_SUCCESS'),
  ('EVOLUTION', 'Evolution Gaming',   'HMAC256',  'EVOLUTION'),
  ('PLAYTECH',  'PlayTech',           'MD5',      'PLAYTECH'),
  ('CQ9',       'CQ9 Gaming',         'MD5',      'CQ9'),
  ('JOKER',     'Joker Gaming',       'MD5',      'JSON_SUCCESS'),
  ('LIVE22',    'Live22',             'MD5',      'JSON_SUCCESS'),
  ('ACE333',    'ACE333',             'NONE',     'JSON_SUCCESS'),
  ('MEGA888',   'Mega888',            'NONE',     'JSON_SUCCESS'),
  ('KISS918',   '918KISS',            'NONE',     'JSON_SUCCESS'),
  ('NEWTOWN',   'Newtown Casino',     'MD5',      'JSON_SUCCESS'),
  ('PUSSY888',  'Pussy888',           'NONE',     'JSON_SUCCESS')
ON CONFLICT (provider) DO NOTHING;

-- ── Idempotency: prevent duplicate callback processing ─────────────────────────
CREATE TABLE IF NOT EXISTS provider_callback_idempotency (
  id              BIGSERIAL    PRIMARY KEY,
  provider        VARCHAR(50)  NOT NULL,
  idempotency_key VARCHAR(255) NOT NULL,
  callback_log_id BIGINT,      -- FK to provider_callback_logs.id (nullable — log is written after)
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_idempotency UNIQUE (provider, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_idempotency_lookup ON provider_callback_idempotency (provider, idempotency_key);

-- ── Business event audit log ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_business_logs (
  id              BIGSERIAL    PRIMARY KEY,
  provider        VARCHAR(50)  NOT NULL,
  event_type      VARCHAR(50)  NOT NULL, -- BALANCE_QUERY DEBIT CREDIT ROLLBACK SETTLEMENT
  user_public_id  VARCHAR(30),
  amount          NUMERIC(15,2),
  currency        VARCHAR(10),
  transaction_id  VARCHAR(255),
  reference_id    VARCHAR(255),
  result          VARCHAR(20),            -- SUCCESS FAILED DUPLICATE UNKNOWN
  metadata        JSONB,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_business_logs_provider ON provider_business_logs (provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_logs_tx       ON provider_business_logs (transaction_id);

-- ── Add retry tracking to existing callback logs ───────────────────────────────
ALTER TABLE provider_callback_logs
  ADD COLUMN IF NOT EXISTS idempotent    BOOLEAN  DEFAULT false,
  ADD COLUMN IF NOT EXISTS retry_needed  BOOLEAN  DEFAULT false,
  ADD COLUMN IF NOT EXISTS retry_count   INTEGER  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retry_at      TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_callback_retry ON provider_callback_logs (retry_needed) WHERE retry_needed = true;
