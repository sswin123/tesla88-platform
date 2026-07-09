CREATE TABLE IF NOT EXISTS website_announcements (
  id             SERIAL PRIMARY KEY,
  title          VARCHAR(200) NOT NULL,
  message        TEXT         NOT NULL,
  type           VARCHAR(20)  NOT NULL DEFAULT 'info'
                   CHECK (type IN ('info', 'promotion', 'warning')),
  link_url       VARCHAR(500),
  display_order  INTEGER      NOT NULL DEFAULT 0,
  is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
  start_at       TIMESTAMPTZ,
  end_at         TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_announcements_active_order
  ON website_announcements(is_active, display_order, id)
  WHERE is_active = TRUE;
