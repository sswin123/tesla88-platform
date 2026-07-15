-- 030_homepage_sections.sql
-- CMS-driven homepage sections table

CREATE TABLE IF NOT EXISTS homepage_sections (
  id            SERIAL       PRIMARY KEY,
  section_type  VARCHAR(50)  NOT NULL,
  name          VARCHAR(100) NOT NULL DEFAULT '',
  config        JSONB        NOT NULL DEFAULT '{}',
  display_order INTEGER      NOT NULL DEFAULT 0,
  is_enabled    BOOLEAN      NOT NULL DEFAULT TRUE,
  start_at      TIMESTAMPTZ,
  end_at        TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_homepage_sections_enabled_order
  ON homepage_sections (is_enabled, display_order);

CREATE OR REPLACE FUNCTION trigger_homepage_sections_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS homepage_sections_updated_at ON homepage_sections;
CREATE TRIGGER homepage_sections_updated_at
  BEFORE UPDATE ON homepage_sections
  FOR EACH ROW EXECUTE FUNCTION trigger_homepage_sections_updated_at();

-- Default sections seeded on first migration
INSERT INTO homepage_sections (section_type, name, display_order, config) VALUES
  ('hero', '横幅轮播', 10,
   '{"slides":[],"autoplay_interval":5000,"show_arrows":true,"show_dots":true}'),
  ('marquee', '跑马灯公告', 20,
   '{"messages":["欢迎来到本平台！","快速存取款，24小时服务","安全可靠，值得信赖"],"speed":40,"color":"#f59e0b","bg_color":"","icon":"📢"}'),
  ('quick_menu', '快捷菜单', 30,
   '{"items":[{"id":"1","label":"存款","emoji":"💰","url":"/deposit","enabled":true,"display_order":0},{"id":"2","label":"提款","emoji":"💳","url":"/withdraw","enabled":true,"display_order":1},{"id":"3","label":"记录","emoji":"📋","url":"/history","enabled":true,"display_order":2},{"id":"4","label":"优惠","emoji":"🎁","url":"/promotions","enabled":true,"display_order":3}],"columns":4}'),
  ('promotions', '精选优惠', 40,
   '{"title":"精选优惠","subtitle":"","show_all_link":"/promotions","max_items":6}'),
  ('providers', '游戏合作伙伴', 50,
   '{"title":"游戏合作伙伴","columns":4}'),
  ('live_tx', '实时交易', 60,
   '{"title":"实时交易","limit":10}')
ON CONFLICT DO NOTHING;
