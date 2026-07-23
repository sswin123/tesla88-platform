-- Migration 080: Initialize 918KISS staging credentials and ensure provider is launch-ready.
--
-- Credentials are stored as plaintext (is_encrypted=FALSE) for staging.
-- AES_ENCRYPTION_KEY is not required for plaintext credentials at launch time.
-- Safe to re-run: all inserts use ON CONFLICT DO UPDATE.
--
-- Brand:    Opulux  |  Currency: MYR  |  Wallet: Seamless
-- Postfix:  stopulux  →  account_id format: u{userId}@stopulux

DO $$
DECLARE
  pid INT;
BEGIN
  SELECT id INTO pid FROM gp_providers WHERE code = '918KISS' LIMIT 1;

  IF pid IS NULL THEN
    RAISE NOTICE 'Migration 080: gp_providers has no 918KISS row — skipping.';
    RETURN;
  END IF;

  -- ── Ensure provider is in a launchable state ─────────────────────────────
  UPDATE gp_providers
  SET
    status              = CASE WHEN status = 'DISABLED' THEN 'TESTING' ELSE status END,
    website_visible     = TRUE,
    website_launch_mode = 'LOBBY',
    website_display_mode = 'PROVIDER_CARD',
    website_category    = 'slot',
    updated_at          = NOW()
  WHERE id = pid
    AND status NOT IN ('ACTIVE', 'TESTING');

  -- ── Config: postfix + currency (DO NOTHING if already set correctly) ──────
  INSERT INTO gp_config (provider_id, key, value, updated_by, updated_by_name)
  VALUES
    (pid, 'postfix_id', 'stopulux', 1, 'migration-080'),
    (pid, 'currency',   'MYR',      1, 'migration-080')
  ON CONFLICT (provider_id, key) DO UPDATE
    SET value            = EXCLUDED.value,
        updated_by_name  = EXCLUDED.updated_by_name,
        updated_at       = NOW();

  -- ── Credentials: plaintext staging values ────────────────────────────────
  INSERT INTO gp_credentials (provider_id, key, value, is_encrypted, updated_by, updated_by_name)
  VALUES
    (pid, 'secret_key',
          'HlyEtYTb',
          FALSE, 1, 'migration-080'),
    (pid, 'md5_key',
          'gGWVbrSL',
          FALSE, 1, 'migration-080'),
    (pid, 'encrypt_key',
          'rfuDsfdu',
          FALSE, 1, 'migration-080'),
    (pid, 'delimiter',
          '',
          FALSE, 1, 'migration-080'),
    (pid, 'operator_token',
          'b26180f3c132f760355a3ad2a6b53e7a149213e895fbce7d46041a40ad5c0f9d',
          FALSE, 1, 'migration-080'),
    (pid, 'api_token',
          'NnRjWEtmSkJxd2U3cnpIUnJjM2o3TzJPMzF1Mjhua1F5akh4ZGpQVG1LcUwvUm9zMUp4Uys5RjRkMFZZUnIxeXhqRUlyWmplYkJrQTBTYnFRWktueElhTTdrWFNkcG16czlERUdtM25ESFVIZEx4UndHVUhJZG1rNjNrcFBITUxTV2ZKOWNDdERaNDV6TUZtdHRVSmdnPT0=',
          FALSE, 1, 'migration-080')
  ON CONFLICT (provider_id, key) DO UPDATE
    SET value            = EXCLUDED.value,
        is_encrypted     = EXCLUDED.is_encrypted,
        updated_by_name  = EXCLUDED.updated_by_name,
        updated_at       = NOW();

  RAISE NOTICE 'Migration 080 complete — 918KISS staging credentials set (provider_id=%).', pid;
END $$;
