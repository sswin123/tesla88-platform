-- ═════════════════════════════════════════════════════════════════════════════
-- Seed: 918KISS Staging Configuration
--
-- Registers 918KISS (code='918KISS') in the Enterprise Gaming Platform tables
-- for Staging / Sandbox environment testing.
--
-- IMPORTANT:
--   - All credential values are PLACEHOLDERS and must be replaced with real
--     values obtained from 918KISS before executing in any live environment.
--   - Credentials must be AES-256-GCM encrypted by SecurityService.encrypt()
--     before insertion (run via ERP admin UI or the encrypt-credential.ts util).
--   - This seed is idempotent (ON CONFLICT DO NOTHING / DO UPDATE).
--   - Safe to re-run: will not overwrite credentials already set.
--
-- How to apply:
--   docker compose exec db psql -U postgres -d member_bot \
--     -f /migrations/seeds/seed_918kiss_staging.sql
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. Register provider ──────────────────────────────────────────────────────
INSERT INTO gp_providers (
  code,
  name,
  display_name,
  version,
  priority,
  status,
  environment,
  wallet_type,
  capabilities,
  health_status,
  metadata
) VALUES (
  '918KISS',
  '918Kiss',
  '918KISS',
  '1.11',
  10,
  'DISABLED',         -- Enable via ERP Gaming Platform Settings after connectivity test
  'SANDBOX',
  'SEAMLESS',
  '["SEAMLESS_WALLET","JACKPOT","GAME_SYNC","LOBBY","HISTORY",
    "TIME_POINT","FAILED_TRANSACTION","LOGOUT","FUND_FLOAT",
    "CHECK_ORDER","NICKNAME_UPDATE"]'::jsonb,
  'UNKNOWN',
  '{"api_version":"v1.11","integration_model":"seamless","phase":"G4_STAGING"}'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  status      = EXCLUDED.status,
  environment = EXCLUDED.environment,
  version     = EXCLUDED.version,
  updated_at  = NOW();


-- ── 2. Credentials (PLACEHOLDERS — must be encrypted before production use) ──
-- Run SecurityService.encrypt(plaintext) via the ERP admin UI to get
-- the correct AES-256-GCM base64-encoded values, then update these rows.
--
-- For staging, you may insert plaintext with is_encrypted=FALSE for testing,
-- but NEVER do this in production.

DO $$
DECLARE v_provider_id INTEGER;
BEGIN
  SELECT id INTO v_provider_id FROM gp_providers WHERE code = '918KISS';

  -- api_token: used by us in outbound calls to 918KISS Operations API
  INSERT INTO gp_credentials (provider_id, key, value, is_encrypted) VALUES
    (v_provider_id, 'api_token',      'REPLACE_WITH_918KISS_API_TOKEN',      FALSE)
  ON CONFLICT (provider_id, key) DO NOTHING;

  -- operator_token: sent by 918KISS in every inbound callback (validated by checkToken).
  -- Set via ERP Gaming Platform Settings or migration 074.
  INSERT INTO gp_credentials (provider_id, key, value, is_encrypted) VALUES
    (v_provider_id, 'operator_token', 'REPLACE_WITH_OPERATOR_TOKEN', FALSE)
  ON CONFLICT (provider_id, key) DO NOTHING;

  -- md5_key: used in H5 Login signature generation
  INSERT INTO gp_credentials (provider_id, key, value, is_encrypted) VALUES
    (v_provider_id, 'md5_key',        'REPLACE_WITH_918KISS_MD5_KEY',        FALSE)
  ON CONFLICT (provider_id, key) DO NOTHING;

  -- secret_key: used in H5 Login signature generation
  INSERT INTO gp_credentials (provider_id, key, value, is_encrypted) VALUES
    (v_provider_id, 'secret_key',     'REPLACE_WITH_918KISS_SECRET_KEY',     FALSE)
  ON CONFLICT (provider_id, key) DO NOTHING;

  -- encrypt_key: 8-byte DES-ECB key for H5 Login QS encryption
  INSERT INTO gp_credentials (provider_id, key, value, is_encrypted) VALUES
    (v_provider_id, 'encrypt_key',    'REPLACE_WITH_918KISS_ENCRYPT_KEY',    FALSE)
  ON CONFLICT (provider_id, key) DO NOTHING;

  -- delimiter: appended before MD5 hash in sign string (provider-assigned)
  INSERT INTO gp_credentials (provider_id, key, value, is_encrypted) VALUES
    (v_provider_id, 'delimiter',      'REPLACE_WITH_918KISS_DELIMITER',      FALSE)
  ON CONFLICT (provider_id, key) DO NOTHING;
