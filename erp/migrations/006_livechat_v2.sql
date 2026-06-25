-- erp/migrations/006_livechat_v2.sql

-- Add ERP-specific columns to support_sessions
ALTER TABLE support_sessions
  ADD COLUMN IF NOT EXISTS erp_unread_count   INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pinned_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_to_username VARCHAR(100);

-- ── Trigger: pg_notify on new support_messages ──────────────────────────────
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

-- ── Trigger: pg_notify on support_sessions status change ────────────────────
CREATE OR REPLACE FUNCTION notify_livechat_session() RETURNS trigger AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
    OR OLD.erp_unread_count IS DISTINCT FROM NEW.erp_unread_count
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

-- ── Trigger: auto-increment erp_unread_count for USER messages ──────────────
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
