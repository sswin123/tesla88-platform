-- Migration 018: Add LIVECHAT_REOPEN_DAYS system setting
-- Controls how long (in days) after a session is closed before a returning
-- customer starts a brand-new conversation instead of reopening the old one.
INSERT INTO system_settings (key, value, description)
VALUES ('LIVECHAT_REOPEN_DAYS', '30',
        'Days after session closure before a new session is created instead of reopening (0 = always reopen)')
ON CONFLICT (key) DO NOTHING;
