-- ─── Migration 076: gp_providers Website Display Settings ────────────────────
--
-- Makes gp_providers the single source of truth for the Provider Registry.
-- Every provider now carries its own website display settings alongside its
-- technical configuration.  The website reads these fields to build provider
-- cards without requiring a separate website_game_providers entry.
--
-- Provider types and their launch behaviour:
--   LOBBY  — player lands inside provider H5 Lobby (e.g. 918KISS)
--   DIRECT — website lists individual games; each game launched directly
--   BOTH   — provider supports both modes (game list + lobby entry)
-- ─────────────────────────────────────────────────────────────────────────────

-- Website visibility and presentation
ALTER TABLE gp_providers
  ADD COLUMN IF NOT EXISTS website_visible      BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS website_display_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS website_logo_url     TEXT,
  ADD COLUMN IF NOT EXISTS website_banner_url   TEXT,
  ADD COLUMN IF NOT EXISTS website_category     VARCHAR(20) NOT NULL DEFAULT 'slot',
  ADD COLUMN IF NOT EXISTS website_sort_order   INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS website_is_hot       BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS website_is_new       BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS website_maintenance  BOOLEAN     NOT NULL DEFAULT FALSE;

-- How the website launches this provider's games:
--   LOBBY  → redirect player into provider H5 Lobby (no individual game selection on our side)
--   DIRECT → pass game_code to provider launch API
ALTER TABLE gp_providers
  ADD COLUMN IF NOT EXISTS website_launch_mode  VARCHAR(10) NOT NULL DEFAULT 'LOBBY'
    CHECK (website_launch_mode IN ('LOBBY', 'DIRECT'));

-- Platforms the provider supports
ALTER TABLE gp_providers
  ADD COLUMN IF NOT EXISTS website_platforms    JSONB       NOT NULL DEFAULT '["MOBILE","WEB"]';

-- Capabilities column already exists (from migration 069) but adapters were
-- not syncing their capability arrays to the DB.  This migration seeds the
-- 918KISS row with its known capabilities so the ERP can read them without
-- needing to boot the adapter.
UPDATE gp_providers
  SET capabilities = '["SEAMLESS_WALLET","JACKPOT","GAME_SYNC","LOBBY","HISTORY",
                        "TIME_POINT","FAILED_TRANSACTION","LOGOUT","FUND_FLOAT",
                        "CHECK_ORDER","NICKNAME_UPDATE"]'::jsonb
  WHERE code = '918KISS' AND (capabilities = '[]'::jsonb OR capabilities IS NULL);

-- Index for public provider API (website reads visible, active providers)
CREATE INDEX IF NOT EXISTS idx_gp_providers_website
  ON gp_providers (website_visible, website_sort_order)
  WHERE website_visible = TRUE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: Turn on website_visible for 918KISS (staging / testing environment)
-- Admin can change this in ERP > Gaming Platform > Website Display tab.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE gp_providers
  SET website_visible      = TRUE,
      website_display_name = '918KISS',
      website_category     = 'slot',
      website_launch_mode  = 'LOBBY',
      website_is_hot       = TRUE,
      website_is_new       = TRUE,
      website_sort_order   = 1
  WHERE code = '918KISS';
