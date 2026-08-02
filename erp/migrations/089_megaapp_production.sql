-- ═════════════════════════════════════════════════════════════════════════════
-- Migration 089: MEGAAPP Production Provider Registration
--
-- Purpose: registers the MEGA888 MEGAAPP provider so the existing
-- MegaAppAdapter code path can serve production traffic.
--
-- All adapter code already exists:
--   erp/src/lib/providers/adapters/megaapp/MegaAppAdapter.ts
--   erp/src/lib/providers/adapters/megaapp/MegaAppApiClient.ts
--   erp/src/lib/providers/adapters/megaapp/MegaAppSigner.ts
--   erp/src/lib/providers/adapters/AdapterFactory.ts  (case 'MEGAAPP')
--   erp/src/app/api/mega/callback/route.ts            (login callback)
--   erp/src/app/api/games/launch/route.ts             (Transfer Wallet launch)
--
-- This migration inserts the missing database rows only.
--
-- Changes applied (all idempotent):
--   1. Extend website_launch_mode CHECK → adds 'MEGAAPP_DIALOG'
--   2. Insert MEGAAPP into gp_providers (Transfer Wallet, website-visible)
--   3. Create brand_providers row: TESLA88 ↔ MEGAAPP, status = ACTIVE
--   4. Insert production credentials into brand_provider_credentials
--      (is_encrypted = FALSE — AES-encrypt via ERP Brand Center post-deploy)
--   5. Insert production config into brand_provider_config
-- ═════════════════════════════════════════════════════════════════════════════


-- ─── 1. Extend website_launch_mode to include 'MEGAAPP_DIALOG' ───────────────
--
-- Migration 076 added website_launch_mode VARCHAR(10) with CHECK ('LOBBY','DIRECT').
-- 'MEGAAPP_DIALOG' is 14 chars and needs to be a valid value for MEGA888.
-- Drop the auto-generated constraint and replace it with the extended set.
-- The ALTER COLUMN TYPE is needed because VARCHAR(10) is too short for the new value.

DO $$
DECLARE
  v_constraint text;
BEGIN
  -- Find whichever constraint references website_launch_mode in gp_providers
  SELECT tc.constraint_name
  INTO   v_constraint
  FROM   information_schema.table_constraints tc
  JOIN   information_schema.check_constraints cc
    ON   cc.constraint_schema = tc.constraint_schema
   AND   cc.constraint_name   = tc.constraint_name
  WHERE  tc.table_schema    = 'public'
    AND  tc.table_name      = 'gp_providers'
    AND  tc.constraint_type = 'CHECK'
    AND  cc.check_clause    LIKE '%website_launch_mode%';

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE gp_providers DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE gp_providers
  ALTER COLUMN website_launch_mode TYPE VARCHAR(20);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE  table_schema     = 'public'
      AND  table_name       = 'gp_providers'
      AND  constraint_name  = 'gp_providers_website_launch_mode_check'
  ) THEN
    ALTER TABLE gp_providers
      ADD CONSTRAINT gp_providers_website_launch_mode_check
        CHECK (website_launch_mode IN ('LOBBY', 'DIRECT', 'MEGAAPP_DIALOG'));
  END IF;
END $$;


-- ─── 2. Register MEGAAPP provider ────────────────────────────────────────────

INSERT INTO gp_providers (
  code,          name,            display_name,
  status,        wallet_type,
  capabilities,
  website_visible,  website_display_name,  website_category,
  website_sort_order, website_is_hot, website_is_new, website_maintenance,
  website_launch_mode, website_display_mode,  website_platforms
)
VALUES (
  'MEGAAPP',    'mega888_app',   'MEGA888',
  'ACTIVE',     'TRANSFER',
  '["TRANSFER_WALLET","LOBBY"]'::jsonb,
  TRUE,          'MEGA888',              'slot',
  2,              TRUE,          FALSE,         FALSE,
  'MEGAAPP_DIALOG', 'PROVIDER_CARD',    '["MOBILE","WEB"]'::jsonb
)
ON CONFLICT (code) DO NOTHING;


-- ─── 3. Link MEGAAPP to brand TESLA88 ────────────────────────────────────────
-- Brand TESLA88 is seeded by migration 086.

INSERT INTO brand_providers (brand_id, provider_id, status, wallet_type, currency, environment)
SELECT b.id, p.id, 'ACTIVE', 'TRANSFER', 'MYR', 'PRODUCTION'
FROM   brands b
JOIN   gp_providers p ON p.code = 'MEGAAPP'
WHERE  b.code = 'TESLA88'
ON CONFLICT (brand_id, provider_id) DO NOTHING;


-- ─── 4. Production credentials (plaintext — encrypt via ERP Brand Center) ────
--
-- Keys consumed by MegaAppAdapter (via AdapterFactory case 'MEGAAPP'):
--   secret_code    → secretCode used in MD5 digest signatures
--   sn             → hall code (SN) used in every API call and digest
--   agent_login_id → merchant ID for agent-level API operations
--
-- is_encrypted = FALSE: runtime reads value as-is. After deploy, open
-- ERP > Brand Center > TESLA88 > MEGAAPP > Credentials and re-encrypt.

INSERT INTO brand_provider_credentials (brand_provider_id, key, value, is_encrypted)
SELECT bp.id, cred.key, cred.value, FALSE
FROM   brand_providers bp
JOIN   brands       b ON b.id = bp.brand_id
JOIN   gp_providers p ON p.id = bp.provider_id,
(VALUES
  ('secret_code',    'FLpK/PCAWbzoAv2ofbNMaR5nIIk='),
  ('sn',             'ld00'),
  ('agent_login_id', 'Mega1-7238')
) AS cred (key, value)
WHERE  b.code = 'TESLA88'
  AND  p.code = 'MEGAAPP'
ON CONFLICT (brand_provider_id, key) DO NOTHING;


-- ─── 5. Production config ─────────────────────────────────────────────────────
--
-- Keys consumed by MegaAppAdapter:
--   api_base_url    → MEGAAPP JSON-RPC endpoint base URL
--   currency        → player wallet currency
--   timeout_ms      → HTTP request timeout
--   password_length → generated provider account password length

INSERT INTO brand_provider_config (brand_provider_id, key, value)
SELECT bp.id, cfg.key, cfg.value
FROM   brand_providers bp
JOIN   brands       b ON b.id = bp.brand_id
JOIN   gp_providers p ON p.id = bp.provider_id,
(VALUES
  ('api_base_url',    'https://mgapi-ali.yidaiyiluclub.com/mega-cloud/api/'),
  ('currency',        'MYR'),
  ('timeout_ms',      '15000'),
  ('password_length', '10')
) AS cfg (key, value)
WHERE  b.code = 'TESLA88'
  AND  p.code = 'MEGAAPP'
ON CONFLICT (brand_provider_id, key) DO NOTHING;
