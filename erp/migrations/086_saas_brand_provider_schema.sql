-- ═════════════════════════════════════════════════════════════════════════════
-- Migration 086: SaaS Multi-Brand Gaming Platform — Brand Layer Schema
--
-- Introduces the brands table and brand_provider_* tables to support a
-- multi-brand SaaS architecture where each Brand has its own independent
-- provider credentials, configuration, and operational isolation.
--
-- Design principles:
--   • Provider-agnostic  — no provider-specific columns; key-value storage
--     accommodates any future provider without schema changes.
--   • Additive only      — zero modifications to existing business tables.
--                          Only brand_settings gains a nullable brand_id FK.
--   • Backward compatible — gp_credentials, gp_config, and the 918KISS
--     adapter remain completely untouched.
--   • Brand isolation    — every credential and config row is scoped to a
--     (brand, provider) pair; cross-brand access is impossible via FK.
--
-- New tables (in dependency order):
--   brands                       — tenant identity registry
--   brand_providers              — brand × provider junction
--   brand_provider_credentials   — per-brand credential key-value store
--   brand_provider_config        — per-brand configuration key-value store
--
-- Modified tables:
--   brand_settings               — ADD COLUMN brand_id (nullable FK → brands)
--
-- Idempotent: all CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- ═════════════════════════════════════════════════════════════════════════════


-- ─── 1. Brand Registry ────────────────────────────────────────────────────────
-- Each row represents one customer (Brand / tenant) on the SaaS platform.
-- Kept intentionally minimal — profile and website details live in
-- brand_settings; provider credentials live in brand_provider_credentials.

