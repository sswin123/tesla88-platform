-- 088_provider_accounts.sql
-- Transfer Wallet provider accounts table.
-- Stores the provider-side credentials (loginId + password) for each user
-- on Transfer Wallet providers (e.g. MEGAAPP). These are displayed in the
-- website dialog so the player can log into the native app.

CREATE TABLE IF NOT EXISTS provider_accounts (
  id                BIGSERIAL     PRIMARY KEY,
  provider_code     VARCHAR(32)   NOT NULL,             -- e.g. 'MEGAAPP'
  user_id           INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_login_id VARCHAR(128)  NOT NULL,             -- MEGA-assigned loginId
  provider_password VARCHAR(64)   NOT NULL,             -- plain password shown to player
  provider_user_id  BIGINT,                             -- MEGA internal userId
  extra             JSONB         NOT NULL DEFAULT '{}',-- additional provider metadata
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_provider_accounts_code_user
  ON provider_accounts (provider_code, user_id);

CREATE INDEX IF NOT EXISTS idx_provider_accounts_login_id
  ON provider_accounts (provider_code, provider_login_id);

COMMENT ON TABLE provider_accounts IS
  'Provider-side credentials for Transfer Wallet providers. One row per (provider, user).';
