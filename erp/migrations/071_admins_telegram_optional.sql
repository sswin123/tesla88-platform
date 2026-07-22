-- Migration 071: Make telegram_id optional for ERP-only staff accounts
--
-- The original admins table was designed for Telegram-bot auth (telegram_id NOT NULL).
-- ERP staff accounts created via the Staff Manager use erp_username/erp_password_hash
-- and may not have a Telegram account. This migration drops the NOT NULL constraint
-- so staff can be created without a telegram_id.
--
-- UNIQUE is preserved: two staff rows can both have telegram_id = NULL (PostgreSQL
-- treats each NULL as distinct for UNIQUE purposes), but two rows cannot share the
-- same non-null telegram_id.

ALTER TABLE admins ALTER COLUMN telegram_id DROP NOT NULL;
