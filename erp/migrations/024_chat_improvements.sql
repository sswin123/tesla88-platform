-- 024_chat_improvements.sql
ALTER TABLE support_messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id  INT         REFERENCES support_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reply_to_content     TEXT,
  ADD COLUMN IF NOT EXISTS reply_to_sender_type VARCHAR(10),
  ADD COLUMN IF NOT EXISTS status               VARCHAR(10) NOT NULL DEFAULT 'SENT'
    CHECK (status IN ('SENT', 'DELIVERED', 'SEEN'));