END $$;


-- ── 3. Configuration (non-secret, staging URLs) ───────────────────────────────
DO $$
DECLARE v_provider_id INTEGER;
BEGIN
  SELECT id INTO v_provider_id FROM gp_providers WHERE code = '918KISS';

  -- Staging / Sandbox API base URL (918KISS will provide this)
  INSERT INTO gp_config (provider_id, key, value) VALUES
    (v_provider_id, 'api_base_url',       'https://staging-api.918kiss.com')
  ON CONFLICT (provider_id, key) DO NOTHING;

  -- H5 API domain (for /api/Acc/Login and /api/Game/GameList)
  INSERT INTO gp_config (provider_id, key, value) VALUES
    (v_provider_id, 'h5_api_domain',      'https://staging-h5.918kiss.com')
  ON CONFLICT (provider_id, key) DO NOTHING;

  -- H5 Lobby launch domain
  INSERT INTO gp_config (provider_id, key, value) VALUES
    (v_provider_id, 'h5_lobby_domain',    'https://staging-lobby.918kiss.com')
  ON CONFLICT (provider_id, key) DO NOTHING;

  -- H5 Game launch domain
  INSERT INTO gp_config (provider_id, key, value) VALUES
    (v_provider_id, 'h5_game_domain',     'https://staging-game.918kiss.com')
  ON CONFLICT (provider_id, key) DO NOTHING;

  -- PostfixID appended to player accountIDs (e.g. "opulux")
  -- Account format: u{userId}@{postfix_id}
  INSERT INTO gp_config (provider_id, key, value) VALUES
    (v_provider_id, 'postfix_id',         'opuluxstg')
  ON CONFLICT (provider_id, key) DO NOTHING;

  -- Default currency
  INSERT INTO gp_config (provider_id, key, value) VALUES
    (v_provider_id, 'currency',           'MYR')
  ON CONFLICT (provider_id, key) DO NOTHING;

  -- HTTP request timeout (ms)
  INSERT INTO gp_config (provider_id, key, value) VALUES
    (v_provider_id, 'timeout_ms',         '10000')
  ON CONFLICT (provider_id, key) DO NOTHING;

  -- Circuit breaker failure threshold before OPEN
  INSERT INTO gp_config (provider_id, key, value) VALUES
    (v_provider_id, 'circuit_threshold',  '5')
  ON CONFLICT (provider_id, key) DO NOTHING;

  -- Circuit breaker cooldown (ms)
  INSERT INTO gp_config (provider_id, key, value) VALUES
    (v_provider_id, 'circuit_cooldown_ms','30000')
  ON CONFLICT (provider_id, key) DO NOTHING;

  -- Verbose logging — enabled for staging
  INSERT INTO gp_config (provider_id, key, value) VALUES
    (v_provider_id, 'debug',              'true')
  ON CONFLICT (provider_id, key) DO NOTHING;

  -- Default lobby return URL (embedded in H5 Login token)
  INSERT INTO gp_config (provider_id, key, value) VALUES
    (v_provider_id, 'default_lobby_url',  'https://staging.apidemo.club/games')
  ON CONFLICT (provider_id, key) DO NOTHING;
END $$;


-- ── 4. Timepoint cursors (start from epoch 0) ────────────────────────────────
DO $$
DECLARE v_provider_id INTEGER;
BEGIN
  SELECT id INTO v_provider_id FROM gp_providers WHERE code = '918KISS';

  INSERT INTO gp_timepoints (provider_id, feed_type, last_timepoint) VALUES
    (v_provider_id, 'PLAY_SESSIONS',      0),
    (v_provider_id, 'FAILED_TX',          0)
  ON CONFLICT (provider_id, feed_type) DO NOTHING;
END $$;


-- ── Verification ─────────────────────────────────────────────────────────────
-- Run after applying this seed to confirm setup:
--
--   SELECT id, code, status, environment, health_status
--     FROM gp_providers WHERE code = '918KISS';
--
--   SELECT key, is_encrypted FROM gp_credentials
--     WHERE provider_id = (SELECT id FROM gp_providers WHERE code = '918KISS');
--
--   SELECT key, value FROM gp_config
--     WHERE provider_id = (SELECT id FROM gp_providers WHERE code = '918KISS')
--     ORDER BY key;
