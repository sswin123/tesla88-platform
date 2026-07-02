-- 027_media_library.sql
-- Platform-wide Digital Asset Management (DAM) table.
-- Binary files are never stored here — only metadata.
-- storage_key is an opaque token interpreted only by StorageProvider.

CREATE TABLE media_library (
  id                SERIAL PRIMARY KEY,

  -- Multi-tenant preparation (no logic in v1.0; NULL = default tenant)
  tenant_id         INTEGER         NULL,

  -- File identity & deduplication (SHA-256 prevents duplicate storage)
  file_hash         VARCHAR(64)     NOT NULL UNIQUE,
  storage_key       VARCHAR(500)    NOT NULL UNIQUE,
  storage_provider  VARCHAR(10)     NOT NULL DEFAULT 'LOCAL',

  -- Classification
  media_type        VARCHAR(20)     NOT NULL DEFAULT 'UNKNOWN',
  mime_type         VARCHAR(100)    NOT NULL,
  extension         VARCHAR(20)     NOT NULL,

  -- Presentation
  original_filename VARCHAR(255)    NOT NULL,
  display_name      VARCHAR(255)    NOT NULL,

  -- Dimensions & duration (NULL when not applicable)
  file_size         BIGINT          NOT NULL,
  width             INTEGER         NULL,
  height            INTEGER         NULL,
  duration          INTEGER         NULL,

  -- Thumbnail (always NONE in Phase 5.4A; Phase 5.4B adds generation)
  thumbnail_key     VARCHAR(500)    NULL,
  thumbnail_status  VARCHAR(10)     NOT NULL DEFAULT 'NONE',

  -- Extended metadata: EXIF, codec, APK package name, PDF page count, etc.
  metadata          JSONB           NOT NULL DEFAULT '{}',

  -- Usage tracking
  usage_count       INTEGER         NOT NULL DEFAULT 0,
  reference_count   INTEGER         NOT NULL DEFAULT 0,
  last_used_at      TIMESTAMPTZ     NULL,
  last_used_module  VARCHAR(50)     NULL,

  -- Download analytics
  download_count    INTEGER         NOT NULL DEFAULT 0,
  last_downloaded_at TIMESTAMPTZ   NULL,

  -- Audit
  created_by        INTEGER         REFERENCES admins(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  -- Soft delete
  is_active         BOOLEAN         NOT NULL DEFAULT TRUE,
  deleted_at        TIMESTAMPTZ     NULL,
  deleted_by        INTEGER         NULL REFERENCES admins(id) ON DELETE SET NULL,

  CONSTRAINT chk_media_storage_provider CHECK (storage_provider IN ('LOCAL','S3','R2','MINIO','NAS')),
  CONSTRAINT chk_media_type             CHECK (media_type IN ('IMAGE','GIF','VIDEO','AUDIO','VOICE','DOCUMENT','PDF','APK','ZIP','RAR','UNKNOWN')),
  CONSTRAINT chk_thumbnail_status       CHECK (thumbnail_status IN ('NONE','PENDING','READY','FAILED')),
  CONSTRAINT chk_file_size              CHECK (file_size >= 0),
  CONSTRAINT chk_width                  CHECK (width IS NULL OR width >= 0),
  CONSTRAINT chk_height                 CHECK (height IS NULL OR height >= 0),
  CONSTRAINT chk_duration               CHECK (duration IS NULL OR duration >= 0),
  CONSTRAINT chk_usage_count            CHECK (usage_count >= 0),
  CONSTRAINT chk_reference_count        CHECK (reference_count >= 0),
  CONSTRAINT chk_download_count         CHECK (download_count >= 0)
);

CREATE INDEX idx_media_tenant    ON media_library (tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_media_active    ON media_library (is_active, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_media_type      ON media_library (media_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_media_provider  ON media_library (storage_provider);

-- Reusable trigger function (shared with quick_replies in migration 028)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_media_library_updated_at
  BEFORE UPDATE ON media_library
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
