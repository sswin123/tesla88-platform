-- Migration 052: Registration System
-- 1. Add register_source to users (ERP / WEBSITE / BOT / API)
-- 2. Add vip_level to users
-- 3. Add system_settings for website registration control + validation rules
-- 4. Add financial display settings for website

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS register_source TEXT NOT NULL DEFAULT 'WEBSITE'
    CHECK (register_source IN ('ERP', 'WEBSITE', 'BOT', 'API')),
  ADD COLUMN IF NOT EXISTS vip_level       INTEGER NOT NULL DEFAULT 0;

-- System settings: registration control
INSERT INTO system_settings (key, value, description) VALUES
  ('website_registration', 'false',  'Allow self-registration on website (true=open, false=closed)'),
  ('phone_unique',         'true',   'Reject duplicate phone numbers during registration'),
  ('bank_unique',          'true',   'Reject duplicate bank account during registration'),
  ('email_unique',         'false',  'Reject duplicate email during registration'),
  ('telegram_unique',      'false',  'Reject duplicate Telegram username during registration')
ON CONFLICT (key) DO NOTHING;

-- Financial display settings (aligned with existing public/settings API keys)
INSERT INTO system_settings (key, value, description) VALUES
  ('website_currency',       'RM',    'Currency symbol shown on website (e.g. RM, SGD, USD)'),
  ('deposit_min_amount',     '30',    'Minimum deposit amount'),
  ('deposit_max_amount',     '10000', 'Maximum deposit amount'),
  ('withdraw_min_amount',    '50',    'Minimum withdrawal amount'),
  ('withdraw_max_amount',    '10000', 'Maximum withdrawal amount'),
  ('website_decimal_places', '2',     'Decimal places for amount display (0, 2, 3)')
ON CONFLICT (key) DO NOTHING;
