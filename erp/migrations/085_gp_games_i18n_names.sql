-- erp/migrations/085_gp_games_i18n_names.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 085: Bilingual Game Names
--
-- Adds name_zh (Chinese) and name_en (English) to gp_games for the ERP
-- Game Registry. Both are optional admin overrides; synced games continue to
-- use the provider's native `name` field until an admin sets these.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE gp_games
  ADD COLUMN IF NOT EXISTS name_zh VARCHAR(200),   -- Chinese display name (admin override)
  ADD COLUMN IF NOT EXISTS name_en VARCHAR(200);   -- English display name (admin override)
