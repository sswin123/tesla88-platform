-- ═════════════════════════════════════════════════════════════════════════════
-- Migration 081: Fix 918KISS operator_token (truncated value in migration 074)
--
-- Problem: Migration 074 stored a 48-character operator_token missing 16 chars:
--   WRONG:   b26180f3c132f760355a3ad2a6b53e7d46041a40ad5c0f9d
--   CORRECT: b26180f3c132f760355a3ad2a6b53e7a149213e895fbce7d46041a40ad5c0f9d
--   Missing: ──────────────────────────────────┘a149213e895fbce7┘
--
-- The operator_token is sent by 918KISS in inbound Seamless Wallet callbacks
-- (operatorToken field or header).  A wrong value causes ALL callbacks to be
-- rejected with INVALID_TOKEN (error=100), silently dropping bet/balance events.
--
-- Source: Official 918KISS Opulux STAGING account integration letter.
-- ═════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_pid INTEGER;
BEGIN
  SELECT id INTO v_pid FROM gp_providers WHERE code = '918KISS';
  IF v_pid IS NULL THEN
    RAISE NOTICE 'Migration 081: 918KISS provider not found — skipping.';
    RETURN;
  END IF;

  -- Fix operator_token: replace truncated value with the full 64-char hex token.
  UPDATE gp_credentials
  SET
    value        = 'b26180f3c132f760355a3ad2a6b53e7a149213e895fbce7d46041a40ad5c0f9d',
    is_encrypted = FALSE,
    updated_at   = NOW(),
    updated_by_name = 'migration-081'
  WHERE provider_id = v_pid
    AND key = 'operator_token';

  IF NOT FOUND THEN
    INSERT INTO gp_credentials (provider_id, key, value, is_encrypted, updated_by_name)
    VALUES (v_pid, 'operator_token',
            'b26180f3c132f760355a3ad2a6b53e7a149213e895fbce7d46041a40ad5c0f9d',
            FALSE, 'migration-081');
    RAISE NOTICE 'Migration 081: operator_token inserted for 918KISS (provider_id=%).', v_pid;
  ELSE
    RAISE NOTICE 'Migration 081: operator_token corrected for 918KISS (provider_id=%).', v_pid;
  END IF;
END $$;
