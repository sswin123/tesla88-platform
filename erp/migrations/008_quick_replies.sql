-- Quick reply categories
CREATE TABLE IF NOT EXISTS quick_reply_categories (
    id         SERIAL      PRIMARY KEY,
    name       VARCHAR(50) NOT NULL UNIQUE,
    sort_order INTEGER     NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO quick_reply_categories (name, sort_order) VALUES
  ('Deposits',   1),
  ('Withdrawals',2),
  ('Technical',  3),
  ('General',    4)
ON CONFLICT DO NOTHING;

-- Quick replies
CREATE TABLE IF NOT EXISTS quick_replies (
    id          SERIAL       PRIMARY KEY,
    category_id INTEGER      REFERENCES quick_reply_categories(id) ON DELETE SET NULL,
    title       VARCHAR(100) NOT NULL,
    body        TEXT         NOT NULL,
    sort_order  INTEGER      NOT NULL DEFAULT 0,
    created_by  VARCHAR(100),
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);

INSERT INTO quick_replies (category_id, title, body, sort_order) VALUES
  (4, 'Please wait',         'Please wait a moment.',                        1),
  (1, 'Send receipt',        'Please upload your deposit receipt.',           2),
  (2, 'Withdrawal approved', 'Your withdrawal has been approved.',            3),
  (3, 'Restart Telegram',    'Please restart Telegram and try again.',        4),
  (4, 'Thank you',           'Thank you for contacting us. Have a nice day.', 5)
ON CONFLICT DO NOTHING;

-- Per-agent favorites
CREATE TABLE IF NOT EXISTS quick_reply_favorites (
    admin_username VARCHAR(100) NOT NULL,
    reply_id       INTEGER      NOT NULL REFERENCES quick_replies(id) ON DELETE CASCADE,
    PRIMARY KEY (admin_username, reply_id)
);

CREATE INDEX IF NOT EXISTS idx_qrf_admin ON quick_reply_favorites(admin_username);
