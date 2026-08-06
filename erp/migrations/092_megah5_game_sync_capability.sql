-- Migration 092: Ensure MEGAH5 provider has GAME_SYNC capability and is website-visible
--
-- Root cause: gp_providers.capabilities controls whether the "同步游戏" button
-- appears in the ERP Gaming Platform page. Without GAME_SYNC in capabilities,
-- the button is hidden and sync is never triggered, leaving gp_games empty.
--
-- This migration:
--   1. Inserts MEGAH5 into gp_providers if it doesn't exist yet (with correct defaults).
--   2. Merges GAME_SYNC + SEAMLESS_WALLET into capabilities if not already present.
--   3. Ensures website_visible = TRUE so /api/public/games?provider=MEGAH5 returns data.

INSERT INTO gp_providers (
  code, name, display_name, status, wallet_type, capabilities,
  website_visible, website_display_mode
)
VALUES (
  'MEGAH5', 'megah5', 'MEGA H5', 'ACTIVE', 'SEAMLESS',
  '["SEAMLESS_WALLET","GAME_SYNC"]'::jsonb,
  TRUE, 'PROVIDER_CARD'
)
ON CONFLICT (code) DO UPDATE
  SET
    capabilities = (
      SELECT jsonb_agg(DISTINCT elem ORDER BY elem)
      FROM (
        SELECT jsonb_array_elements_text(gp_providers.capabilities) AS elem
        UNION
        SELECT jsonb_array_elements_text('["SEAMLESS_WALLET","GAME_SYNC"]'::jsonb)
      ) t
    ),
    website_visible = TRUE;
