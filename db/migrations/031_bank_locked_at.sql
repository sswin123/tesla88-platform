-- Migration 031: Add bank_locked_at to users table
-- Records the timestamp when a member first binds their bank account.
-- This timestamp is set atomically when bank info is first written and
-- cannot be reset by members. Supports future OTP verification flow.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS bank_locked_at TIMESTAMPTZ;

-- Back-fill existing members who already have bank info bound
UPDATE users
SET bank_locked_at = created_at
WHERE bank_account IS NOT NULL AND bank_locked_at IS NULL;
