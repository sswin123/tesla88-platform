-- Migration 050: deposit_requests.erp_unread + notify trigger
-- Ports db/migrations/026_deposit_erp_unread.sql to the Docker migration chain.
-- 000_base_schema.sql creates deposit_requests WITHOUT this column.

ALTER TABLE deposit_requests
  ADD COLUMN IF NOT EXISTS erp_unread BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION notify_new_deposit()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'PENDING' THEN
    NEW.erp_unread := true;
    PERFORM pg_notify('deposit_updates', json_build_object(
      'type',    'new_deposit',
      'id',      NEW.id,
      'user_id', NEW.user_id
    )::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_deposit_insert ON deposit_requests;
CREATE TRIGGER on_deposit_insert
  BEFORE INSERT ON deposit_requests
  FOR EACH ROW EXECUTE FUNCTION notify_new_deposit();
