-- =============================================================================
-- 017_reject_reasons.sql
--
-- Adds reject_reason column to deposit_requests and withdrawal_requests.
-- Safe to run on any database state: ADD COLUMN IF NOT EXISTS.
-- =============================================================================

ALTER TABLE deposit_requests    ADD COLUMN IF NOT EXISTS reject_reason TEXT;
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS reject_reason TEXT;
