-- Migration 067: Withdrawal AWAITING_RECEIPT status + paid_at column
--
-- Redesigns the withdrawal approval workflow:
--   Old: PENDING → PROCESSING → PAID (on approve, before receipt)
--   New: PENDING → PROCESSING → AWAITING_RECEIPT (on approve)
--                             → PAID (on receipt upload)
--
-- This ensures receipt proof is collected BEFORE marking a withdrawal PAID.

-- Step 1: Add paid_at column (records exact time payment was completed)
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Step 2: Replace the status CHECK constraint to include AWAITING_RECEIPT
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'withdrawal_requests'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%PENDING%'
  LOOP EXECUTE format('ALTER TABLE withdrawal_requests DROP CONSTRAINT %I', r.conname); END LOOP;
END $$;

DO $$
BEGIN
  ALTER TABLE withdrawal_requests ADD CONSTRAINT withdrawal_requests_status_check
    CHECK (status IN ('PENDING','PROCESSING','AWAITING_RECEIPT','PAID','REJECTED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Step 3: Update trigger to release pending_withdrawal on AWAITING_RECEIPT → PAID as well
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

  -- Any terminal transition → PAID or REJECTED → release the pending lock
  IF TG_OP = 'UPDATE'
     AND OLD.status IN ('PENDING', 'PROCESSING', 'AWAITING_RECEIPT')
     AND NEW.status IN ('PAID', 'REJECTED') THEN
    UPDATE users
      SET pending_withdrawal = GREATEST(0, pending_withdrawal - OLD.withdraw_amount)
      WHERE id = NEW.user_id;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;
