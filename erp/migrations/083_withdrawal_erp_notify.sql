-- Migration 083: Real-time pending-count notifications for ERP sidebar
--
-- Ports db/migrations/034_transaction_pending_count.sql into the ERP migration
-- chain so the production docker-migrate.sh actually applies it.
--
-- The ERP sidebar subscribes to /api/transactions/stream which LISTENs on the
-- 'transaction_pending_count' channel.  When the pending queue changes, the
-- sidebar fetches the latest count and plays a beep when count increases.
--
-- Without this migration the trigger exists only for deposit_requests (from
-- migration 050 which fires 'deposit_updates', a different channel), and
-- withdrawal_requests has no trigger at all — so new withdrawal requests are
-- silent in the ERP browser.
--
-- Trigger fires on:
--   INSERT   WHERE NEW.status = 'PENDING'                               → notify
--   UPDATE   WHERE OLD.status <> 'PENDING' AND NEW.status = 'PENDING'  → notify
--   UPDATE   WHERE OLD.status = 'PENDING'  AND NEW.status <> 'PENDING' → notify
--
-- Safe to re-run: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS.

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

-- Attach to deposit_requests (idempotent — safe even if trigger already exists)
DROP TRIGGER IF EXISTS on_deposit_pending_count ON deposit_requests;
CREATE TRIGGER on_deposit_pending_count
  AFTER INSERT OR UPDATE OF status ON deposit_requests
  FOR EACH ROW EXECUTE FUNCTION notify_transaction_pending_count();

-- Attach to withdrawal_requests (this is the primary fix — was missing)
DROP TRIGGER IF EXISTS on_withdrawal_pending_count ON withdrawal_requests;
CREATE TRIGGER on_withdrawal_pending_count
  AFTER INSERT OR UPDATE OF status ON withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION notify_transaction_pending_count();
