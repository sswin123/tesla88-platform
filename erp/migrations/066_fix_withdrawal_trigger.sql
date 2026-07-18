-- Migration 066: Fix pending_withdrawal trigger for multi-CS workflow
--
-- Migration 063 added the trigger for PENDING → PAID/REJECTED transitions.
-- Migration 065 added the PROCESSING status (PENDING → PROCESSING → PAID/REJECTED).
-- The trigger was not updated, so PROCESSING → PAID/REJECTED does NOT decrement
-- pending_withdrawal, leaving the member's funds locked after rejection.
--
-- Fix: extend the release condition to also fire on PROCESSING → PAID/REJECTED.

CREATE OR REPLACE FUNCTION trg_fn_withdrawal_pending()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- New PENDING withdrawal submitted → lock the amount
  IF TG_OP = 'INSERT' AND NEW.status = 'PENDING' THEN
    UPDATE users
      SET pending_withdrawal = pending_withdrawal + NEW.withdraw_amount
      WHERE id = NEW.user_id;
    RETURN NEW;
  END IF;

  -- Status transition (PENDING or PROCESSING) → PAID or REJECTED → release the lock
  IF TG_OP = 'UPDATE'
     AND OLD.status IN ('PENDING', 'PROCESSING')
     AND NEW.status IN ('PAID', 'REJECTED') THEN
    UPDATE users
      SET pending_withdrawal = GREATEST(0, pending_withdrawal - OLD.withdraw_amount)
      WHERE id = NEW.user_id;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;
