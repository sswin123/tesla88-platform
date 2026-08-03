-- =============================================================================
-- megah5-add-api-account-token.sql
--
-- PURPOSE: 在 Production DB 中为 TESLA88 × MEGAH5 补充 api_account_token。
--          MEGA 官方确认 H5 Login body accessToken 必须使用此 Token（2026-08-03）。
--
-- SAFE TO RUN: 使用 ON CONFLICT DO UPDATE — 行不存在则新增，存在则覆盖。
--              不影响其他任何 Credential 行。
--
-- 执行方式（Production Server）：
--   docker compose -f docker-compose.production.yml exec -T postgres \
--     psql -U $POSTGRES_USER -d $POSTGRES_DB \
--     -f /path/to/scripts/megah5-add-api-account-token.sql
-- =============================================================================

-- ── Step 1: 确认目标 brand_providers.id ──────────────────────────────────────
DO $$
DECLARE
  v_bp_id INTEGER;
BEGIN
  SELECT bp.id INTO v_bp_id
  FROM brand_providers bp
  JOIN brands       b ON b.id = bp.brand_id
  JOIN gp_providers p ON p.id = bp.provider_id
  WHERE UPPER(b.code) = 'TESLA88'
    AND UPPER(p.code) = 'MEGAH5'
  LIMIT 1;

  IF v_bp_id IS NULL THEN
    RAISE EXCEPTION 'brand_providers row not found: TESLA88 × MEGAH5. Run megah5-db-setup.sql first.';
  END IF;

  RAISE NOTICE 'Found brand_providers.id = % for TESLA88 × MEGAH5', v_bp_id;
END $$;

-- ── Step 2: UPSERT api_account_token ─────────────────────────────────────────
INSERT INTO brand_provider_credentials (brand_provider_id, key, value, is_encrypted)
SELECT
  bp.id,
  'api_account_token',
  'NUFXYmtCaDY5d2QxZkhyUWtDbExxOEpWbElFcjBkZnlaWmZxYVV6TW9KYTY5bGNDVHV5ZjFpdUJWQS9XWTNENk9CemFnVTJsQll6Y3lQekhRNUZQVXBXNkVEenR2WVR2bllJaGJEZ0N0emkyQUxidVo5cnJPejlVdHFCM1d1SU10Q2syWlNnQXFRMHpBSTFCUmo0YXlRPT0=',
  false
FROM brand_providers bp
JOIN brands       b ON b.id = bp.brand_id
JOIN gp_providers p ON p.id = bp.provider_id
WHERE UPPER(b.code) = 'TESLA88'
  AND UPPER(p.code) = 'MEGAH5'
ON CONFLICT ON CONSTRAINT uq_brand_provider_credential
DO UPDATE
  SET value      = EXCLUDED.value,
      updated_at = NOW();

-- ── Step 3: 验证结果 ──────────────────────────────────────────────────────────
SELECT
  bpc.key,
  bpc.is_encrypted,
  CASE
    WHEN bpc.key IN ('api_account_token') THEN LEFT(bpc.value, 8) || '***'
    WHEN bpc.key IN ('secret_key', 'md5_key', 'encrypt_key', 'api_token', 'operator_token')
      THEN LEFT(bpc.value, 4) || '***'
    ELSE bpc.value
  END AS value_preview,
  bpc.updated_at
FROM brand_provider_credentials bpc
JOIN brand_providers bp ON bp.id = bpc.brand_provider_id
JOIN brands          b  ON b.id  = bp.brand_id
JOIN gp_providers    p  ON p.id  = bp.provider_id
WHERE UPPER(b.code) = 'TESLA88'
  AND UPPER(p.code) = 'MEGAH5'
ORDER BY bpc.key;
