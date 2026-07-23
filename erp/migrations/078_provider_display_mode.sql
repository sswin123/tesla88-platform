-- Migration 078: Provider Display Mode
-- Adds website_display_mode to gp_providers.
-- PROVIDER_CARD  → show provider card only (no game list required) — for LOBBY mode providers
-- GAME_LIST      → show individual game cards from Games Library
-- BOTH           → show provider card + featured game cards

ALTER TABLE gp_providers
  ADD COLUMN IF NOT EXISTS website_display_mode VARCHAR(20) DEFAULT 'PROVIDER_CARD'
    CHECK (website_display_mode IN ('PROVIDER_CARD', 'GAME_LIST', 'BOTH'));

-- 918KISS is LOBBY mode — display as provider card only
UPDATE gp_providers
SET website_display_mode = 'PROVIDER_CARD'
WHERE code = '918KISS';
