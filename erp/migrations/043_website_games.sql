-- ── website_games ─────────────────────────────────────────────────────────────
--
-- Stores individual game entries for the Game Lobby.
-- Games can come from manual admin input (source='manual') or API sync (source='api').
-- provider_id links back to website_game_providers (the provider master).
-- api_data holds raw API response for future enrichment without schema changes.

CREATE TABLE IF NOT EXISTS website_games (
  id                 SERIAL PRIMARY KEY,
  provider_id        INTEGER      REFERENCES website_game_providers(id) ON DELETE SET NULL,
  game_code          VARCHAR(200) NOT NULL,
  game_name          VARCHAR(200) NOT NULL,
  category           VARCHAR(20)  NOT NULL DEFAULT 'slot'
                       CHECK (category IN ('slot', 'live', 'sport', 'fishing')),
  thumbnail_media_id INTEGER      REFERENCES media_library(id) ON DELETE SET NULL,
  banner_media_id    INTEGER      REFERENCES media_library(id) ON DELETE SET NULL,
  is_hot             BOOLEAN      NOT NULL DEFAULT FALSE,
  is_new             BOOLEAN      NOT NULL DEFAULT FALSE,
  is_active          BOOLEAN      NOT NULL DEFAULT TRUE,
  -- 'manual' = admin created, 'api' = synced from provider API
  source             VARCHAR(20)  NOT NULL DEFAULT 'manual'
                       CHECK (source IN ('manual', 'api')),
  -- which adapter synced this row, e.g. 'pgsoft', 'pragmatic', 'evolution'
  api_provider       VARCHAR(50),
  -- raw API payload; allows future enrichment without schema migrations
  api_data           JSONB,
  display_order      INTEGER      NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_games_category    ON website_games(category);
CREATE INDEX IF NOT EXISTS idx_website_games_provider_id ON website_games(provider_id);
CREATE INDEX IF NOT EXISTS idx_website_games_active_order ON website_games(is_active, display_order);
CREATE INDEX IF NOT EXISTS idx_website_games_source      ON website_games(source);
-- unique game_code per provider (prevents duplicate API syncs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_website_games_code_provider
  ON website_games(game_code, COALESCE(provider_id, 0));
