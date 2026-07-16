-- Migration 053: Brand Center v3 — Single Source of Truth
-- Adds extended brand identity, assets, contact, SEO, brand links, system info fields.
-- All columns nullable / with defaults so existing rows are unaffected.

ALTER TABLE brand_settings
  -- Brand Identity extensions
  ADD COLUMN IF NOT EXISTS referral_prefix  VARCHAR(20)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS website_name     VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS short_name       VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS description      TEXT         DEFAULT NULL,

  -- Brand Assets (extended) — FK 引用 media_library(id)，与 migration 034/036/038 等保持一致
  ADD COLUMN IF NOT EXISTS loading_logo_media_id INTEGER DEFAULT NULL REFERENCES media_library(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pwa_icon_media_id     INTEGER DEFAULT NULL REFERENCES media_library(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS apple_touch_media_id  INTEGER DEFAULT NULL REFERENCES media_library(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS og_image_media_id     INTEGER DEFAULT NULL REFERENCES media_library(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS share_image_media_id  INTEGER DEFAULT NULL REFERENCES media_library(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS splash_image_media_id INTEGER DEFAULT NULL REFERENCES media_library(id) ON DELETE SET NULL,

  -- Domain
  ADD COLUMN IF NOT EXISTS auto_detect_domain BOOLEAN DEFAULT FALSE,

  -- Contact (extended social platforms)
  ADD COLUMN IF NOT EXISTS support_line      VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS support_wechat    VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS support_messenger VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS support_discord   VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS support_viber     VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS support_x         VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS support_youtube   VARCHAR(255) DEFAULT NULL,

  -- SEO: Open Graph
  ADD COLUMN IF NOT EXISTS og_title          VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS og_description    TEXT         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS og_image_url      VARCHAR(500) DEFAULT NULL,

  -- SEO: Twitter Card
  ADD COLUMN IF NOT EXISTS twitter_card        VARCHAR(50)  DEFAULT 'summary_large_image',
  ADD COLUMN IF NOT EXISTS twitter_title       VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS twitter_description TEXT         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS twitter_image_url   VARCHAR(500) DEFAULT NULL,

  -- SEO: Technical
  ADD COLUMN IF NOT EXISTS canonical_url VARCHAR(500) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS robots        VARCHAR(100) DEFAULT 'index, follow',
  ADD COLUMN IF NOT EXISTS seo_author    VARCHAR(255) DEFAULT NULL,

  -- Brand Links
  ADD COLUMN IF NOT EXISTS link_apk           VARCHAR(500) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS link_ios           VARCHAR(500) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS link_tg_bot        VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS link_tg_channel    VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS link_cs            VARCHAR(500) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS link_referral_base VARCHAR(500) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS link_cdn           VARCHAR(500) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS link_promotion     VARCHAR(500) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS link_vip           VARCHAR(500) DEFAULT NULL,

  -- System Information
  ADD COLUMN IF NOT EXISTS sys_timezone VARCHAR(100) DEFAULT 'Asia/Kuala_Lumpur',
  ADD COLUMN IF NOT EXISTS sys_language VARCHAR(20)  DEFAULT 'zh-CN',
  ADD COLUMN IF NOT EXISTS sys_country  VARCHAR(10)  DEFAULT 'MY',
  ADD COLUMN IF NOT EXISTS sys_locale   VARCHAR(20)  DEFAULT 'ms-MY';

-- DOWN (rollback):
-- ALTER TABLE brand_settings
--   DROP COLUMN IF EXISTS referral_prefix,
--   DROP COLUMN IF EXISTS website_name, DROP COLUMN IF EXISTS short_name, DROP COLUMN IF EXISTS description,
--   DROP COLUMN IF EXISTS loading_logo_media_id, DROP COLUMN IF EXISTS pwa_icon_media_id,
--   DROP COLUMN IF EXISTS apple_touch_media_id, DROP COLUMN IF EXISTS og_image_media_id,
--   DROP COLUMN IF EXISTS share_image_media_id, DROP COLUMN IF EXISTS splash_image_media_id,
--   DROP COLUMN IF EXISTS auto_detect_domain,
--   DROP COLUMN IF EXISTS support_line, DROP COLUMN IF EXISTS support_wechat,
--   DROP COLUMN IF EXISTS support_messenger, DROP COLUMN IF EXISTS support_discord,
--   DROP COLUMN IF EXISTS support_viber, DROP COLUMN IF EXISTS support_x,
--   DROP COLUMN IF EXISTS support_youtube,
--   DROP COLUMN IF EXISTS og_title, DROP COLUMN IF EXISTS og_description,
--   DROP COLUMN IF EXISTS og_image_url, DROP COLUMN IF EXISTS twitter_card,
--   DROP COLUMN IF EXISTS twitter_title, DROP COLUMN IF EXISTS twitter_description,
--   DROP COLUMN IF EXISTS twitter_image_url, DROP COLUMN IF EXISTS canonical_url,
--   DROP COLUMN IF EXISTS robots, DROP COLUMN IF EXISTS seo_author,
--   DROP COLUMN IF EXISTS link_apk, DROP COLUMN IF EXISTS link_ios,
--   DROP COLUMN IF EXISTS link_tg_bot, DROP COLUMN IF EXISTS link_tg_channel,
--   DROP COLUMN IF EXISTS link_cs, DROP COLUMN IF EXISTS link_referral_base,
--   DROP COLUMN IF EXISTS link_cdn, DROP COLUMN IF EXISTS link_promotion,
--   DROP COLUMN IF EXISTS link_vip,
--   DROP COLUMN IF EXISTS sys_timezone, DROP COLUMN IF EXISTS sys_language,
--   DROP COLUMN IF EXISTS sys_country, DROP COLUMN IF EXISTS sys_locale;
