-- ── Lobby Category Image System v2 ──────────────────────────────────────────────
--
-- Extends the image display system with:
--  • Auto mode  — responsive sizes (Desktop 72 / Tablet 64 / Mobile 56 px)
--  • Custom mode — per-category width + height (24–200 px)
--  • Reserved future-ready fields for animation / styling

-- 1. Extend image_display_size check to include 'auto' and 'custom'
ALTER TABLE website_game_categories
  DROP CONSTRAINT IF EXISTS website_game_categories_image_display_size_check;

ALTER TABLE website_game_categories
  ADD CONSTRAINT website_game_categories_image_display_size_check
    CHECK (image_display_size IN ('auto', 'small', 'medium', 'large', 'custom'));

-- Set default to 'auto' going forward (existing rows already have 'medium', that's fine)
ALTER TABLE website_game_categories
  ALTER COLUMN image_display_size SET DEFAULT 'auto';

-- 2. Custom dimensions (only used when image_display_size = 'custom')
ALTER TABLE website_game_categories
  ADD COLUMN IF NOT EXISTS image_custom_width  SMALLINT DEFAULT NULL
    CHECK (image_custom_width  IS NULL OR image_custom_width  BETWEEN 24 AND 200),
  ADD COLUMN IF NOT EXISTS image_custom_height SMALLINT DEFAULT NULL
    CHECK (image_custom_height IS NULL OR image_custom_height BETWEEN 24 AND 200);

-- 3. Future-ready reserved fields — structure only, no implementation yet
ALTER TABLE website_game_categories
  ADD COLUMN IF NOT EXISTS hover_animation   VARCHAR(50) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS border_style      VARCHAR(50) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS background_style  VARCHAR(50) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS shadow_style      VARCHAR(50) DEFAULT NULL;
