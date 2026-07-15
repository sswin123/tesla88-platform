CREATE TABLE IF NOT EXISTS website_game_providers (
  id               SERIAL PRIMARY KEY,
  provider_code    VARCHAR(100) NOT NULL UNIQUE,
  provider_name    VARCHAR(200) NOT NULL,
  category         VARCHAR(20)  NOT NULL DEFAULT 'slot'
                     CHECK (category IN ('slot', 'live', 'sport', 'fishing')),
  logo_media_id    INTEGER REFERENCES media_library(id) ON DELETE SET NULL,
  banner_media_id  INTEGER REFERENCES media_library(id) ON DELETE SET NULL,
  is_hot           BOOLEAN NOT NULL DEFAULT FALSE,
  is_new           BOOLEAN NOT NULL DEFAULT FALSE,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  display_order    INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_game_providers_active_order
  ON website_game_providers(is_active, display_order, id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_website_game_providers_category
  ON website_game_providers(category, display_order, id)
  WHERE is_active = TRUE;
