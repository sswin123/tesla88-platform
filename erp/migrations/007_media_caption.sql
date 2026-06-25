-- erp/migrations/007_media_caption.sql

-- Widen message_type column and extend the CHECK constraint with new media types
ALTER TABLE support_messages
  ALTER COLUMN message_type TYPE VARCHAR(20);

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
