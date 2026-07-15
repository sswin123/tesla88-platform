-- Migration 025: Logo size and alignment settings
-- Safe to run multiple times (IF NOT EXISTS / IF NOT EXISTS).

ALTER TABLE brand_settings ADD COLUMN IF NOT EXISTS logo_size  VARCHAR(10) NOT NULL DEFAULT 'medium';
ALTER TABLE brand_settings ADD COLUMN IF NOT EXISTS logo_align VARCHAR(10) NOT NULL DEFAULT 'left';
