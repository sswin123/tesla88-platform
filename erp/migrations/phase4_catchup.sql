-- =============================================================================
-- phase4_catchup.sql
--
-- Safe catch-up migration for databases initialised from an older database.sql
-- before Phase 4 additions were merged.
--
-- Covers migrations 006 through 016.
-- Every statement uses IF NOT EXISTS, DROP … IF EXISTS, or ON CONFLICT so it
-- is idempotent: running it on a database that already has some or all of these
-- changes is safe and will not destroy data.
--
-- Apply with:
--   docker compose exec db psql -U postgres -d member_bot -f /tmp/phase4_catchup.sql
-- or:
--   psql "postgresql://USER:PASS@HOST:5432/member_bot" -f phase4_catchup.sql
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 006 · Live Chat v2 — ERP columns + pg_notify triggers
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE support_sessions
  ADD COLUMN IF NOT EXISTS erp_unread_count     INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pinned_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_to_username VARCHAR(100);

-- Trigger: pg_notify on new support_message insert
CREATE OR REPLACE FUNCTION notify_livechat_message() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('livechat_updates', json_build_object(
    'type',        'new_message',
    'session_id',  NEW.session_id,
    'message_id',  NEW.id,
    'sender_type', NEW.sender_type
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS livechat_msg_notify ON support_messages;
CREATE TRIGGER livechat_msg_notify
  AFTER INSERT ON support_messages
  FOR EACH ROW EXECUTE FUNCTION notify_livechat_message();

-- Trigger: pg_notify on support_session status / unread / assignment change
CREATE OR REPLACE FUNCTION notify_livechat_session() RETURNS trigger AS $$
BEGIN
  IF OLD.status                IS DISTINCT FROM NEW.status
    OR OLD.erp_unread_count    IS DISTINCT FROM NEW.erp_unread_count
    OR OLD.assigned_to_username IS DISTINCT FROM NEW.assigned_to_username
  THEN
    PERFORM pg_notify('livechat_updates', json_build_object(
      'type',       'session_update',
      'session_id', NEW.id,
      'status',     NEW.status
    )::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS livechat_session_notify ON support_sessions;
CREATE TRIGGER livechat_session_notify
  AFTER UPDATE ON support_sessions
  FOR EACH ROW EXECUTE FUNCTION notify_livechat_session();

-- Trigger: auto-increment erp_unread_count for USER messages
CREATE OR REPLACE FUNCTION increment_erp_unread() RETURNS trigger AS $$
BEGIN
  IF NEW.sender_type = 'USER' THEN
    UPDATE support_sessions
    SET erp_unread_count = erp_unread_count + 1
    WHERE id = NEW.session_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS livechat_unread_increment ON support_messages;
CREATE TRIGGER livechat_unread_increment
  AFTER INSERT ON support_messages
  FOR EACH ROW EXECUTE FUNCTION increment_erp_unread();


-- ─────────────────────────────────────────────────────────────────────────────
-- 007 · support_messages: caption column + extended message_type CHECK
-- ─────────────────────────────────────────────────────────────────────────────

-- Ensure the column is wide enough for 'VIDEO_NOTE' (10 chars)
ALTER TABLE support_messages
  ALTER COLUMN message_type TYPE VARCHAR(20);

-- Replace the CHECK constraint atomically (DROP then ADD = always idempotent)
ALTER TABLE support_messages
  DROP CONSTRAINT IF EXISTS support_messages_message_type_check;

ALTER TABLE support_messages
  ADD CONSTRAINT support_messages_message_type_check
  CHECK (message_type IN (
    'TEXT', 'PHOTO', 'DOCUMENT', 'VOICE', 'STICKER',
    'VIDEO', 'VIDEO_NOTE', 'AUDIO', 'ANIMATION', 'OTHER'
  ));

-- Optional caption for media messages (photo, video, etc.)
ALTER TABLE support_messages
  ADD COLUMN IF NOT EXISTS caption TEXT;


-- ─────────────────────────────────────────────────────────────────────────────
-- 008 · Quick replies
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quick_reply_categories (
    id         SERIAL      PRIMARY KEY,
    name       VARCHAR(50) NOT NULL UNIQUE,
    sort_order INTEGER     NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO quick_reply_categories (name, sort_order) VALUES
  ('Deposits',    1),
  ('Withdrawals', 2),
  ('Technical',   3),
  ('General',     4)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS quick_replies (
    id          SERIAL       PRIMARY KEY,
    category_id INTEGER      REFERENCES quick_reply_categories(id) ON DELETE SET NULL,
    title       VARCHAR(100) NOT NULL,
    body        TEXT         NOT NULL,
    sort_order  INTEGER      NOT NULL DEFAULT 0,
    created_by  VARCHAR(100),
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);

INSERT INTO quick_replies (category_id, title, body, sort_order) VALUES
  (4, 'Please wait',         'Please wait a moment.',                        1),
  (1, 'Send receipt',        'Please upload your deposit receipt.',           2),
  (2, 'Withdrawal approved', 'Your withdrawal has been approved.',            3),
  (3, 'Restart Telegram',    'Please restart Telegram and try again.',        4),
  (4, 'Thank you',           'Thank you for contacting us. Have a nice day.', 5)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS quick_reply_favorites (
    admin_username VARCHAR(100) NOT NULL,
    reply_id       INTEGER      NOT NULL REFERENCES quick_replies(id) ON DELETE CASCADE,
    PRIMARY KEY (admin_username, reply_id)
);

CREATE INDEX IF NOT EXISTS idx_qrf_admin ON quick_reply_favorites(admin_username);


-- ─────────────────────────────────────────────────────────────────────────────
-- 009 · Session notes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS session_notes (
    id         SERIAL       PRIMARY KEY,
    session_id INTEGER      NOT NULL REFERENCES support_sessions(id) ON DELETE CASCADE,
    author     VARCHAR(100) NOT NULL,
    body       TEXT         NOT NULL,
    created_at TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_notes_session ON session_notes(session_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 010 · users.last_seen_at
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen_at);


-- ─────────────────────────────────────────────────────────────────────────────
-- 011 · Customer tags
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_tags (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(50) NOT NULL UNIQUE,
  color      VARCHAR(7)  NOT NULL DEFAULT '#6B7280',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_tag_assignments (
  user_id     INT          NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  tag_id      INT          NOT NULL REFERENCES customer_tags(id) ON DELETE CASCADE,
  assigned_by VARCHAR(100) NOT NULL,
  assigned_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_user_tag_assignments_user_id ON user_tag_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tag_assignments_tag_id  ON user_tag_assignments(tag_id);

INSERT INTO customer_tags (name, color) VALUES
  ('VIP',           '#8B5CF6'),
  ('High Roller',   '#EF4444'),
  ('Big Depositor', '#F59E0B'),
  ('Bonus Hunter',  '#F97316'),
  ('High Risk',     '#DC2626'),
  ('Blacklist',     '#111827'),
  ('Inactive',      '#9CA3AF'),
  ('New Member',    '#10B981')
ON CONFLICT (name) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 012 · Providers table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS providers (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  description  TEXT,
  logo_url     TEXT,
  status       VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
  sort_order   INT          NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO providers (name, display_name, status, sort_order) VALUES
  ('918Kiss',  '918Kiss',  'ACTIVE', 1),
  ('Mega888',  'Mega888',  'ACTIVE', 2),
  ('Pussy888', 'Pussy888', 'ACTIVE', 3),
  ('Newtown',  'Newtown',  'ACTIVE', 4),
  ('Ace333',   'Ace333',   'ACTIVE', 5),
  ('Live22',   'Live22',   'ACTIVE', 6)
ON CONFLICT (name) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 013 · Risk flags
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS risk_flags (
  id           SERIAL PRIMARY KEY,
  user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  risk_type    VARCHAR(50) NOT NULL,
  severity     VARCHAR(10) NOT NULL DEFAULT 'MEDIUM',
  status       VARCHAR(10) NOT NULL DEFAULT 'OPEN',
  note         TEXT,
  flagged_by   VARCHAR(100),
  reviewed_by  VARCHAR(100),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_flags_user_id ON risk_flags(user_id);
CREATE INDEX IF NOT EXISTS idx_risk_flags_status  ON risk_flags(status);


-- ─────────────────────────────────────────────────────────────────────────────
-- 014 · Announcements
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS announcements (
  id            SERIAL PRIMARY KEY,
  title         VARCHAR(255) NOT NULL,
  content       TEXT NOT NULL,
  type          VARCHAR(20) NOT NULL DEFAULT 'BANNER',
  target        VARCHAR(20) NOT NULL DEFAULT 'ALL',
  target_tag_id INT REFERENCES customer_tags(id) ON DELETE SET NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  start_at      TIMESTAMPTZ,
  end_at        TIMESTAMPTZ,
  created_by    VARCHAR(100) NOT NULL,
  sent_count    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_status   ON announcements(status);
CREATE INDEX IF NOT EXISTS idx_announcements_start_at ON announcements(start_at);


-- ─────────────────────────────────────────────────────────────────────────────
-- 015 · System settings
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS system_settings (
  key         VARCHAR(100) PRIMARY KEY,
  value       TEXT NOT NULL DEFAULT '',
  description TEXT,
  updated_by  VARCHAR(100),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_settings (key, value, description) VALUES
  ('bot_name',           'Support Bot',       'Telegram bot display name'),
  ('timezone',           'Asia/Kuala_Lumpur', 'Server timezone'),
  ('session_timeout_min','60',                'Livechat session timeout in minutes'),
  ('notif_sound',        'true',              'Enable notification sound by default'),
  ('max_upload_mb',      '20',                'Maximum media upload size in MB'),
  ('retention_days',     '90',                'Message retention in days'),
  ('maintenance_mode',   'false',             'Maintenance mode — blocks new logins'),
  ('auto_reply_enabled', 'false',             'Enable auto-reply for new sessions'),
  ('auto_reply_message', '',                  'Auto-reply message text'),
  ('bot_relay_url',      '',                  'Override BOT_RELAY_URL from env'),
  ('company_name',       'ERP Admin',         'Company name shown in header')
ON CONFLICT (key) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 016 · Admin roles — is_active, added_by_username, extended role CHECK
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE admins ADD COLUMN IF NOT EXISTS is_active         BOOLEAN      NOT NULL DEFAULT TRUE;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS added_by_username VARCHAR(100);

-- Drop the old role constraint (if it exists under any name) then add the new one.
-- The DO block swallows any error so it is safe even if the constraint is absent.
DO $$
BEGIN
  ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_role_check;
EXCEPTION WHEN others THEN NULL;
END $$;

ALTER TABLE admins
  ADD CONSTRAINT admins_role_check
  CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'CS', 'FINANCE', 'SUPERVISOR', 'SUPPORT'));


-- =============================================================================
-- Verification
-- Run these two queries after the migration to confirm success.
-- Both must return without error (zero rows is fine — the columns must exist).
--
--   SELECT caption    FROM support_messages LIMIT 1;
--   SELECT last_seen_at FROM users          LIMIT 1;
--
-- Then confirm the Live Chat API:
--   curl -b "erp_session=<token>" http://localhost:3000/api/livechat/sessions/1
--   Expected: HTTP 200 (or 404 if session 1 doesn't exist — NOT 500)
-- =============================================================================
