-- Seed 004: 示范游戏（Website Games）
-- 幂等：ON CONFLICT (game_code, COALESCE(provider_id, 0)) DO NOTHING

INSERT INTO website_games (provider_id, game_code, game_name, category, is_hot, is_new, is_active, source, display_order)
SELECT p.id, 'PGSOFT_MJ',       'Mahjong Ways',       'slot', TRUE,  FALSE, TRUE, 'manual', 1
  FROM website_game_providers p WHERE p.provider_code = 'PGSOFT'
ON CONFLICT (game_code, COALESCE(provider_id, 0)) DO NOTHING;

INSERT INTO website_games (provider_id, game_code, game_name, category, is_hot, is_new, is_active, source, display_order)
SELECT p.id, 'PGSOFT_GW',       'Gems Wizard',         'slot', FALSE, TRUE,  TRUE, 'manual', 2
  FROM website_game_providers p WHERE p.provider_code = 'PGSOFT'
ON CONFLICT (game_code, COALESCE(provider_id, 0)) DO NOTHING;

INSERT INTO website_games (provider_id, game_code, game_name, category, is_hot, is_new, is_active, source, display_order)
SELECT p.id, 'PRAGMATIC_GATES', 'Gates of Olympus',   'slot', TRUE,  FALSE, TRUE, 'manual', 3
  FROM website_game_providers p WHERE p.provider_code = 'PRAGMATIC'
ON CONFLICT (game_code, COALESCE(provider_id, 0)) DO NOTHING;

INSERT INTO website_games (provider_id, game_code, game_name, category, is_hot, is_new, is_active, source, display_order)
SELECT p.id, 'PRAGMATIC_SWL',   'Sweet Bonanza',       'slot', TRUE,  FALSE, TRUE, 'manual', 4
  FROM website_game_providers p WHERE p.provider_code = 'PRAGMATIC'
ON CONFLICT (game_code, COALESCE(provider_id, 0)) DO NOTHING;

INSERT INTO website_games (provider_id, game_code, game_name, category, is_hot, is_new, is_active, source, display_order)
SELECT p.id, 'EVOLUTION_BAC',   'Baccarat A',          'live', TRUE,  FALSE, TRUE, 'manual', 10
  FROM website_game_providers p WHERE p.provider_code = 'EVOLUTION'
ON CONFLICT (game_code, COALESCE(provider_id, 0)) DO NOTHING;

INSERT INTO website_games (provider_id, game_code, game_name, category, is_hot, is_new, is_active, source, display_order)
SELECT p.id, 'EVOLUTION_ROUL',  'Roulette Live',       'live', FALSE, TRUE,  TRUE, 'manual', 11
  FROM website_game_providers p WHERE p.provider_code = 'EVOLUTION'
ON CONFLICT (game_code, COALESCE(provider_id, 0)) DO NOTHING;
