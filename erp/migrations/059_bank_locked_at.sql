-- Migration 059: Add bank_locked_at to users table
--
-- Ports db/migrations/031_bank_locked_at.sql into erp/migrations so that
-- migrate.sh picks it up. The column records the timestamp when a member
-- first binds their bank account (set atomically; cannot be reset by members).
--
-- Website bank API (/api/member/bank POST) sets this column on every bank
-- binding write. Without this column the UPDATE fails with PostgreSQL 42703
-- ("column bank_locked_at does not exist"), which surfaces as "网络错误" to
-- the member.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS bank_locked_at TIMESTAMPTZ;

-- Back-fill: members who already have bank info bound before this column was
-- added — use created_at as a safe approximation of when the bank was set.
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE users
     SET bank_locked_at = created_at
   WHERE bank_account IS NOT NULL
     AND bank_locked_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    RAISE NOTICE '[059] Backfilled bank_locked_at for % existing member(s)', v_count;
  ELSE
    RAISE NOTICE '[059] No rows needed backfill for bank_locked_at';
  END IF;
END $$;
