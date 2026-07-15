-- Migration 024: Website theme color customization
-- Run once against the live database if these columns are missing.
-- Safe to run multiple times (IF NOT EXISTS).

ALTER TABLE brand_settings ADD COLUMN IF NOT EXISTS color_bg   TEXT NOT NULL DEFAULT '#0a0b14';
ALTER TABLE brand_settings ADD COLUMN IF NOT EXISTS color_card TEXT NOT NULL DEFAULT '#111222';
ALTER TABLE brand_settings ADD COLUMN IF NOT EXISTS color_text TEXT NOT NULL DEFAULT '#e8e8f5';
