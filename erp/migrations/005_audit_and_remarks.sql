CREATE TABLE IF NOT EXISTS audit_logs (
  id          SERIAL PRIMARY KEY,
  admin_id    INTEGER      NOT NULL REFERENCES admins(id),
  action      VARCHAR(50)  NOT NULL,
  target_type VARCHAR(50)  NOT NULL,
  target_id   INTEGER,
  old_value   JSONB,
  new_value   JSONB,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id   ON audit_logs (admin_id);

-- Manual remarks on member profiles
ALTER TABLE users ADD COLUMN IF NOT EXISTS remarks TEXT;
