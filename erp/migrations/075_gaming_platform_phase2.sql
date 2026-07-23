-- ═════════════════════════════════════════════════════════════════════════════
-- Migration 075: Gaming Platform Phase 2 — ERP Management Enhancement
--
-- Adds:
--   1. TESTING provider status (VARCHAR column — no enum to alter)
--   2. updated_by column on gp_config and gp_credentials (admin FK)
--   3. last_failed_at, last_reload_at tracking on gp_providers
--   4. gp_config_history — full config snapshots for version history + rollback
--   5. gp_config_audit_log — per-change audit trail (who changed what, when, from where)
--
-- Idempotent: all ADD COLUMN IF NOT EXISTS and CREATE TABLE IF NOT EXISTS
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. Provider tracking columns ────────────────────────────────────────────
ALTER TABLE gp_providers
  ADD COLUMN IF NOT EXISTS last_failed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_reload_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS adapter_loaded  BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 2. updated_by on gp_config (admin ID who last changed this key) ─────────
ALTER TABLE gp_credentials
  ADD COLUMN IF NOT EXISTS updated_by      INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_name VARCHAR(100);

ALTER TABLE gp_config
  ADD COLUMN IF NOT EXISTS updated_by      INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_name VARCHAR(100);

-- ── 3. Config version history (snapshot per change) ─────────────────────────
-- Each row is a full config snapshot for one provider at a point in time.
-- Credentials: only keys are stored (no values) — values stay in gp_credentials.
-- Rollback restores config values only; credentials must be re-entered.

CREATE TABLE IF NOT EXISTS gp_config_history (
  id             BIGSERIAL    PRIMARY KEY,
  provider_id    INTEGER      NOT NULL REFERENCES gp_providers(id) ON DELETE CASCADE,
  version_number INTEGER      NOT NULL,                 -- sequential per provider
  config_snapshot JSONB       NOT NULL DEFAULT '{}',   -- {key: value} for all gp_config rows
  cred_keys      JSONB        NOT NULL DEFAULT '[]',   -- [key, ...] credential keys only
  provider_status VARCHAR(20) NOT NULL,
  admin_id       INTEGER      REFERENCES admins(id) ON DELETE SET NULL,
  admin_username VARCHAR(100),
  change_summary TEXT,                                 -- human-readable description
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_gp_config_history UNIQUE (provider_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_gp_config_history_provider
  ON gp_config_history (provider_id, version_number DESC);

-- ── 4. Config change audit log (per-field, per-action) ──────────────────────

CREATE TABLE IF NOT EXISTS gp_config_audit_log (
  id             BIGSERIAL    PRIMARY KEY,
  provider_id    INTEGER      NOT NULL REFERENCES gp_providers(id) ON DELETE CASCADE,
  provider_code  VARCHAR(30)  NOT NULL,
  admin_id       INTEGER      REFERENCES admins(id) ON DELETE SET NULL,
  admin_username VARCHAR(100),
  action         VARCHAR(50)  NOT NULL,
                 -- UPDATE_CONFIG | UPDATE_CREDENTIAL | STATUS_CHANGE | RELOAD
                 -- EXPORT | IMPORT | ROLLBACK | CONNECTION_TEST
  field_key      VARCHAR(100),                         -- which config/credential key
  old_value_hint TEXT,                                 -- masked hint of old value
  new_value_hint TEXT,                                 -- masked hint of new value
  ip_address     VARCHAR(45),
  notes          TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gp_audit_provider
  ON gp_config_audit_log (provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gp_audit_admin
  ON gp_config_audit_log (admin_id, created_at DESC);
