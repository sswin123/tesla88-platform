-- ═════════════════════════════════════════════════════════════════════════════
-- Migration 074: 918KISS Official Staging Configuration
--
-- Applies the official Opulux 918KISS STAGING credentials:
--   Brand: Opulux | Environment: STAGING | Wallet: Seamless | Currency: MYR
--
-- STAGING ONLY — never use these credentials in production.
-- For production, update credentials via the ERP Gaming Platform Settings page.
--
-- Changes:
--   - Updates postfix_id: opuluxstg → stopulux (official, must be lowercase)
--   - Updates all API URLs to asiah5.com staging endpoints
--   - Adds datafeed_url (DataFeed is a separate service from Operations API)
--   - Adds game_icon_url for game catalog icon rendering
--   - Adds currency_ratio (1:1 MYR)
--   - Updates all credentials with official staging values (plaintext for staging)
--
-- Rollback: See the DO block below; all upserts are idempotent via
--   ON CONFLICT (provider_id, key) DO UPDATE, so reverting means running
--   a subsequent migration with the old values — no destructive changes here.
-- ═════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_pid INTEGER;
BEGIN
  SELECT id INTO v_pid FROM gp_providers WHERE code = '918KISS';
  IF v_pid IS NULL THEN
    RAISE NOTICE 'Migration 074: 918KISS provider not found — skipping.';
    RETURN;
  END IF;

  -- ── Config: API URLs ─────────────────────────────────────────────────────

  -- Operations API (CreatePlayer, TopUp, Withdraw, GameList, CheckOrder …)
  INSERT INTO gp_config (provider_id, key, value) VALUES
    (v_pid, 'api_base_url', 'http://stagingapi.asiah5.com/')
  ON CONFLICT (provider_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

  -- DataFeed API (PlaySessions, FailedTransactions) — separate service
  INSERT INTO gp_config (provider_id, key, value) VALUES
    (v_pid, 'datafeed_url', 'https://stgapidf.asiah5.com/')
  ON CONFLICT (provider_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

  -- H5 API domain (used for /api/Acc/Login H5 login and game list)
  INSERT INTO gp_config (provider_id, key, value) VALUES
    (v_pid, 'h5_api_domain', 'http://stgh5gmapi.asiah5.com/')
  ON CONFLICT (provider_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

  -- H5 Lobby launch base URL (/apiLobby endpoint)
  INSERT INTO gp_config (provider_id, key, value) VALUES
    (v_pid, 'h5_lobby_domain', 'http://stgh5lb.asiah5.com/')
  ON CONFLICT (provider_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

  -- H5 Game launch base URL (/CallGame/ endpoint)
  INSERT INTO gp_config (provider_id, key, value) VALUES
    (v_pid, 'h5_game_domain', 'http://stgh5lb.asiah5.com/')
  ON CONFLICT (provider_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

  -- Game icon CDN base URL (append {gameID}.png)
  INSERT INTO gp_config (provider_id, key, value) VALUES
    (v_pid, 'game_icon_url', 'http://stgcdn.asiah5.com:8080/v3/h5lb01/gameIcon/')
  ON CONFLICT (provider_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

  -- ── Config: Brand / Account ──────────────────────────────────────────────

  -- PostfixID: MUST be lowercase, appended to player accountIDs as u{userId}@{postfix}
  INSERT INTO gp_config (provider_id, key, value) VALUES
    (v_pid, 'postfix_id', 'stopulux')
  ON CONFLICT (provider_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

  -- Currency
  INSERT INTO gp_config (provider_id, key, value) VALUES
    (v_pid, 'currency', 'MYR')
  ON CONFLICT (provider_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

  -- Currency ratio (1:1 — 1 MYR in platform = 1 MYR in 918KISS)
  INSERT INTO gp_config (provider_id, key, value) VALUES
    (v_pid, 'currency_ratio', '1')
  ON CONFLICT (provider_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

  -- ── Credentials (staging plaintext — encrypt via ERP for production) ──────
  --
  -- Credential key mapping:
  --   api_token      ← Access Token (sent by us in outbound API calls as 'token' header)
  --   operator_token ← Operator Token (sent by 918KISS in inbound callbacks; we validate it)
  --   secret_key     ← SecretKey (used in H5 Login MD5 signature)
  --   md5_key        ← Md5EncryptKey (used in H5 Login MD5 signature)
  --   encrypt_key    ← EncryptKey 8-byte DES-ECB key for H5 Login QS encryption

  INSERT INTO gp_credentials (provider_id, key, value, is_encrypted) VALUES
    (v_pid, 'api_token',
     'NnRjWEtmSkJxd2U3cnpIUnJjM2o3TzJPMzF1Mjhua1F5akh4ZGpQVG1LcUwvUm9zMUp4Uys5RjRkMFZZ'
     'UnIxeXhqRUlyWmplYkJrQTBTYnFRWktueElhTTdrWFNkcG16czlERUdtM25ESFVIZEx4UndHVUhJZG1r'
     'NjNrcFBITUxTV2ZKOWNDdERaNDV6TUZtdHRVSmdnPT0=',
     FALSE)
  ON CONFLICT (provider_id, key) DO UPDATE SET
    value = EXCLUDED.value, is_encrypted = FALSE, updated_at = NOW();

  INSERT INTO gp_credentials (provider_id, key, value, is_encrypted) VALUES
    (v_pid, 'operator_token', 'b26180f3c132f760355a3ad2a6b53e7d46041a40ad5c0f9d', FALSE)
  ON CONFLICT (provider_id, key) DO UPDATE SET
    value = EXCLUDED.value, is_encrypted = FALSE, updated_at = NOW();

  INSERT INTO gp_credentials (provider_id, key, value, is_encrypted) VALUES
    (v_pid, 'secret_key', 'HlyEtYTb', FALSE)
  ON CONFLICT (provider_id, key) DO UPDATE SET
    value = EXCLUDED.value, is_encrypted = FALSE, updated_at = NOW();

  INSERT INTO gp_credentials (provider_id, key, value, is_encrypted) VALUES
    (v_pid, 'md5_key', 'gGWVbrSL', FALSE)
  ON CONFLICT (provider_id, key) DO UPDATE SET
    value = EXCLUDED.value, is_encrypted = FALSE, updated_at = NOW();

  INSERT INTO gp_credentials (provider_id, key, value, is_encrypted) VALUES
    (v_pid, 'encrypt_key', 'rfuDsfdu', FALSE)
  ON CONFLICT (provider_id, key) DO UPDATE SET
    value = EXCLUDED.value, is_encrypted = FALSE, updated_at = NOW();

  -- delimiter may be empty string for this integration
  INSERT INTO gp_credentials (provider_id, key, value, is_encrypted) VALUES
    (v_pid, 'delimiter', '', FALSE)
  ON CONFLICT (provider_id, key) DO NOTHING;

  RAISE NOTICE 'Migration 074: 918KISS staging config updated for provider_id=%', v_pid;
END $$;
