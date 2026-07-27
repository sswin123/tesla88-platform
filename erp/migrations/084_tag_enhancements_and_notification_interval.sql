-- 084_tag_enhancements_and_notification_interval.sql
-- Adds sort_order, is_active, updated_at to customer_tags.
-- Seeds default notification reminder interval in system_settings.

ALTER TABLE customer_tags
  ADD COLUMN IF NOT EXISTS sort_order  INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Back-fill sort_order alphabetically for existing rows
UPDATE customer_tags
SET sort_order = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name) AS rn FROM customer_tags
) sub
WHERE customer_tags.id = sub.id;

INSERT INTO system_settings (key, value, description)
VALUES (
  'notification_reminder_interval_ms',
  '3000',
  'Interval (ms) between repeated transaction reminder beeps. Range: 1000-10000ms, integers only.'
)
ON CONFLICT (key) DO NOTHING;
