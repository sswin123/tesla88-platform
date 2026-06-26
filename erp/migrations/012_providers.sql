CREATE TABLE IF NOT EXISTS providers (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  description  TEXT,
  logo_url     TEXT,
  status       VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
  sort_order   INT          NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO providers (name, display_name, status, sort_order) VALUES
  ('918Kiss',  '918Kiss',  'ACTIVE', 1),
  ('Mega888',  'Mega888',  'ACTIVE', 2),
  ('Pussy888', 'Pussy888', 'ACTIVE', 3),
  ('Newtown',  'Newtown',  'ACTIVE', 4),
  ('Ace333',   'Ace333',   'ACTIVE', 5),
  ('Live22',   'Live22',   'ACTIVE', 6)
ON CONFLICT (name) DO NOTHING;
