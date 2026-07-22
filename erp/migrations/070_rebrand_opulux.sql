-- Migration 070: Rebrand to Opulux
-- Safely updates runtime data from legacy SSWIN88/Tesla88 branding to Opulux.
-- Idempotent: WHERE clauses ensure re-runs are safe.
--
-- Applied after: 069_gaming_platform_core.sql
-- Safe to run on existing production databases.

-- ── 918KISS provider config: postfix_id ──────────────────────────────────────
UPDATE gp_config
SET    value      = 'opuluxstg',
       updated_at = NOW()
WHERE  key   = 'postfix_id'
  AND  value = 'sswin88stg';

-- ── Brand Settings: brand_name / company_name ─────────────────────────────────
-- Only updates if the value is still the legacy placeholder.
UPDATE brand_settings
SET    brand_name   = 'Opulux',
       company_name = 'Opulux Sdn Bhd',
       updated_at   = NOW()
WHERE  id = 1
  AND  brand_name IN ('SSWIN88', 'Tesla88', '');

-- ── Payment banks: legacy account_name ────────────────────────────────────────
UPDATE payment_banks
SET    account_name = 'Opulux Sdn Bhd'
WHERE  account_name = 'SSWIN88 SDN BHD';

-- ── Website banners: legacy title ────────────────────────────────────────────
UPDATE website_banners
SET    title = '欢迎加入 Opulux'
WHERE  title = '欢迎加入 SSWIN88';
