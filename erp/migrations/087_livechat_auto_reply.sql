-- 087_livechat_auto_reply.sql
-- Bug fix: Live Chat "Auto-Reply" setting (system_settings.auto_reply_enabled /
-- auto_reply_message) was saved by ERP Settings but never consumed by any send
-- path. This migration unblocks the fix by:
--   1. Allowing a 'SYSTEM' sender_type for automated messages.
--   2. Adding a per-session guard column so the auto-reply fires at most once.

ALTER TABLE support_messages ALTER COLUMN sender_type TYPE VARCHAR(10);
ALTER TABLE support_messages DROP CONSTRAINT IF EXISTS support_messages_sender_type_check;
ALTER TABLE support_messages ADD CONSTRAINT support_messages_sender_type_check
  CHECK (sender_type IN ('USER', 'AGENT', 'SYSTEM'));

ALTER TABLE support_sessions ADD COLUMN IF NOT EXISTS auto_reply_sent_at TIMESTAMPTZ;

-- Sessions that already existed before this migration are not "new" sessions
-- from the auto-reply feature's point of view — mark them as already handled
-- so an ongoing conversation doesn't suddenly receive a "welcome" message.
UPDATE support_sessions SET auto_reply_sent_at = NOW() WHERE auto_reply_sent_at IS NULL;
