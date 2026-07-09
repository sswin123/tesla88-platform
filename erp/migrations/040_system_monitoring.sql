-- Centralized error logs
CREATE TABLE IF NOT EXISTS error_logs (
  id          SERIAL       PRIMARY KEY,
  service     VARCHAR(50)  NOT NULL,
  level       VARCHAR(20)  NOT NULL DEFAULT 'error',
  message     TEXT         NOT NULL,
  metadata    JSONB,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_error_logs_created  ON error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_service  ON error_logs(service, created_at DESC);

-- Backup metadata tracking
CREATE TABLE IF NOT EXISTS system_backups (
  id               SERIAL       PRIMARY KEY,
  filename         VARCHAR(255) NOT NULL,
  file_size_bytes  BIGINT,
  status           VARCHAR(20)  NOT NULL DEFAULT 'pending',
  notes            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
