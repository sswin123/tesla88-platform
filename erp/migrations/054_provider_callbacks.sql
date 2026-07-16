-- Migration 054: Provider Callback Logging
-- Unified callback log for all game provider integrations.
-- All providers share one endpoint; each call is recorded here for audit/debug.

CREATE TABLE IF NOT EXISTS provider_callback_logs (
  id              BIGSERIAL    PRIMARY KEY,
  provider        VARCHAR(50)  NOT NULL DEFAULT 'UNKNOWN',
  action          VARCHAR(100),
  request_method  VARCHAR(10)  NOT NULL DEFAULT 'POST',
  headers         JSONB,
  query           JSONB,
  raw_body        TEXT,
  json_body       JSONB,
  ip              VARCHAR(45),
  user_agent      TEXT,
  signature       TEXT,
  verify_result   BOOLEAN,
  response        JSONB,
  status          INTEGER,
  processing_time INTEGER,
  error_message   TEXT,
  stack_trace     TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_callback_logs_provider    ON provider_callback_logs (provider);
CREATE INDEX IF NOT EXISTS idx_provider_callback_logs_created_at  ON provider_callback_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_callback_logs_verify      ON provider_callback_logs (verify_result) WHERE verify_result = false;
