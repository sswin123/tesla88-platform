-- Migration 036: Website Banners table for homepage HeroSlider CMS

CREATE TABLE IF NOT EXISTS website_banners (
  id                    SERIAL PRIMARY KEY,
  title                 VARCHAR(200)  NOT NULL,
  description           TEXT,
  image_media_id        INTEGER       REFERENCES media_library(id) ON DELETE SET NULL,
  mobile_image_media_id INTEGER       REFERENCES media_library(id) ON DELETE SET NULL,
  link_url              VARCHAR(500),
  button_text           VARCHAR(100),
  display_order         INTEGER       NOT NULL DEFAULT 0,
  is_active             BOOLEAN       NOT NULL DEFAULT TRUE,
  start_at              TIMESTAMPTZ,
  end_at                TIMESTAMPTZ,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_banners_active_order
  ON website_banners(is_active, display_order, id)
  WHERE is_active = TRUE;
