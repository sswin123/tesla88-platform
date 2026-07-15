-- Migration 044: Game Lobby Icon System
--
-- Adds icon support to category tabs, providers, and games.
-- icon_type: 'none' | 'emoji' | 'image' | 'gif' | 'svg'
-- If icon_type = 'none', website renders nothing (no hardcoded fallback).

-- ── Category Icons ────────────────────────────────────────────────────────────
-- Stores icon per lobby category key (all, hot, slot, live, sport, fishing, ...)
CREATE TABLE IF NOT EXISTS website_lobby_category_icons (
  id            SERIAL PRIMARY KEY,
  category_key  VARCHAR(50) NOT NULL UNIQUE,
  icon_type     VARCHAR(10) NOT NULL DEFAULT 'none'
                  CHECK (icon_type IN ('none','emoji','image','gif','svg')),
  icon_emoji    TEXT,
  icon_media_id INTEGER REFERENCES media_library(id) ON DELETE SET NULL,
  icon_svg      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Provider Icon columns ─────────────────────────────────────────────────────
ALTER TABLE website_game_providers
  ADD COLUMN IF NOT EXISTS icon_type     VARCHAR(10) NOT NULL DEFAULT 'none'
    CHECK (icon_type IN ('none','emoji','image','gif','svg')),
  ADD COLUMN IF NOT EXISTS icon_emoji    TEXT,
  ADD COLUMN IF NOT EXISTS icon_media_id INTEGER REFERENCES media_library(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS icon_svg      TEXT;

-- ── Game Icon columns ─────────────────────────────────────────────────────────
ALTER TABLE website_games
  ADD COLUMN IF NOT EXISTS icon_type     VARCHAR(10) NOT NULL DEFAULT 'none'
    CHECK (icon_type IN ('none','emoji','image','gif','svg')),
  ADD COLUMN IF NOT EXISTS icon_emoji    TEXT,
  ADD COLUMN IF NOT EXISTS icon_media_id INTEGER REFERENCES media_library(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS icon_svg      TEXT;
