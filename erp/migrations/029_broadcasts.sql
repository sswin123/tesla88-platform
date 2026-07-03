-- erp/migrations/029_broadcasts.sql
-- Phase 5.5 — Broadcast Center
-- Depends on: 027_media_library.sql (media_library table, set_updated_at function)

CREATE TABLE broadcasts (
  id               SERIAL        PRIMARY KEY,
  title            VARCHAR(255)  NOT NULL,
  content_type     VARCHAR(20)   NOT NULL DEFAULT 'TEXT'
                   CHECK (content_type IN ('TEXT','IMAGE','GIF','VIDEO','AUDIO','DOCUMENT','PDF','APK','ZIP','RAR')),
  body             TEXT          NOT NULL DEFAULT '',
  caption          VARCHAR(1024),
  media_id         INT           REFERENCES media_library(id) ON DELETE SET NULL,
  channels         TEXT[]        NOT NULL DEFAULT ARRAY['TELEGRAM'],
  audience_type    VARCHAR(30)   NOT NULL DEFAULT 'ALL'
                   CHECK (audience_type IN ('ALL','TAG','VIP','ACTIVE','INACTIVE','NEVER_DEPOSIT','DEPOSITED','SELECTED')),
  audience_tag_id  INT           REFERENCES customer_tags(id) ON DELETE SET NULL,
  audience_user_ids INT[],
  status           VARCHAR(20)   NOT NULL DEFAULT 'DRAFT'
                   CHECK (status IN ('DRAFT','SCHEDULED','SENDING','SENT','PARTIALLY_SENT','FAILED','CANCELLED')),
  scheduled_at     TIMESTAMPTZ,
  sent_at          TIMESTAMPTZ,
  recipient_count  INT           NOT NULL DEFAULT 0,
  success_count    INT           NOT NULL DEFAULT 0,
  failed_count     INT           NOT NULL DEFAULT 0,
  created_by       VARCHAR(100)  NOT NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_broadcasts_status     ON broadcasts(status);
CREATE INDEX idx_broadcasts_created_at ON broadcasts(created_at DESC);
CREATE INDEX idx_broadcasts_media_id   ON broadcasts(media_id) WHERE media_id IS NOT NULL;

-- Reuse the existing set_updated_at() function from migration 027
CREATE TRIGGER set_broadcasts_updated_at
  BEFORE UPDATE ON broadcasts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