CREATE TABLE IF NOT EXISTS brands (
  id          SERIAL       PRIMARY KEY,
  code        VARCHAR(30)  NOT NULL UNIQUE,
              -- Short uppercase internal identifier. Examples: TESLA88, OPULUX, KING777
  name        VARCHAR(100) NOT NULL,
              -- Human-readable display name. Example: "Tesla88 / SSWIN88"
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brands_code
  ON brands (code);

CREATE INDEX IF NOT EXISTS idx_brands_active
  ON brands (is_active)
  WHERE is_active = TRUE;


-- ─── 2. Link brand_settings → brands ─────────────────────────────────────────
-- brand_settings holds website / profile configuration (logo, SEO, social links).
-- The brand_id FK anchors it to the tenant identity row in brands.
-- Nullable during migration: the seed INSERT below populates existing rows.

ALTER TABLE brand_settings
  ADD COLUMN IF NOT EXISTS brand_id INTEGER
    REFERENCES brands(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_brand_settings_brand
  ON brand_settings (brand_id);


-- ─── 3. Brand Provider Junction ──────────────────────────────────────────────
-- Associates a Brand with one of the supported Providers and holds the
-- per-brand runtime parameters (status, wallet type, currency, health …).
--
-- One row per (brand, provider) pair.
-- Credentials and config keys live in the two child tables below.

CREATE TABLE IF NOT EXISTS brand_providers (
  id              SERIAL      PRIMARY KEY,
  brand_id        INTEGER     NOT NULL REFERENCES brands(id)        ON DELETE CASCADE,
  provider_id     INTEGER     NOT NULL REFERENCES gp_providers(id)  ON DELETE RESTRICT,
                  -- RESTRICT: a provider referenced by brand configs cannot be deleted.

  -- ── Operational parameters (per-brand overrides) ──────────────────────────
  status          VARCHAR(20) NOT NULL DEFAULT 'DISABLED',
                  -- ACTIVE | DISABLED | MAINTENANCE | TESTING
  wallet_type     VARCHAR(20) NOT NULL DEFAULT 'SEAMLESS',
                  -- SEAMLESS | TRANSFER
  environment     VARCHAR(20) NOT NULL DEFAULT 'PRODUCTION',
                  -- PRODUCTION | SANDBOX
  currency        CHAR(3)     NOT NULL DEFAULT 'MYR',
                  -- ISO 4217. Defaults to MYR; override per brand-provider pair.

  -- ── Health tracking (per brand-provider) ─────────────────────────────────
  health_status   VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
                  -- HEALTHY | DEGRADED | DOWN | UNKNOWN
  health_checked_at TIMESTAMPTZ,
  last_success_at   TIMESTAMPTZ,
  last_failed_at    TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_brand_provider UNIQUE (brand_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_brand_providers_brand
  ON brand_providers (brand_id);

CREATE INDEX IF NOT EXISTS idx_brand_providers_provider
  ON brand_providers (provider_id);

CREATE INDEX IF NOT EXISTS idx_brand_providers_active
  ON brand_providers (brand_id, status)
  WHERE status = 'ACTIVE';


-- ─── 4. Brand Provider Credentials ───────────────────────────────────────────
-- Per-brand, per-provider credential key-value store.
-- Mirrors the structure of gp_credentials but scoped to a (brand, provider) pair.
--
-- Well-known keys (see CREDENTIAL_KEY constants in config.types.ts):
--   operator_token    — inbound callback authentication token
--   api_token         — outbound API bearer token
--   api_account_token — account-level API token (MegaH5 and similar)
--   secret_key        — signature / HMAC secret
--   md5_key           — MD5 signing key (918KISS-style providers)
--   encrypt_key       — DES / AES encryption key for login tokens
--   delimiter         — signature string delimiter
--   postfix_id        — account ID suffix appended to player IDs
--   hmac_secret       — HMAC-SHA256 secret (Evolution and similar)
--   rsa_private_key   — RSA private key PEM (asymmetric providers)
--
-- Provider-specific keys can be added without any schema change.
-- is_encrypted follows the same convention as gp_credentials.is_encrypted.

CREATE TABLE IF NOT EXISTS brand_provider_credentials (
  id                  SERIAL       PRIMARY KEY,
  brand_provider_id   INTEGER      NOT NULL
    REFERENCES brand_providers(id) ON DELETE CASCADE,
  key                 VARCHAR(100) NOT NULL,
  value               TEXT         NOT NULL,
  is_encrypted        BOOLEAN      NOT NULL DEFAULT TRUE,
  updated_by          INTEGER      REFERENCES admins(id) ON DELETE SET NULL,
  updated_by_name     VARCHAR(100),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_brand_provider_credential UNIQUE (brand_provider_id, key)
);

CREATE INDEX IF NOT EXISTS idx_bpc_brand_provider
  ON brand_provider_credentials (brand_provider_id);


-- ─── 5. Brand Provider Configuration ─────────────────────────────────────────
-- Per-brand, per-provider non-secret configuration key-value store.
-- Overrides provider-level defaults (gp_config) for this specific brand.
--
-- Well-known keys (see CONFIG_KEY constants in config.types.ts):
--   api_base_url      — override the provider's default API base URL
--   lobby_url         — brand-specific lobby launch URL
--   game_domain       — H5 game launch domain override
--   datafeed_url      — data feed / reconciliation API URL
--   callback_url      — callback base URL registered with the provider
--   timeout_ms        — HTTP request timeout override
--   retry_count       — retry attempts override
--   currency          — default currency (if different from brand_providers.currency)
--   whitelist_ips     — comma-separated IP whitelist for callback validation
--   maintenance       — "true" / "false" maintenance window flag
--
-- Provider-specific keys can be added without any schema change.

CREATE TABLE IF NOT EXISTS brand_provider_config (
  id                  SERIAL       PRIMARY KEY,
  brand_provider_id   INTEGER      NOT NULL
    REFERENCES brand_providers(id) ON DELETE CASCADE,
  key                 VARCHAR(100) NOT NULL,
  value               TEXT         NOT NULL,
  updated_by          INTEGER      REFERENCES admins(id) ON DELETE SET NULL,
  updated_by_name     VARCHAR(100),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_brand_provider_config UNIQUE (brand_provider_id, key)
);

CREATE INDEX IF NOT EXISTS idx_bpconf_brand_provider
  ON brand_provider_config (brand_provider_id);


-- ─── 6. Seed Data: Default Brand (TESLA88) ───────────────────────────────────
-- Creates the first Brand row for the existing single-tenant deployment.
-- Links the pre-existing brand_settings row (id = 1) to this brand.
--
-- The existing 918KISS credentials in gp_credentials and gp_config are NOT
-- migrated here — that migration will occur in a later task once the runtime
-- layer has been updated and validated.

INSERT INTO brands (code, name, is_active)
VALUES ('TESLA88', 'Tesla88 / SSWIN88', TRUE)
ON CONFLICT (code) DO NOTHING;

-- Attach the existing brand_settings row to the new brand
UPDATE brand_settings
SET brand_id = (SELECT id FROM brands WHERE code = 'TESLA88')
WHERE id = 1
  AND brand_id IS NULL;
