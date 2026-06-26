CREATE TABLE IF NOT EXISTS customer_tags (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(50) NOT NULL UNIQUE,
  color      VARCHAR(7)  NOT NULL DEFAULT '#6B7280',  -- hex color e.g. #3B82F6
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_tag_assignments (
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag_id     INT NOT NULL REFERENCES customer_tags(id) ON DELETE CASCADE,
  assigned_by VARCHAR(100) NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_user_tag_assignments_user_id ON user_tag_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tag_assignments_tag_id  ON user_tag_assignments(tag_id);

-- Seed example tags
INSERT INTO customer_tags (name, color) VALUES
  ('VIP',           '#8B5CF6'),
  ('High Roller',   '#EF4444'),
  ('Big Depositor', '#F59E0B'),
  ('Bonus Hunter',  '#F97316'),
  ('High Risk',     '#DC2626'),
  ('Blacklist',     '#111827'),
  ('Inactive',      '#9CA3AF'),
  ('New Member',    '#10B981')
ON CONFLICT (name) DO NOTHING;
