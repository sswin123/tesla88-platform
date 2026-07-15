-- Migration 048: Extend brand_settings for White Label Phase 6.2
-- Adds: erp_domain, instagram_url, tiktok_url, support_email
-- All columns nullable so existing rows are unaffected.

ALTER TABLE brand_settings
  ADD COLUMN IF NOT EXISTS erp_domain    VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS instagram_url VARCHAR(500) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tiktok_url    VARCHAR(500) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS support_email VARCHAR(255) DEFAULT NULL;

-- DOWN (rollback):
-- ALTER TABLE brand_settings
--   DROP COLUMN IF EXISTS erp_domain,
--   DROP COLUMN IF EXISTS instagram_url,
--   DROP COLUMN IF EXISTS tiktok_url,
--   DROP COLUMN IF EXISTS support_email;
