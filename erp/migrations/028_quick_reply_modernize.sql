-- 028_quick_reply_modernize.sql
-- Phase 5.4C: ERP Communication Asset Center schema.
-- NOTE: media_content column NOT dropped — deferred to Phase 5.4D.

-- 1. Drop old CHECK constraint (TEXT | PHOTO | VIDEO | DOCUMENT)
ALTER TABLE quick_replies
  DROP CONSTRAINT IF EXISTS quick_replies_content_type_check;

-- 2. Rename legacy PHOTO → IMAGE (must run before new constraint)
UPDATE quick_replies SET content_type = 'IMAGE' WHERE content_type = 'PHOTO';

-- 3. New CHECK constraint — 11 types
ALTER TABLE quick_replies
  ADD CONSTRAINT quick_replies_content_type_check
  CHECK (content_type IN (
    'TEXT','IMAGE','GIF','VIDEO','AUDIO','VOICE',
    'DOCUMENT','PDF','APK','ZIP','RAR'
  ));

-- 4. Media FK (ON DELETE SET NULL — deleting a media file clears the reference)
ALTER TABLE quick_replies
  ADD COLUMN IF NOT EXISTS media_id INTEGER REFERENCES media_library(id) ON DELETE SET NULL;

-- 5. Caption (optional for all types)
ALTER TABLE quick_replies
  ADD COLUMN IF NOT EXISTS caption TEXT;

-- 6. updated_at + trigger
ALTER TABLE quick_replies
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS trg_quick_replies_updated_at ON quick_replies;
CREATE TRIGGER trg_quick_replies_updated_at
  BEFORE UPDATE ON quick_replies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 7. Usage tracking (who sent it, when, how many times)
ALTER TABLE quick_replies
  ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE quick_replies
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
ALTER TABLE quick_replies
  ADD COLUMN IF NOT EXISTS used_by VARCHAR(100);

-- 8. Audit: who last edited
ALTER TABLE quick_replies
  ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);

-- 9. Pinned replies — always appear first in the list
ALTER TABLE quick_replies
  ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE;

-- 10. Archive/Restore (soft-hide, separate from is_active and permanent delete)
--     NULL = active, NOT NULL = archived (recoverable)
ALTER TABLE quick_replies
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE quick_replies
  ADD COLUMN IF NOT EXISTS archived_by VARCHAR(100);

-- 11. Indexes
CREATE INDEX IF NOT EXISTS idx_quick_replies_media_id
  ON quick_replies (media_id) WHERE media_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quick_replies_pinned
  ON quick_replies (pinned) WHERE pinned = TRUE;
CREATE INDEX IF NOT EXISTS idx_quick_replies_last_used
  ON quick_replies (last_used_at DESC NULLS LAST) WHERE last_used_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quick_replies_archived
  ON quick_replies (archived_at) WHERE archived_at IS NOT NULL;
