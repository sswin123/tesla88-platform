-- 026_bot_settings_missing_keys.sql
-- Adds bot_name and bot_relay_url that were omitted from migration 025.
-- Safe: ON CONFLICT DO NOTHING.

INSERT INTO system_settings (key, value, description) VALUES
  ('bot_name',      '', 'Telegram bot display name'),
  ('bot_relay_url', '', 'Relay URL override (informational; ERP uses BOT_RELAY_URL env var)')
ON CONFLICT (key) DO NOTHING;
