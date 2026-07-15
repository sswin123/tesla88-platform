-- ── website_game_categories ───────────────────────────────────────────────────
--
-- Dynamic, White-Label-ready game lobby category system.
-- Replaces the hardcoded category enum in website_game_providers / website_games.
-- Admins can add, rename, reorder, show/hide, and set icons for any category
-- without touching code.
--
-- Special built-in codes: 'all' (show all cards), 'hot' (show is_hot cards).
-- All other codes filter by category_id FK.

-- 1. Category master table
CREATE TABLE IF NOT EXISTS website_game_categories (
  id             SERIAL PRIMARY KEY,
  category_code  VARCHAR(50)   NOT NULL UNIQUE,
  category_name  VARCHAR(100)  NOT NULL,
  icon_type      VARCHAR(10)   NOT NULL DEFAULT 'none'
                   CHECK (icon_type IN ('none','emoji','image','gif','svg')),
  icon_emoji     TEXT,
  icon_media_id  INTEGER REFERENCES media_library(id) ON DELETE SET NULL,
  icon_svg       TEXT,
  display_order  INTEGER       NOT NULL DEFAULT 0,
  is_default     BOOLEAN       NOT NULL DEFAULT FALSE,
  is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_game_categories_active_order
  ON website_game_categories(is_active, display_order)
  WHERE is_active = TRUE;

-- 2. Seed default categories (backward compat)
INSERT INTO website_game_categories (category_code, category_name, display_order, is_default, is_active)
VALUES
  ('all',     'All',     0,  TRUE,  TRUE),
  ('hot',     'Hot',     10, FALSE, TRUE),
  ('slot',    'Slot',    20, FALSE, TRUE),
  ('live',    'Live',    30, FALSE, TRUE),
  ('sport',   'Sport',   40, FALSE, TRUE),
  ('fishing', 'Fishing', 50, FALSE, TRUE)
ON CONFLICT (category_code) DO NOTHING;

-- 3. Transfer any icon data already in website_lobby_category_icons
UPDATE website_game_categories wgc
SET
  icon_type     = wlci.icon_type,
  icon_emoji    = wlci.icon_emoji,
  icon_media_id = wlci.icon_media_id,
  icon_svg      = wlci.icon_svg,
  updated_at    = NOW()
FROM website_lobby_category_icons wlci
WHERE wgc.category_code = wlci.category_key
  AND wlci.icon_type <> 'none';

-- 4. Add category_id FK to website_game_providers
ALTER TABLE website_game_providers
  ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES website_game_categories(id) ON DELETE SET NULL;

-- 5. Backfill category_id from existing category enum string
UPDATE website_game_providers wp
SET category_id = wgc.id
FROM website_game_categories wgc
WHERE wp.category = wgc.category_code
  AND wp.category_id IS NULL;

-- 6. Add category_id FK to website_games
ALTER TABLE website_games
  ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES website_game_categories(id) ON DELETE SET NULL;

-- 7. Backfill category_id from existing category enum string
UPDATE website_games wg
SET category_id = wgc.id
FROM website_game_categories wgc
WHERE wg.category = wgc.category_code
  AND wg.category_id IS NULL;

-- 8. Indexes on FK columns
CREATE INDEX IF NOT EXISTS idx_website_game_providers_category_id
  ON website_game_providers(category_id) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_website_games_category_id
  ON website_games(category_id) WHERE is_active = TRUE;
