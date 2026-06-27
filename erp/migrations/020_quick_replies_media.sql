-- 020_quick_replies_media.sql
--
-- Extend quick_replies to support media (PHOTO / VIDEO / DOCUMENT) in addition
-- to plain TEXT, and add an is_active toggle for enable/disable without delete.
--
-- content_type  — one of TEXT | PHOTO | VIDEO | DOCUMENT
-- media_content — base64 data URI (NULL for TEXT type)
-- is_active     — FALSE hides the reply from the picker without deleting it

ALTER TABLE quick_replies
  ADD COLUMN IF NOT EXISTS content_type  VARCHAR(20) NOT NULL DEFAULT 'TEXT'
    CHECK (content_type IN ('TEXT', 'PHOTO', 'VIDEO', 'DOCUMENT')),
  ADD COLUMN IF NOT EXISTS media_content TEXT,
  ADD COLUMN IF NOT EXISTS is_active     BOOLEAN NOT NULL DEFAULT TRUE;
