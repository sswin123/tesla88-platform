-- Add file metadata for rich file cards in ERP live chat.
ALTER TABLE support_messages
  ADD COLUMN IF NOT EXISTS file_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS file_size BIGINT;
