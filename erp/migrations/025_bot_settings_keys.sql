-- 025_bot_settings_keys.sql
-- Adds bot business configuration keys to system_settings.
-- Safe: ON CONFLICT DO NOTHING preserves any existing values.

INSERT INTO system_settings (key, value, description) VALUES
  -- Bot Identity (token stays in .env; these are informational)
  ('bot_username',               '',       'Telegram bot username without @'),
  ('bot_description',            '',       'Bot description shown in Telegram'),
  ('bot_language',               'en',     'Bot language code (e.g. en, zh, ms)'),
  ('support_chat_id',            '0',      'Telegram group ID for support forwarding (0 = disabled)'),

  -- Relay Configuration
  ('relay_timeout_secs',         '30',     'Relay HTTP request timeout in seconds'),
  ('relay_retry_count',          '3',      'Number of relay retry attempts on failure'),
  ('relay_retry_delay_secs',     '1',      'Delay between relay retries in seconds'),

  -- Notification Switches (ERP checks these before calling relay notify endpoints)
  ('notify_deposit',             'true',   'Send Telegram notification on deposit status change'),
  ('notify_withdrawal',          'true',   'Send Telegram notification on withdrawal status change'),
  ('notify_promotion',           'true',   'Send Telegram notification when promotion is applied'),
  ('notify_bonus',               'true',   'Send Telegram notification when bonus is awarded'),
  ('notify_announcement',        'true',   'Send Telegram notification for announcements'),
  ('notify_broadcast',           'true',   'Send Telegram notification for broadcasts'),
  ('notify_support',             'true',   'Send Telegram notification on support session open/close'),
  ('notify_maintenance',         'true',   'Send Telegram notification when maintenance mode changes')
ON CONFLICT (key) DO NOTHING;
