-- Migration 029: Allow website-only user registration
-- Website users don't require Telegram; bank info filled via profile later

ALTER TABLE users ALTER COLUMN telegram_id DROP NOT NULL;
ALTER TABLE users ALTER COLUMN bank_name DROP NOT NULL;
ALTER TABLE users ALTER COLUMN bank_account DROP NOT NULL;
ALTER TABLE users ALTER COLUMN bank_holder_name DROP NOT NULL;
