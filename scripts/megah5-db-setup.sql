-- ============================================================
-- MEGAH5 Production DB Setup
-- 执行前必须填入所有 PLACEHOLDER_* 值
-- 在 psql 中执行: psql -U postgres -d member_bot -f megah5-db-setup.sql
-- ============================================================

BEGIN;

-- ── Step 1: gp_providers ─────────────────────────────────────
-- 新增 MEGAH5 Provider 记录

INSERT INTO gp_providers (code, name, display_name, status, wallet_type, website_launch_mode)
VALUES (
  'MEGAH5',
  'mega888_h5',        -- internal slug (same convention as mega888_app)
  'Mega888 H5',
  'TESTING',           -- UAT 期间用 TESTING；上线前改为 ACTIVE
  'SEAMLESS',
  'LOBBY'              -- H5 游戏用 LOBBY 模式
)
ON CONFLICT (code) DO UPDATE
  SET display_name         = EXCLUDED.display_name,
      status               = EXCLUDED.status,
      wallet_type          = EXCLUDED.wallet_type,
      website_launch_mode  = EXCLUDED.website_launch_mode,
      updated_at           = NOW();

-- ── Step 2: brand_providers ──────────────────────────────────
-- 绑定 TESLA88 品牌 ↔ MEGAH5

INSERT INTO brand_providers (brand_id, provider_id, status, wallet_type, environment)
SELECT
  b.id,
  p.id,
  'TESTING',           -- UAT 阶段
  'SEAMLESS',
  'PRODUCTION'
FROM brands b, gp_providers p
WHERE b.code = 'TESLA88' AND p.code = 'MEGAH5'
ON CONFLICT (brand_id, provider_id) DO UPDATE
  SET status       = EXCLUDED.status,
      wallet_type  = EXCLUDED.wallet_type,
      environment  = EXCLUDED.environment,
      updated_at   = NOW();

-- ── Step 3: brand_provider_config ────────────────────────────
-- 写入 Config（非敏感，明文存储）

WITH bp AS (
  SELECT bp.id AS bp_id
  FROM brand_providers bp
  JOIN brands b ON b.id = bp.brand_id
  JOIN gp_providers p ON p.id = bp.provider_id
  WHERE b.code = 'TESLA88' AND p.code = 'MEGAH5'
  LIMIT 1
)
INSERT INTO brand_provider_config (brand_provider_id, key, value)
SELECT bp_id, k, v FROM bp, (VALUES
  -- MEGA Production Integration Information (confirmed 2026-08-03)
  ('api_base_url',    'https://prov.h5mg888.com'),
  ('h5_api_domain',   'https://apigame.mg558h5.com'),
  ('h5_lobby_domain', 'https://apigame.mg558h5.com'),
  ('h5_game_domain',  'https://apigame.mg558h5.com'),
  ('datafeed_url',    'https://dtfeed.h5mg888.com'),
  ('game_icon_url',   'https://game1.mg888h5.com/v3/h5Lb02/gameIcon_en/'),
  ('postfix_id',      '@opulux'),
  ('currency',        'MYR'),
  ('timeout_ms',      '10000')
) AS t(k, v)
ON CONFLICT (brand_provider_id, key) DO UPDATE
  SET value      = EXCLUDED.value,
      updated_at = NOW();

-- ── Step 4: brand_provider_credentials ───────────────────────
-- 写入 Credentials（敏感，标记加密状态）
-- is_encrypted = false: 明文存储（开发/UAT 阶段）
-- 上线前请通过 ERP Brand Center 加密存储

WITH bp AS (
  SELECT bp.id AS bp_id
  FROM brand_providers bp
  JOIN brands b ON b.id = bp.brand_id
  JOIN gp_providers p ON p.id = bp.provider_id
  WHERE b.code = 'TESLA88' AND p.code = 'MEGAH5'
  LIMIT 1
)
INSERT INTO brand_provider_credentials (brand_provider_id, key, value, is_encrypted)
SELECT bp_id, k, v, false FROM bp, (VALUES
  -- MEGA Production Integration Information (confirmed 2026-08-03)
  -- api_token         = Client Token: GameList body accessToken only
  --                     (NOT for H5 Login — MEGA confirmed api_account_token must be used there)
  -- api_account_token = API Account Token: H5 Login body accessToken + Operations API HTTP Header 'token:'
  -- operator_token    = Inbound Token: MEGA → ERP callback Header 'token:' 身份验证
  ('api_token',         'XTqf65esyLWLOwub'),
  ('api_account_token', 'NUFXYmtCaDY5d2QxZkhyUWtDbExxOEpWbElFcjBkZnlaWmZxYVV6TW9KYTY5bGNDVHV5ZjFpdUJWQS9XWTNENk9CemFnVTJsQll6Y3lQekhRNUZQVXBXNkVEenR2WVR2bllJaGJEZ0N0emkyQUxidVo5cnJPejlVdHFCM1d1SU10Q2syWlNnQXFRMHpBSTFCUmo0YXlRPT0='),
  ('operator_token',    'XTqf65esyLWLOwub'),

  -- ★ 以下值已确认，无需修改 ★
  ('secret_key',   'pVhahppR'),   -- MEGA 后台 SecretKey
  ('md5_key',      'XrGbulYo'),   -- MEGA 后台 Md5EncryptKey
  ('encrypt_key',  'qHSkxjds'),   -- MEGA 后台 EncryptKey
  ('delimiter',    '|')           -- QS 字段分隔符（MEGA H5 标准）
) AS t(k, v)
ON CONFLICT (brand_provider_id, key) DO UPDATE
  SET value      = EXCLUDED.value,
      updated_at = NOW();

-- ── Verify ────────────────────────────────────────────────────

SELECT 'gp_providers' AS tbl, code, status, wallet_type, website_launch_mode
FROM gp_providers WHERE code = 'MEGAH5';

SELECT 'brand_providers' AS tbl, b.code AS brand, p.code AS provider, bp.status, bp.wallet_type
FROM brand_providers bp
JOIN brands b ON b.id = bp.brand_id
JOIN gp_providers p ON p.id = bp.provider_id
WHERE p.code = 'MEGAH5';

SELECT 'config' AS tbl, bpc.key, LEFT(bpc.value, 60) AS value
FROM brand_provider_config bpc
JOIN brand_providers bp ON bp.id = bpc.brand_provider_id
JOIN gp_providers p ON p.id = bp.provider_id
WHERE p.code = 'MEGAH5'
ORDER BY bpc.key;

SELECT 'credentials' AS tbl, bpc.key, bpc.is_encrypted,
  CASE WHEN bpc.key IN ('secret_key','md5_key','encrypt_key','api_token','operator_token')
    THEN LEFT(bpc.value, 4) || '***'
    ELSE bpc.value
  END AS value_preview
FROM brand_provider_credentials bpc
JOIN brand_providers bp ON bp.id = bpc.brand_provider_id
JOIN gp_providers p ON p.id = bp.provider_id
WHERE p.code = 'MEGAH5'
ORDER BY bpc.key;

COMMIT;
