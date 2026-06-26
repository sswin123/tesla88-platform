CREATE TABLE IF NOT EXISTS system_settings (
  key         VARCHAR(100) PRIMARY KEY,
  value       TEXT NOT NULL DEFAULT '',
  description TEXT,
  updated_by  VARCHAR(100),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_settings (key, value, description) VALUES
  ('bot_name',           'Support Bot',        'Telegram bot display name'),
  ('timezone',           'Asia/Kuala_Lumpur',  'Server timezone'),
  ('session_timeout_min','60',                 'Livechat session timeout in minutes'),
  ('notif_sound',        'true',               'Enable notification sound by default'),
  ('max_upload_mb',      '20',                 'Maximum media upload size in MB'),
  ('retention_days',     '90',                 'Message retention in days'),
  ('maintenance_mode',   'false',              'Maintenance mode — blocks new logins'),
  ('auto_reply_enabled', 'false',              'Enable auto-reply for new sessions'),
  ('auto_reply_message', '',                   'Auto-reply message text'),
  ('bot_relay_url',      '',                   'Override BOT_RELAY_URL from env'),
  ('company_name',       'ERP Admin',          'Company name shown in header')
ON CONFLICT (key) DO NOTHING;
