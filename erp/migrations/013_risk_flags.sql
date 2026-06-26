CREATE TABLE IF NOT EXISTS risk_flags (
  id           SERIAL PRIMARY KEY,
  user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  risk_type    VARCHAR(50) NOT NULL,
  severity     VARCHAR(10) NOT NULL DEFAULT 'MEDIUM',
  status       VARCHAR(10) NOT NULL DEFAULT 'OPEN',
  note         TEXT,
  flagged_by   VARCHAR(100),
  reviewed_by  VARCHAR(100),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_risk_flags_user_id ON risk_flags(user_id);
CREATE INDEX IF NOT EXISTS idx_risk_flags_status ON risk_flags(status);
