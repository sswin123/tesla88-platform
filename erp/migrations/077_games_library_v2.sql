-- ═════════════════════════════════════════════════════════════════════════════
-- Migration 077: Games Library V2 — Multi-Provider Commercial Architecture
--
-- Extends gp_games with the full set of display and operational fields needed
-- for the ERP Games Library and the Website Game Center.
--
-- Adds gp_game_categories for ERP-managed dynamic game categories.
--
-- All changes are idempotent (ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS).
-- Zero breaking changes to existing tables or APIs.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. Extend gp_games ────────────────────────────────────────────────────────

-- Display fields (editable by admin, override synced values)
ALTER TABLE gp_games
  ADD COLUMN IF NOT EXISTS display_name      VARCHAR(200),          -- admin override for game name
  ADD COLUMN IF NOT EXISTS description       TEXT,                  -- short description / tagline
  ADD COLUMN IF NOT EXISTS thumbnail_url     TEXT,                  -- 1:1 thumbnail (separate from icon)
  ADD COLUMN IF NOT EXISTS category          VARCHAR(30)  NOT NULL DEFAULT 'slot',
    -- slot | live | sport | fishing | lottery | arcade | crash | virtual
  ADD COLUMN IF NOT EXISTS subcategory       VARCHAR(50),           -- optional sub-grouping

-- Visibility flags
  ADD COLUMN IF NOT EXISTS visible           BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS featured          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS recommended       BOOLEAN NOT NULL DEFAULT FALSE,

-- Platform support
  ADD COLUMN IF NOT EXISTS desktop_supported BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS mobile_supported  BOOLEAN NOT NULL DEFAULT TRUE,

-- Import mode: how the game was created
  ADD COLUMN IF NOT EXISTS import_mode       VARCHAR(10) NOT NULL DEFAULT 'API',
    -- API: synced from provider game-list API
    -- MANUAL: created manually by admin (providers with no game-list API)

-- Launch mode: how the website should launch this game
  ADD COLUMN IF NOT EXISTS launch_mode       VARCHAR(15) NOT NULL DEFAULT 'DIRECT';
    -- LOBBY       – ignore game_code, send player to provider H5 lobby
    -- DIRECT      – pass game_code to launch API
    -- EXTERNAL    – open external URL (sportsbook etc.)
    -- DOWNLOAD    – link to app download page
    -- COMING_SOON – greyed-out card, no launch

-- Populate category from game_type for existing rows (best-effort mapping)
UPDATE gp_games SET category =
  CASE game_type
    WHEN 1 THEN 'slot'         -- SLOT
    WHEN 2 THEN 'arcade'       -- ARCADE
    WHEN 3 THEN 'live'         -- TABLE
    WHEN 4 THEN 'fishing'      -- FISHING
    WHEN 5 THEN 'live'         -- LIVE_CASINO
    ELSE         'slot'
  END
WHERE category = 'slot';     -- only update rows that still have the default

-- Add compound index for website Game Center queries
CREATE INDEX IF NOT EXISTS idx_gp_games_category_sort
  ON gp_games (category, visible, sort_order);

CREATE INDEX IF NOT EXISTS idx_gp_games_featured
  ON gp_games (featured, visible) WHERE featured = TRUE;

CREATE INDEX IF NOT EXISTS idx_gp_games_hot
  ON gp_games (is_hot, visible) WHERE is_hot = TRUE;

CREATE INDEX IF NOT EXISTS idx_gp_games_recommended
  ON gp_games (recommended, visible) WHERE recommended = TRUE;


-- ── 2. Dynamic Game Categories ────────────────────────────────────────────────
-- Managed entirely in ERP — website reads via /api/public/game-categories.

CREATE TABLE IF NOT EXISTS gp_game_categories (
  id           SERIAL        PRIMARY KEY,
  code         VARCHAR(30)   NOT NULL UNIQUE,  -- matches gp_games.category
  name         VARCHAR(100)  NOT NULL,          -- display name (Chinese + English)
  icon         VARCHAR(10),                     -- emoji icon for tab bar
  sort_order   INTEGER       NOT NULL DEFAULT 0,
  is_active    BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gp_categories_active_sort
  ON gp_game_categories (is_active, sort_order);

-- Seed default categories (idempotent)
INSERT INTO gp_game_categories (code, name, icon, sort_order) VALUES
  ('slot',    '老虎机 Slot',         '🎰', 1),
  ('live',    '真人娱乐 Live',        '🎲', 2),
  ('sport',   '体育博彩 Sport',       '⚽', 3),
  ('fishing', '捕鱼游戏 Fishing',     '🎣', 4),
  ('lottery', '彩票 Lottery',         '🎱', 5),
  ('arcade',  '街机游戏 Arcade',      '👾', 6),
  ('crash',   '崩溃游戏 Crash',       '🚀', 7),
  ('virtual', '虚拟体育 Virtual',     '🏆', 8)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, icon = EXCLUDED.icon;
