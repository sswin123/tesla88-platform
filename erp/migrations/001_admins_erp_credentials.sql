-- Add ERP web login columns to the existing admins table.
-- The bot's telegram_id-based auth is not touched.
-- Idempotent: safe to run multiple times.
ALTER TABLE admins
    ADD COLUMN IF NOT EXISTS erp_username      VARCHAR(100) UNIQUE,
    ADD COLUMN IF NOT EXISTS erp_password_hash VARCHAR(255),
    ADD COLUMN IF NOT EXISTS is_active         BOOLEAN NOT NULL DEFAULT TRUE;
