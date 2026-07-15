-- Seed 003: 网站游戏供应商（Website Game Providers）
-- 幂等：ON CONFLICT (provider_code) DO NOTHING

INSERT INTO website_game_providers (provider_code, provider_name, category, is_active, display_order) VALUES
  ('PGSOFT',     'PG Soft',         'slot',   TRUE,  1),
  ('PRAGMATIC',  'Pragmatic Play',  'slot',   TRUE,  2),
  ('JOKER',      'Joker Gaming',    'slot',   TRUE,  3),
  ('LIVE22',     'Live22',          'slot',   TRUE,  4),
  ('SPADEGAMING','Spade Gaming',    'slot',   TRUE,  5),
  ('JDB',        'JDB Gaming',      'slot',   TRUE,  6),
  ('EVOLUTION',  'Evolution',       'live',   TRUE, 10),
  ('SAGAMING',   'SA Gaming',       'live',   TRUE, 11),
  ('DREAMGAMING','Dream Gaming',    'live',   TRUE, 12),
  ('EBET',       'EBET',            'live',   TRUE, 13)
ON CONFLICT (provider_code) DO NOTHING;
