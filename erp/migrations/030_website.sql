-- Website brand/config keys in system_settings
INSERT INTO system_settings (key, value, description) VALUES
  ('site_brand_name',      'Member Portal', 'Website brand name shown in header'),
  ('site_primary_color',   '#3B82F6',       'Primary theme color (hex)'),
  ('site_logo_media_id',   '',              'media_library id for site logo image'),
  ('site_banner_text',     '',              'Homepage hero headline text'),
  ('site_banner_media_id', '',              'media_library id for homepage banner image'),
  ('site_contact_email',   '',              'Support contact email address'),
  ('site_contact_phone',   '',              'Support contact phone number'),
  ('site_seo_title',       'Member Portal', 'HTML <title> for website pages'),
  ('site_seo_description', '',              'Meta description for SEO'),
  ('site_terms_url',       '',              'URL to Terms & Conditions page'),
  ('website_enabled',      'true',          'Toggle to disable website publicly')
ON CONFLICT (key) DO NOTHING;

-- Member web authentication columns
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS website_password_hash VARCHAR(255),
  ADD COLUMN IF NOT EXISTS website_registered_at  TIMESTAMPTZ;

-- APK version management
CREATE TABLE IF NOT EXISTS apk_versions (
  id             SERIAL PRIMARY KEY,
  version_name   VARCHAR(20)  NOT NULL,
  version_code   INTEGER      NOT NULL,
  release_notes  TEXT,
  media_id       INTEGER REFERENCES media_library(id) ON DELETE SET NULL,
  min_android    VARCHAR(10)  NOT NULL DEFAULT '6.0',
  is_current     BOOLEAN      NOT NULL DEFAULT FALSE,
  force_update   BOOLEAN      NOT NULL DEFAULT FALSE,
  download_count INTEGER      NOT NULL DEFAULT 0,
  created_by     VARCHAR(100) NOT NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Only one row can be is_current = TRUE at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_apk_single_current
  ON apk_versions (is_current) WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_apk_versions_created
  ON apk_versions (created_at DESC);
