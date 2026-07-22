-- Seed 005: 首页默认 Banner
-- 幂等：website_banners 表为空时才插入

INSERT INTO website_banners (title, description, link_url, button_text, display_order, is_active)
SELECT
  '欢迎加入 Opulux',
  '全马最安全的网上娱乐平台，提供最新老虎机、真人百家乐、体育博彩',
  '/register',
  '立即注册',
  1,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM website_banners LIMIT 1);

INSERT INTO website_banners (title, description, link_url, button_text, display_order, is_active)
SELECT
  '首存优惠 100%',
  '首次存款即享 100% 赠红，最高 RM 500，立即参与！',
  '/promotions',
  '了解更多',
  2,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM website_banners WHERE title = '首存优惠 100%');
