-- ── Lobby Category Image Display Size ──────────────────────────────────────────
--
-- Adds per-category image display controls so admins can set a fixed container
-- size for uploaded icon images.  The website renders images inside that
-- container using object-fit so they always look clean regardless of original
-- upload size.
--
-- image_display_size:  container px preset (small=48, medium=64, large=80)
-- image_display_mode:  CSS object-fit value for the image inside the container

ALTER TABLE website_game_categories
  ADD COLUMN IF NOT EXISTS image_display_size VARCHAR(10) NOT NULL DEFAULT 'medium'
    CHECK (image_display_size IN ('small', 'medium', 'large')),
  ADD COLUMN IF NOT EXISTS image_display_mode VARCHAR(10) NOT NULL DEFAULT 'contain'
    CHECK (image_display_mode IN ('contain', 'cover', 'stretch'));
