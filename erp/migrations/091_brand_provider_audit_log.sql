-- 091_brand_provider_audit_log.sql
-- Brand Provider 专属 Audit Log 表
-- 所有针对 brand_provider_config / brand_provider_credentials / brand_provider 的写操作
-- 应写入此表，不再写入全局 gp_config_audit_log。
--
-- gp_config_audit_log 保留给 Legacy Global Provider (918KISS gp_config/gp_credentials) 使用。

CREATE TABLE IF NOT EXISTS brand_provider_audit_log (
  id                 BIGSERIAL PRIMARY KEY,
  brand_provider_id  INTEGER        NOT NULL REFERENCES brand_providers(id) ON DELETE CASCADE,
  brand_code         VARCHAR(50)    NOT NULL,
  provider_code      VARCHAR(50)    NOT NULL,
  admin_id           INTEGER,
  admin_username     VARCHAR(100),
  action             VARCHAR(100)   NOT NULL,
  field_key          VARCHAR(200),
  old_value_hint     TEXT,
  new_value_hint     TEXT,
  ip_address         VARCHAR(100),
  notes              TEXT,
  created_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bp_audit_brand_provider_id
  ON brand_provider_audit_log (brand_provider_id);

CREATE INDEX IF NOT EXISTS idx_bp_audit_created_at
  ON brand_provider_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bp_audit_provider_code
  ON brand_provider_audit_log (provider_code);

CREATE INDEX IF NOT EXISTS idx_bp_audit_action
  ON brand_provider_audit_log (action);
