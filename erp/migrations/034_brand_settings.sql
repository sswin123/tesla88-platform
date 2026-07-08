CREATE TABLE IF NOT EXISTS brand_settings (
  id                SERIAL PRIMARY KEY,
  brand_name        VARCHAR(100) NOT NULL DEFAULT 'SSWIN88',
  company_name      VARCHAR(200) NOT NULL DEFAULT 'SSWIN88',
  tagline           VARCHAR(300),
  logo_media_id     INTEGER REFERENCES media(id) ON DELETE SET NULL,
  favicon_media_id  INTEGER REFERENCES media(id) ON DELETE SET NULL,
  primary_color     VARCHAR(20)  NOT NULL DEFAULT '#1d4ed8',
  secondary_color   VARCHAR(20)  NOT NULL DEFAULT '#1e40af',
  theme_mode        VARCHAR(10)  NOT NULL DEFAULT 'light' CHECK (theme_mode IN ('light', 'dark')),
  website_domain    VARCHAR(255),
  api_domain        VARCHAR(255),
  support_whatsapp  VARCHAR(50),
  support_telegram  VARCHAR(100),
  telegram_channel  VARCHAR(100),
  facebook_url      VARCHAR(500),
  seo_title         VARCHAR(200),
  seo_description   TEXT,
  seo_keywords      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by        VARCHAR(100)
);

CREATE OR REPLACE FUNCTION set_brand_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_brand_updated_at ON brand_settings;
CREATE TRIGGER trg_brand_updated_at
  BEFORE UPDATE ON brand_settings
  FOR EACH ROW EXECUTE FUNCTION set_brand_updated_at();

-- Single-row seed (SSWIN88 defaults)
INSERT INTO brand_settings (id, brand_name, company_name, primary_color, secondary_color, theme_mode)
VALUES (1, 'SSWIN88', 'SSWIN88', '#1d4ed8', '#1e40af', 'light')
ON CONFLICT (id) DO NOTHING;
