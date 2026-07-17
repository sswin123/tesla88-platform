-- erp/migrations/061_wallet_center.sql
-- Phase 5.4D — Enterprise Wallet Center
-- Depends on: media_library (027), admins table, users table

-- ─── wallet_transactions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id                  BIGSERIAL     PRIMARY KEY,
  user_id             INTEGER       NOT NULL REFERENCES users(id),
  type                VARCHAR(30)   NOT NULL,
  direction           CHAR(1)       NOT NULL CHECK (direction IN ('C', 'D')),
  amount              NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  balance_before      NUMERIC(15,2) NOT NULL,
  balance_after       NUMERIC(15,2) NOT NULL,
  gateway             VARCHAR(50),
  reference_number    VARCHAR(100),
  remark              TEXT          NOT NULL,
  attachment_media_id INTEGER       REFERENCES media_library(id),
  operator_admin_id   INTEGER       NOT NULL REFERENCES admins(id),
  ip_address          TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wt_user_id   ON wallet_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wt_type      ON wallet_transactions(type);
CREATE INDEX IF NOT EXISTS idx_wt_created   ON wallet_transactions(created_at DESC);

-- ─── payment_gateways ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_gateways (
  id           SERIAL       PRIMARY KEY,
  name         VARCHAR(50)  NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  is_active    BOOLEAN      NOT NULL DEFAULT FALSE,
  sort_order   INTEGER      NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Pre-seed 8 gateways (all inactive — enable via ERP Settings when needed)
INSERT INTO payment_gateways (name, display_name, sort_order) VALUES
  ('toyyibpay', 'ToyyibPay',  1),
  ('billplz',   'Billplz',    2),
  ('duitnow',   'DuitNow',    3),
  ('ipay88',    'iPay88',     4),
  ('senangpay', 'SenangPay',  5),
  ('stripe',    'Stripe',     6),
  ('hitpay',    'HitPay',     7),
  ('others',    'Others',     8)
ON CONFLICT (name) DO NOTHING;

-- ─── Wallet permissions ─────────────────────────────────────────────────────
-- SUPER_ADMIN is always bypassed by the permission engine (no rows needed)
INSERT INTO role_permissions (role, permission, granted) VALUES
  ('ADMIN',      'member.wallet.view',    TRUE),
  ('ADMIN',      'member.wallet.adjust',  TRUE),
  ('ADMIN',      'member.wallet.history', TRUE),
  ('ADMIN',      'member.wallet.audit',   TRUE),
  ('FINANCE',    'member.wallet.view',    TRUE),
  ('FINANCE',    'member.wallet.adjust',  TRUE),
  ('FINANCE',    'member.wallet.history', TRUE),
  ('FINANCE',    'member.wallet.audit',   TRUE),
  ('SUPERVISOR', 'member.wallet.view',    TRUE),
  ('SUPERVISOR', 'member.wallet.history', TRUE),
  ('SUPERVISOR', 'member.wallet.audit',   TRUE),
  ('CS',         'member.wallet.view',    TRUE),
  ('CS',         'member.wallet.history', TRUE)
ON CONFLICT (role, permission) DO NOTHING;
