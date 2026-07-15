-- Migration 026: ERP unread badge for deposit_requests
-- Adds erp_unread flag so sidebar can show a live badge for new pending deposits.
-- Also installs the deposit_updates notify trigger (mirrors livechat_updates pattern).

ALTER TABLE deposit_requests
  ADD COLUMN IF NOT EXISTS erp_unread BOOLEAN NOT NULL DEFAULT false;

-- Notify ERP via pg_notify on every new PENDING deposit.
-- The BEFORE trigger also flips erp_unread = true on the inserting row.
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
