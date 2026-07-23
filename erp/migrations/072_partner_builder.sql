-- erp/migrations/072_partner_builder.sql
-- Phase M5-A — Partner Builder Foundation
-- Depends on: media_library (027), admins table

-- ─── partner_templates ──────────────────────────────────────────────────────
-- System-defined templates; populated via seed_partner_templates.sql
-- Versioned so customer pages never break after template updates
CREATE TABLE IF NOT EXISTS partner_templates (
  id                 SERIAL        PRIMARY KEY,
  name               VARCHAR(100)  NOT NULL,
  slug               VARCHAR(50)   NOT NULL,
  version            VARCHAR(10)   NOT NULL DEFAULT 'v1',
  description        TEXT,
  preview_url        VARCHAR(500),
  layout_json        JSONB         NOT NULL DEFAULT '{}',
  default_theme_slug VARCHAR(50),
  tags               TEXT[]        NOT NULL DEFAULT '{}',
  is_active          BOOLEAN       NOT NULL DEFAULT TRUE,
  sort_order         INTEGER       NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (slug, version)
);

CREATE INDEX IF NOT EXISTS idx_pt_active
  ON partner_templates(is_active, sort_order)
  WHERE is_active = TRUE;

-- ─── partner_themes ─────────────────────────────────────────────────────────
-- CSS variable collections; independent of templates (any theme + any template)
CREATE TABLE IF NOT EXISTS partner_themes (
  id               SERIAL        PRIMARY KEY,
  name             VARCHAR(100)  NOT NULL,
  slug             VARCHAR(50)   NOT NULL UNIQUE,
  preview_color    VARCHAR(7)    NOT NULL DEFAULT '#000000',
  preview_gradient VARCHAR(200),
  css_variables    JSONB         NOT NULL DEFAULT '{}',
  is_active        BOOLEAN       NOT NULL DEFAULT TRUE,
  sort_order       INTEGER       NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pth_active
  ON partner_themes(is_active, sort_order)
  WHERE is_active = TRUE;

-- ─── partner_sites ──────────────────────────────────────────────────────────
-- One row per published landing page. page_type reserved for future expansion
-- (partner, affiliate, campaign, event, tournament, referral, agent...)
CREATE TABLE IF NOT EXISTS partner_sites (
  id                   SERIAL        PRIMARY KEY,
  name                 VARCHAR(200)  NOT NULL,
  slug                 VARCHAR(100)  NOT NULL,
  page_type            VARCHAR(50)   NOT NULL DEFAULT 'partner',
  template_id          INTEGER       NOT NULL REFERENCES partner_templates(id),
  template_version     VARCHAR(10)   NOT NULL DEFAULT 'v1',
  theme_id             INTEGER       NOT NULL REFERENCES partner_themes(id),
  logo_media_id        INTEGER       REFERENCES media_library(id),
  banner_media_id      INTEGER       REFERENCES media_library(id),
  favicon_media_id     INTEGER       REFERENCES media_library(id),
  seo_title            VARCHAR(200),
  seo_description      TEXT,
  seo_keywords         VARCHAR(500),
  seo_image_media_id   INTEGER       REFERENCES media_library(id),
  custom_css_vars      JSONB,
  status               VARCHAR(20)   NOT NULL DEFAULT 'DRAFT',
  published_at         TIMESTAMPTZ,
  created_by           INTEGER       REFERENCES admins(id),
  deleted_at           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ps_status CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  CONSTRAINT uq_ps_slug UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_ps_slug
  ON partner_sites(slug)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ps_status
  ON partner_sites(status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ps_created
  ON partner_sites(created_at DESC)
  WHERE deleted_at IS NULL;

-- ─── partner_sections ───────────────────────────────────────────────────────
-- Ordered list of sections per site. content_json structure varies by section_type.
-- Known section_types: hero, video_banner, intro, brands, promotion, faq,
--   telegram_cta, whatsapp_cta, countdown, statistics, testimonials, timeline, footer
CREATE TABLE IF NOT EXISTS partner_sections (
  id             SERIAL       PRIMARY KEY,
  site_id        INTEGER      NOT NULL REFERENCES partner_sites(id) ON DELETE CASCADE,
  section_type   VARCHAR(50)  NOT NULL,
  content_json   JSONB        NOT NULL DEFAULT '{}',
  sort_order     INTEGER      NOT NULL DEFAULT 0,
  is_enabled     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pse_site
  ON partner_sections(site_id, sort_order);

-- ─── partner_cards ──────────────────────────────────────────────────────────
-- Unlimited partner brand cards per site, rendered in the 'brands' section
CREATE TABLE IF NOT EXISTS partner_cards (
  id               SERIAL        PRIMARY KEY,
  site_id          INTEGER       NOT NULL REFERENCES partner_sites(id) ON DELETE CASCADE,
  logo_media_id    INTEGER       REFERENCES media_library(id),
  brand_name       VARCHAR(200)  NOT NULL,
  subtitle         VARCHAR(300),
  description      TEXT,
  badge            VARCHAR(20),
  welcome_bonus    VARCHAR(200),
  free_credit      VARCHAR(200),
  commission       VARCHAR(200),
  promo_text       TEXT,
  telegram_url     VARCHAR(500),
  whatsapp_url     VARCHAR(500),
  website_url      VARCHAR(500),
  button_text      VARCHAR(100)  NOT NULL DEFAULT 'Join Now',
  button_color     VARCHAR(7),
  button_style     VARCHAR(20)   NOT NULL DEFAULT 'solid',
  card_bg_color    VARCHAR(7),
  card_bg_media_id INTEGER       REFERENCES media_library(id),
  sort_order       INTEGER       NOT NULL DEFAULT 0,
  is_enabled       BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_pc_badge CHECK (badge IN (NULL,'HOT','NEW','VIP','PROMO','TOP')),
  CONSTRAINT chk_pc_btn_style CHECK (button_style IN ('solid','outline','gradient'))
);

CREATE INDEX IF NOT EXISTS idx_pc_site
  ON partner_cards(site_id, sort_order);

-- ─── updated_at triggers ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ps_updated_at') THEN
    CREATE TRIGGER trg_ps_updated_at
      BEFORE UPDATE ON partner_sites
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pse_updated_at') THEN
    CREATE TRIGGER trg_pse_updated_at
      BEFORE UPDATE ON partner_sections
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pc_updated_at') THEN
    CREATE TRIGGER trg_pc_updated_at
      BEFORE UPDATE ON partner_cards
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
