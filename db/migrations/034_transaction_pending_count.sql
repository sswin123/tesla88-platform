-- Migration 034: Real-time pending count notifications
--
-- Fires pg_notify('transaction_pending_count', '{"event":"pending_changed"}')
-- whenever the PENDING queue size changes on deposit_requests or withdrawal_requests.
--
-- Trigger cases:
--   INSERT   WHERE NEW.status = 'PENDING'                              → notify
--   UPDATE   WHERE OLD.status <> 'PENDING' AND NEW.status = 'PENDING' → notify
--   UPDATE   WHERE OLD.status = 'PENDING'  AND NEW.status <> 'PENDING'→ notify
--
-- No schema changes. No new columns. Triggers only.

CREATE OR REPLACE FUNCTION notify_transaction_pending_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'PENDING' THEN
      PERFORM pg_notify('transaction_pending_count', '{"event":"pending_changed"}');
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (OLD.status <> 'PENDING' AND NEW.status = 'PENDING')
    OR (OLD.status = 'PENDING'  AND NEW.status <> 'PENDING') THEN
      PERFORM pg_notify('transaction_pending_count', '{"event":"pending_changed"}');
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Attach to deposit_requests
DROP TRIGGER IF EXISTS on_deposit_pending_count ON deposit_requests;
CREATE TRIGGER on_deposit_pending_count
  AFTER INSERT OR UPDATE OF status ON deposit_requests
  FOR EACH ROW EXECUTE FUNCTION notify_transaction_pending_count();

-- Attach to withdrawal_requests
DROP TRIGGER IF EXISTS on_withdrawal_pending_count ON withdrawal_requests;
CREATE TRIGGER on_withdrawal_pending_count
  AFTER INSERT OR UPDATE OF status ON withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION notify_transaction_pending_count();
