-- Migration 056: Provider Integration Foundation
-- Adds environment/sandbox support, game session tracking, unified transaction log.

-- ── Environment config on existing provider_settings ──────────────────────────
ALTER TABLE provider_settings
  ADD COLUMN IF NOT EXISTS environment       VARCHAR(20) NOT NULL DEFAULT 'PRODUCTION',
                                              --  PRODUCTION | SANDBOX | MOCK
  ADD COLUMN IF NOT EXISTS sandbox_api_url   VARCHAR(500),
  ADD COLUMN IF NOT EXISTS sandbox_agent_id  VARCHAR(255),
  ADD COLUMN IF NOT EXISTS sandbox_secret    TEXT,
  ADD COLUMN IF NOT EXISTS mock_enabled      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS doc_url           VARCHAR(500),
  ADD COLUMN IF NOT EXISTS doc_notes         TEXT;

-- ── Game sessions ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_sessions (
  id             BIGSERIAL    PRIMARY KEY,
  session_token  VARCHAR(255) NOT NULL,
  provider       VARCHAR(50)  NOT NULL,
  user_id        INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  user_public_id VARCHAR(30),
  game_id        VARCHAR(100),
  game_code      VARCHAR(100),
  environment    VARCHAR(20)  NOT NULL DEFAULT 'PRODUCTION',
  status         VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
                              -- ACTIVE | ENDED | EXPIRED | ERROR
  launched_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_activity  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ,
  launch_url     TEXT,
  metadata       JSONB,
  CONSTRAINT uq_game_session_token UNIQUE (session_token)
);
CREATE INDEX IF NOT EXISTS idx_game_sessions_token    ON game_sessions (session_token);
CREATE INDEX IF NOT EXISTS idx_game_sessions_user     ON game_sessions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_game_sessions_provider ON game_sessions (provider, status);
CREATE INDEX IF NOT EXISTS idx_game_sessions_active   ON game_sessions (expires_at) WHERE status = 'ACTIVE';

-- ── Provider transactions (unified across all providers) ───────────────────────
CREATE TABLE IF NOT EXISTS provider_transactions (
  id              BIGSERIAL    PRIMARY KEY,
  provider        VARCHAR(50)  NOT NULL,
  transaction_id  VARCHAR(255) NOT NULL,
  reference_id    VARCHAR(255),
  type            VARCHAR(30)  NOT NULL,
                  -- BALANCE_QUERY | DEBIT | CREDIT | FREEZE | UNFREEZE | ROLLBACK | SETTLEMENT
  status          VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
                  -- PENDING | SUCCESS | FAILED | ROLLED_BACK | DUPLICATE
  user_id         INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  user_public_id  VARCHAR(30),
  amount          NUMERIC(15,4),
  currency        VARCHAR(10)  NOT NULL DEFAULT 'MYR',
  before_balance  NUMERIC(15,4),
  after_balance   NUMERIC(15,4),
  game_id         VARCHAR(100),
  round_id        VARCHAR(100),
  session_id      BIGINT       REFERENCES game_sessions(id) ON DELETE SET NULL,
  environment     VARCHAR(20)  NOT NULL DEFAULT 'PRODUCTION',
  metadata        JSONB,
  error_message   TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_provider_tx UNIQUE (provider, transaction_id)
);
CREATE INDEX IF NOT EXISTS idx_provider_tx_provider ON provider_transactions (provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_tx_user     ON provider_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_tx_txid     ON provider_transactions (transaction_id);
CREATE INDEX IF NOT EXISTS idx_provider_tx_pending  ON provider_transactions (status) WHERE status IN ('PENDING','FAILED');
CREATE INDEX IF NOT EXISTS idx_provider_tx_ref      ON provider_transactions (reference_id) WHERE reference_id IS NOT NULL;
