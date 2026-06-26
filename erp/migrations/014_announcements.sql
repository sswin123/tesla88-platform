CREATE TABLE IF NOT EXISTS announcements (
  id           SERIAL PRIMARY KEY,
  title        VARCHAR(255) NOT NULL,
  content      TEXT NOT NULL,
  type         VARCHAR(20) NOT NULL DEFAULT 'BANNER',
  target       VARCHAR(20) NOT NULL DEFAULT 'ALL',
  target_tag_id INT REFERENCES customer_tags(id) ON DELETE SET NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  start_at     TIMESTAMPTZ,
  end_at       TIMESTAMPTZ,
  created_by   VARCHAR(100) NOT NULL,
  sent_count   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_announcements_status ON announcements(status);
CREATE INDEX IF NOT EXISTS idx_announcements_start_at ON announcements(start_at);
