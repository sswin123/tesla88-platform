-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 069: Enterprise Gaming Platform — Core Framework Tables (Phase G1)
--
-- Introduces the gp_* table family: the authoritative data layer for the
-- universal multi-provider game integration framework.
--
-- ALL new tables use the "gp_" prefix to clearly distinguish them from:
--   • website_game_providers / website_games  (CMS/display layer — unchanged)
--   • provider_settings / provider_transactions (legacy callback layer — unchanged)
--
-- Zero modifications to any existing table in this migration.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── Provider Registry ────────────────────────────────────────────────────────
-- Central registry for every game provider the platform integrates with.
-- One row per provider; the adapter class is resolved from `code` at runtime.

CREATE TABLE IF NOT EXISTS gp_providers (
  id               SERIAL        PRIMARY KEY,
  code             VARCHAR(30)   NOT NULL UNIQUE,          -- e.g. "918KISS", "JILI"
  name             VARCHAR(100)  NOT NULL,                 -- internal name
  display_name     VARCHAR(100)  NOT NULL,                 -- shown in ERP UI
  version          VARCHAR(20)   NOT NULL DEFAULT '1.0.0', -- adapter version
  priority         INTEGER       NOT NULL DEFAULT 100,     -- lower = higher priority
  status           VARCHAR(20)   NOT NULL DEFAULT 'DISABLED',
                   -- ACTIVE | DISABLED | MAINTENANCE | DEPRECATED
  environment      VARCHAR(20)   NOT NULL DEFAULT 'PRODUCTION',
                   -- PRODUCTION | SANDBOX
  wallet_type      VARCHAR(20)   NOT NULL DEFAULT 'SEAMLESS',
                   -- SEAMLESS | TRANSFER
  capabilities     JSONB         NOT NULL DEFAULT '[]',
                   -- Array<ProviderCapability> — never hardcode feature checks
  health_status    VARCHAR(20)   NOT NULL DEFAULT 'UNKNOWN',
                   -- HEALTHY | DEGRADED | DOWN | UNKNOWN
  health_checked_at   TIMESTAMPTZ,
  last_success_at     TIMESTAMPTZ,
  metadata         JSONB         NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gp_providers_status ON gp_providers (status);


-- ─── Encrypted Credential Store ───────────────────────────────────────────────
-- One row per credential key per provider.
-- Values are AES-256 encrypted before insert; `is_encrypted` marks which rows.

CREATE TABLE IF NOT EXISTS gp_credentials (
  id            SERIAL        PRIMARY KEY,
  provider_id   INTEGER       NOT NULL REFERENCES gp_providers(id) ON DELETE CASCADE,
  key           VARCHAR(100)  NOT NULL,
                -- e.g. api_token | secret_key | md5_key | encrypt_key | delimiter
  value         TEXT          NOT NULL,
  is_encrypted  BOOLEAN       NOT NULL DEFAULT TRUE,
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_gp_credential UNIQUE (provider_id, key)
);

CREATE INDEX IF NOT EXISTS idx_gp_credentials_provider ON gp_credentials (provider_id);


-- ─── Provider Configuration (non-secret key-value) ────────────────────────────
-- Runtime configuration that can be changed without code deployments.
-- Examples: api_base_url, timeout_ms, retry_count, currency, lobby_enabled

CREATE TABLE IF NOT EXISTS gp_config (
  id            SERIAL        PRIMARY KEY,
  provider_id   INTEGER       NOT NULL REFERENCES gp_providers(id) ON DELETE CASCADE,
  key           VARCHAR(100)  NOT NULL,
  value         TEXT          NOT NULL,
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_gp_config UNIQUE (provider_id, key)
);

CREATE INDEX IF NOT EXISTS idx_gp_config_provider ON gp_config (provider_id);


-- ─── Player Account Mapping ───────────────────────────────────────────────────
-- Links our internal user to the account identity on each provider.
-- One user may have multiple rows (one per provider they have played on).

CREATE TABLE IF NOT EXISTS gp_players (
  id                    SERIAL        PRIMARY KEY,
  provider_id           INTEGER       NOT NULL REFERENCES gp_providers(id),
  user_id               INTEGER       NOT NULL REFERENCES users(id),
  provider_player_id    VARCHAR(100),           -- numeric/string ID assigned by PROVIDER
  provider_account_id   VARCHAR(100)  NOT NULL, -- account string we send to PROVIDER
  currency              CHAR(3)       NOT NULL DEFAULT 'MYR',
  is_registered         BOOLEAN       NOT NULL DEFAULT FALSE,
  registered_at         TIMESTAMPTZ,
  metadata              JSONB         NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_gp_player UNIQUE (provider_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_gp_players_user     ON gp_players (user_id);
CREATE INDEX IF NOT EXISTS idx_gp_players_provider ON gp_players (provider_id, user_id);


-- ─── Game Catalog ─────────────────────────────────────────────────────────────
-- Games synced from providers via the GameSyncService.
-- ERP can override is_hot, is_new, is_active, sort_order per game.

CREATE TABLE IF NOT EXISTS gp_games (
  id              SERIAL        PRIMARY KEY,
  provider_id     INTEGER       NOT NULL REFERENCES gp_providers(id) ON DELETE CASCADE,
  game_code       VARCHAR(100)  NOT NULL,
  name            VARCHAR(200)  NOT NULL,
  game_type       INTEGER       NOT NULL DEFAULT 1,
                  -- 1=Slot, 2=Arcade, 3=Table, 4=Fishing, 5=Live Casino, 9=Other
  sub_type        VARCHAR(50),
  icon_url        TEXT,
  banner_url      TEXT,
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  is_hot          BOOLEAN       NOT NULL DEFAULT FALSE,
  is_new          BOOLEAN       NOT NULL DEFAULT FALSE,
  is_maintenance  BOOLEAN       NOT NULL DEFAULT FALSE,
  sort_order      INTEGER       NOT NULL DEFAULT 0,
  metadata        JSONB         NOT NULL DEFAULT '{}',
  synced_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_gp_game UNIQUE (provider_id, game_code)
);

CREATE INDEX IF NOT EXISTS idx_gp_games_provider      ON gp_games (provider_id);
CREATE INDEX IF NOT EXISTS idx_gp_games_type          ON gp_games (game_type);
CREATE INDEX IF NOT EXISTS idx_gp_games_active_sort   ON gp_games (provider_id, is_active, sort_order);


-- ─── Data Feed Polling Cursors ────────────────────────────────────────────────
-- Stores the last-polled timepoint per provider per feed type.
-- The reconciliation job advances the cursor after each successful poll.

CREATE TABLE IF NOT EXISTS gp_timepoints (
  provider_id     INTEGER       NOT NULL REFERENCES gp_providers(id) ON DELETE CASCADE,
  feed_type       VARCHAR(50)   NOT NULL,
                  -- PLAY_SESSIONS | FAILED_TX | SETTLEMENTS | ACCOUNT_TX
  last_timepoint  BIGINT        NOT NULL DEFAULT 0,  -- UTC epoch milliseconds
  last_polled_at  TIMESTAMPTZ,
  PRIMARY KEY (provider_id, feed_type)
);


-- ─── Health Check History ─────────────────────────────────────────────────────
-- One row per health check run per provider. Useful for latency trending.

CREATE TABLE IF NOT EXISTS gp_health_checks (
  id              BIGSERIAL     PRIMARY KEY,
  provider_id     INTEGER       NOT NULL REFERENCES gp_providers(id) ON DELETE CASCADE,
  status          VARCHAR(20)   NOT NULL, -- HEALTHY | DEGRADED | DOWN
  latency_ms      INTEGER,
  error_message   TEXT,
  checked_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gp_health_provider ON gp_health_checks (provider_id, checked_at DESC);


-- ─── Retry Queue ─────────────────────────────────────────────────────────────
-- Stores any operation that failed and needs to be retried with backoff.
-- Dead-letter (DEAD status) items are kept for manual inspection.

CREATE TABLE IF NOT EXISTS gp_retry_queue (
  id               BIGSERIAL     PRIMARY KEY,
  provider         VARCHAR(30)   NOT NULL,
  action           VARCHAR(50)   NOT NULL,
                   -- WALLET_BET_RESULT | WALLET_REFUND | WALLET_JACKPOT | etc.
  payload          JSONB         NOT NULL,
  attempt_count    INTEGER       NOT NULL DEFAULT 0,
  max_attempts     INTEGER       NOT NULL DEFAULT 5,
  next_attempt_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  last_error       TEXT,
  status           VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
                   -- PENDING | PROCESSING | SUCCESS | DEAD
  dead_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gp_retry_pending  ON gp_retry_queue (next_attempt_at, status) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_gp_retry_provider ON gp_retry_queue (provider, status);


-- ─── Promotion Hook Registry ──────────────────────────────────────────────────
-- Extension points for future promotion integrations.
-- Hooks are registered here; the PromotionHookManager resolves them at runtime.

CREATE TABLE IF NOT EXISTS gp_promotion_hooks (
  id            SERIAL        PRIMARY KEY,
  hook_type     VARCHAR(50)   NOT NULL,
                -- FREE_SPIN | TOURNAMENT | LUCKY_WHEEL | CASHBACK | VIP | DAILY_MISSION
  provider_id   INTEGER       REFERENCES gp_providers(id) ON DELETE CASCADE,
                -- NULL = applies to all providers
  config        JSONB         NOT NULL DEFAULT '{}',
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gp_promo_hooks_type ON gp_promotion_hooks (hook_type, is_active);
