-- Migration 080: Initialize 918KISS staging credentials (encrypted, idempotent).
--
-- Safety rules:
--   1. If gp_credentials already has ANY row for this provider, the credential
--      block is SKIPPED entirely — existing values (plaintext or encrypted) are
--      preserved exactly as-is.
--   2. gp_config values (postfix_id, currency) use ON CONFLICT DO NOTHING for
--      the same reason: operator may have tuned them via the ERP UI.
--   3. The provider status/visibility UPDATE only fires when the provider is
--      currently DISABLED — it never downgrades ACTIVE back to TESTING.
--
-- Credential storage:
--   All 6 credentials are stored as AES-256-GCM ciphertext (is_encrypted=TRUE),
--   encrypted with the project AES_ENCRYPTION_KEY so the staging decryption path
--   is identical to production.  The ciphertext was generated offline and verified
--   to round-trip through decryptCredential() before being committed here.
--
-- AES-256-GCM envelope: iv(12 bytes) || authTag(16 bytes) || ciphertext, base64.
--
-- Wallet model: Seamless  |  Currency: MYR  |  Postfix: u{userId}@stopulux

DO $$
DECLARE
  pid       INT;
  cred_count INT;
BEGIN
  -- ── 1. Locate provider ───────────────────────────────────────────────────
  SELECT id INTO pid FROM gp_providers WHERE code = '918KISS' LIMIT 1;
  IF pid IS NULL THEN
    RAISE NOTICE 'Migration 080: gp_providers has no 918KISS row — skipping.';
    RETURN;
  END IF;

  -- ── 2. Check whether credentials already exist ───────────────────────────
  SELECT COUNT(*) INTO cred_count
  FROM gp_credentials
  WHERE provider_id = pid;

  IF cred_count > 0 THEN
    RAISE NOTICE 'Migration 080: % existing credential row(s) found for 918KISS (provider_id=%) — skipping credential block to preserve existing values.', cred_count, pid;
  ELSE
    -- ── 3. Insert encrypted credentials (first-time only) ──────────────────
    -- Values encrypted with AES-256-GCM using the project AES_ENCRYPTION_KEY.
    -- Verified to decrypt back to the correct staging plaintext.
    INSERT INTO gp_credentials (provider_id, key, value, is_encrypted, updated_by, updated_by_name)
    VALUES
      (pid, 'secret_key',
            'il2IUyw60SoX+6t1FVaqWm/rWa9Hi4eRPzl5WWrmlC/a431V',
            TRUE, 1, 'migration-080'),
      (pid, 'md5_key',
            'LIVGNq9Fv7x4Wz5wtIcN3FbEOlwrORQiJAsjVSNQK8401m1e',
            TRUE, 1, 'migration-080'),
      (pid, 'encrypt_key',
            'l5YgKd3uI2vtPxpaj2rzfd3svxZ1zseCmr4jdTGxgIioaUFc',
            TRUE, 1, 'migration-080'),
      (pid, 'delimiter',
            'oBQZxk0taTX3KeY9GPnXdKFaQoLE/FBUs52jLw==',
            TRUE, 1, 'migration-080'),
      (pid, 'operator_token',
            '2oAO8xAjsAtyZjFsk9XVmJ2AiOxgVe2Q4Wa111H5dKPOGM6waZMZkrkxvnCkPlUHywThcNFAh4yHXijeo//dZgOijPKY4J2LAmyERTRzZoFyNoocVUDk9f7e1lE=',
            TRUE, 1, 'migration-080'),
      (pid, 'api_token',
            '0RXmwjZ4PymE0f+emxQwSk2gg0YsEgPyVR5HvThrKvYbFckf13bmwnJDKhMjCTFkSg1hOTeEQIww6hGwNSA1z3e4F5Oosgi7AZLv5mAaJGtWLyxEnaW1v2FMbUpzWs3FbUcKDBl1MaG9T/B4KNdpQi+WEnVoYeacCO8R3kPK71rb64E5yvAa9U+w7qR7fzFaXSU/Z4JUc7AssinmX3j9fsS8HmfuFMiSRrEb8h8O82i2O/H01Da0QjBIVDJsUCm3ele1sQlJ7Q2AveyvzjboL7SUCOfel/soZQXARiEbACLXE0cDKYdFUQ==',
            TRUE, 1, 'migration-080');

    RAISE NOTICE 'Migration 080: 6 encrypted credentials inserted for 918KISS (provider_id=%).', pid;
  END IF;

  -- ── 4. Config: postfix + currency (DO NOTHING preserves existing values) ──
  INSERT INTO gp_config (provider_id, key, value, updated_by, updated_by_name)
  VALUES
    (pid, 'postfix_id', 'stopulux', 1, 'migration-080'),
    (pid, 'currency',   'MYR',      1, 'migration-080')
  ON CONFLICT (provider_id, key) DO NOTHING;

  -- ── 5. Ensure provider is reachable from Website (only if currently DISABLED) ─
  UPDATE gp_providers
  SET
    status               = 'TESTING',
    website_visible      = TRUE,
    website_launch_mode  = 'LOBBY',
    website_display_mode = 'PROVIDER_CARD',
    website_category     = 'slot',
    updated_at           = NOW()
  WHERE id = pid
    AND status = 'DISABLED';

  RAISE NOTICE 'Migration 080 complete (provider_id=%).', pid;
END $$;
