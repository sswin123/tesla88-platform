-- Migration 032: Global Design System
-- Adds design_preset and design_overrides to brand_settings.
-- Safe to run multiple times (IF NOT EXISTS / ON CONFLICT DO NOTHING).

ALTER TABLE brand_settings
  ADD COLUMN IF NOT EXISTS design_preset   TEXT    NOT NULL DEFAULT 'classic_purple',
  ADD COLUMN IF NOT EXISTS design_overrides JSONB  NOT NULL DEFAULT '{}';
