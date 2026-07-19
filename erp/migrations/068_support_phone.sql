-- Migration 068: Add support_phone to brand_settings
ALTER TABLE brand_settings ADD COLUMN IF NOT EXISTS support_phone VARCHAR(50);
