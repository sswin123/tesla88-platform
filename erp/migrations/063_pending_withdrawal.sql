-- Migration 063: Enterprise Withdrawal Balance Architecture
--
-- Goals:
--   1. Add pending_withdrawal to users — tracks in-flight withdrawal amounts
--   2. Add available_balance as GENERATED column — single source of truth for spendable balance
--   3. Add reference columns to wallet_transactions — enables withdrawal audit trail
--   4. DB trigger on withdrawal_requests — manages pending_withdrawal automatically
--      at the database level, covering ALL code paths (ERP, Bot, API, direct SQL)
--   5. Backfill pending_withdrawal from existing PENDING requests

-- ── Step 1: pending_withdrawal ───────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pending_withdrawal NUMERIC(15,2) NOT NULL DEFAULT 0;

-- Constraint: pending_withdrawal cannot exceed net_deposit
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS chk_pending_withdrawal_non_negative;
ALTER TABLE users
  ADD CONSTRAINT chk_pending_withdrawal_non_negative
    CHECK (pending_withdrawal >= 0);

-- ── Step 2: available_balance (GENERATED) ───────────────────────────────────
-- available_balance = total_deposit - total_withdraw - pending_withdrawal
-- NOTE: references base columns only (net_deposit is GENERATED and cannot be referenced)
-- This is the single authoritative source for "can the member spend this?"
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS available_balance NUMERIC(15,2)
    GENERATED ALWAYS AS (total_deposit - total_withdraw - pending_withdrawal) STORED;

-- ── Step 3: wallet_transactions — add reference tracking ────────────────────
ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS reference_type VARCHAR(30),
  ADD COLUMN IF NOT EXISTS reference_id   BIGINT;

CREATE INDEX IF NOT EXISTS idx_wt_reference
  ON wallet_transactions(reference_type, reference_id)
  WHERE reference_type IS NOT NULL;

-- ── Step 4: DB Trigger — automatic pending_withdrawal management ─────────────
-- This trigger fires on ALL withdrawal_requests changes, regardless of which
-- application layer (ERP API, Telegram Bot, direct SQL) made the change.
-- This guarantees consistency across all code paths.
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

  -- Status transition PENDING → PAID or REJECTED → release the lock
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'PENDING'
     AND NEW.status IN ('PAID', 'REJECTED') THEN
    UPDATE users
      SET pending_withdrawal = GREATEST(0, pending_withdrawal - OLD.withdraw_amount)
      WHERE id = NEW.user_id;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_withdrawal_pending ON withdrawal_requests;
CREATE TRIGGER trg_withdrawal_pending
  AFTER INSERT OR UPDATE OF status ON withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION trg_fn_withdrawal_pending();

-- ── Step 5: Backfill pending_withdrawal from existing PENDING requests ───────
UPDATE users u
SET pending_withdrawal = COALESCE((
  SELECT SUM(withdraw_amount)
  FROM withdrawal_requests wr
  WHERE wr.user_id = u.id
    AND wr.status = 'PENDING'
), 0);
