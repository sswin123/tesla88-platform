-- ============================================================
-- 062: Member Activity Log (Audit Center v1.0)
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS member_activity_seq START 1;

CREATE TABLE IF NOT EXISTS member_activity_logs (
  id               BIGSERIAL    PRIMARY KEY,
  activity_id      VARCHAR(20)  NOT NULL DEFAULT '',
  member_id        INTEGER      NOT NULL REFERENCES users(id),
  category         VARCHAR(30)  NOT NULL,
  action           VARCHAR(80)  NOT NULL,
  title            VARCHAR(200) NOT NULL,
  description      TEXT,
  amount           NUMERIC(15,2),
  balance_before   NUMERIC(15,2),
  balance_after    NUMERIC(15,2),
  reference_type   VARCHAR(30),
  reference_id     BIGINT,
  operator_type    VARCHAR(10)  NOT NULL DEFAULT 'SYSTEM'
                     CHECK (operator_type IN ('MEMBER','STAFF','SYSTEM')),
  operator_id      INTEGER,
  operator_name    VARCHAR(100),
  source           VARCHAR(20)  NOT NULL DEFAULT 'SYSTEM'
                     CHECK (source IN ('WEBSITE','ERP','TELEGRAM','API','PAYMENT_GATEWAY','SYSTEM')),
  level            VARCHAR(10)  NOT NULL DEFAULT 'INFO'
                     CHECK (level IN ('INFO','WARNING','CRITICAL')),
  ip_address       TEXT,
  device           TEXT,
  remark           TEXT,
  metadata         JSONB,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Auto-generate ACT00000001 style activity_id using a dedicated sequence
CREATE OR REPLACE FUNCTION set_member_activity_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.activity_id := 'ACT' || LPAD(nextval('member_activity_seq')::text, 8, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_member_activity_id ON member_activity_logs;
CREATE TRIGGER trg_member_activity_id
  BEFORE INSERT ON member_activity_logs
  FOR EACH ROW EXECUTE FUNCTION set_member_activity_id();

-- Indexes for performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_mal_activity_id
  ON member_activity_logs(activity_id)
  WHERE activity_id != '';

CREATE INDEX IF NOT EXISTS idx_mal_member_created
  ON member_activity_logs(member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mal_member_category
  ON member_activity_logs(member_id, category);

CREATE INDEX IF NOT EXISTS idx_mal_reference
  ON member_activity_logs(reference_type, reference_id)
  WHERE reference_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mal_created
  ON member_activity_logs(created_at DESC);

-- ERP Role Permissions
INSERT INTO role_permissions (role, permission, granted) VALUES
  ('ADMIN',      'member.activity.view', TRUE),
  ('FINANCE',    'member.activity.view', TRUE),
  ('SUPERVISOR', 'member.activity.view', TRUE),
  ('CS',         'member.activity.view', TRUE)
ON CONFLICT (role, permission) DO NOTHING;
