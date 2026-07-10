-- Add source column to support_sessions to track where a session was initiated
ALTER TABLE support_sessions ADD COLUMN IF NOT EXISTS source VARCHAR(20);

-- Default existing sessions with telegram_id to 'telegram', others to 'website'
UPDATE support_sessions ss
SET source = CASE
  WHEN u.telegram_id IS NOT NULL THEN 'telegram'
  WHEN ss.guest_id IS NOT NULL   THEN 'website_guest'
  ELSE 'website'
END
FROM users u
WHERE ss.user_id = u.id AND ss.source IS NULL;

-- Guest sessions have no user row
UPDATE support_sessions SET source = 'website_guest' WHERE source IS NULL AND guest_id IS NOT NULL;
UPDATE support_sessions SET source = 'telegram'      WHERE source IS NULL;
