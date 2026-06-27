-- 023_timeline_notify.sql
-- Add user_id to the livechat SSE notification so the ERP timeline can filter
-- new messages by user rather than by session.

CREATE OR REPLACE FUNCTION notify_livechat_message() RETURNS trigger AS $$
DECLARE
  v_user_id INT;
BEGIN
  SELECT user_id INTO v_user_id FROM support_sessions WHERE id = NEW.session_id;
  PERFORM pg_notify('livechat_updates', json_build_object(
    'type',        'new_message',
    'session_id',  NEW.session_id,
    'user_id',     v_user_id,
    'message_id',  NEW.id,
    'sender_type', NEW.sender_type
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
