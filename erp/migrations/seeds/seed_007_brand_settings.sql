-- Seed 007: Brand Settings 默认品牌信息
-- 仅在 brand_name 为空时更新（幂等）

UPDATE brand_settings
SET
    brand_name      = 'SSWIN88',
    company_name    = 'SSWIN88 SDN BHD',
    primary_color   = '#1d4ed8',
    secondary_color = '#1e40af',
    theme_mode      = 'dark'
WHERE id = 1
  AND (brand_name IS NULL OR brand_name = '');
