-- =============================================================================
-- 034_brand_settings.sql
--
-- 创建 brand_settings 表（白标品牌配置）。
--
-- 修复：原版本引用了不存在的 media 表（正确名称为 media_library），
--       且缺少 logo_size、logo_align、color_bg、color_card、color_text、
--       member_id_prefix 字段（这些字段只存在于 database.sql 内嵌迁移中）。
--
-- 依赖：migration 027（media_library 表）
-- =============================================================================

CREATE TABLE IF NOT EXISTS brand_settings (
  id               SERIAL PRIMARY KEY,
  brand_name       VARCHAR(100) NOT NULL DEFAULT '',
  company_name     VARCHAR(200) NOT NULL DEFAULT '',
  tagline          VARCHAR(300),
  logo_media_id    INTEGER REFERENCES media_library(id) ON DELETE SET NULL,
  favicon_media_id INTEGER REFERENCES media_library(id) ON DELETE SET NULL,
  logo_size        VARCHAR(10)  NOT NULL DEFAULT 'medium'
                   CHECK (logo_size IN ('small','medium','large')),
  logo_align       VARCHAR(10)  NOT NULL DEFAULT 'left'
                   CHECK (logo_align IN ('left','center','right')),
  primary_color    VARCHAR(20)  NOT NULL DEFAULT '#1d4ed8',
  secondary_color  VARCHAR(20)  NOT NULL DEFAULT '#1e40af',
  theme_mode       VARCHAR(10)  NOT NULL DEFAULT 'light'
                   CHECK (theme_mode IN ('light','dark','system')),
  color_bg         TEXT NOT NULL DEFAULT '#0a0b14',
  color_card       TEXT NOT NULL DEFAULT '#111222',
  color_text       TEXT NOT NULL DEFAULT '#e8e8f5',
  website_domain   VARCHAR(255),
  api_domain       VARCHAR(255),
  support_whatsapp VARCHAR(50),
  support_telegram VARCHAR(100),
  telegram_channel VARCHAR(100),
  facebook_url     VARCHAR(500),
  seo_title        VARCHAR(200),
  seo_description  TEXT,
  seo_keywords     TEXT,
  member_id_prefix VARCHAR(6)   NOT NULL DEFAULT 'SS',
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by       VARCHAR(100)
);
-- erp_domain、instagram_url、tiktok_url、support_email 由 migration 048 添加

CREATE OR REPLACE FUNCTION set_brand_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_brand_updated_at ON brand_settings;
CREATE TRIGGER trg_brand_updated_at
  BEFORE UPDATE ON brand_settings
  FOR EACH ROW EXECUTE FUNCTION set_brand_updated_at();

-- 初始行（空白默认值，部署后通过 ERP Brand Center 填写）
INSERT INTO brand_settings (id, brand_name, company_name, primary_color, secondary_color, theme_mode)
VALUES (1, '', '', '#1d4ed8', '#1e40af', 'light')
ON CONFLICT (id) DO NOTHING;
