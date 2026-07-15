-- Migration 027: Receiving Bank Architecture
--
-- 1. payment_banks gets maintenance support (per-bank maintenance mode).
-- 2. deposit_requests.receiving_bank_id — FK to the casino's bank account used for this deposit.
--    Old records stay with their payment_bank text; new website/bot deposits reference the bank row.
-- 3. deposit_requests.receipt_media_id — media_library FK for receipts uploaded via website.

-- ── payment_banks: maintenance fields ──────────────────────────────────────
ALTER TABLE payment_banks
  ADD COLUMN IF NOT EXISTS maintenance_mode    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS maintenance_message TEXT;

-- ── deposit_requests: receiving bank FK ────────────────────────────────────
ALTER TABLE deposit_requests
  ADD COLUMN IF NOT EXISTS receiving_bank_id INTEGER REFERENCES payment_banks(id);

-- ── deposit_requests: web-uploaded receipt ────────────────────────────────
ALTER TABLE deposit_requests
  ADD COLUMN IF NOT EXISTS receipt_media_id INTEGER REFERENCES media_library(id);

-- ── Best-effort backfill: map existing payment_bank text → payment_banks.id ─
-- Only maps exact bank_name matches. Non-matching rows keep receiving_bank_id = NULL.
UPDATE deposit_requests dr
SET    receiving_bank_id = pb.id
FROM   payment_banks pb
WHERE  LOWER(TRIM(dr.payment_bank)) = LOWER(TRIM(pb.bank_name))
  AND  dr.receiving_bank_id IS NULL;

-- ── Index for quick deposit-by-bank queries (future reports) ───────────────
CREATE INDEX IF NOT EXISTS idx_deposit_requests_receiving_bank
  ON deposit_requests (receiving_bank_id)
  WHERE receiving_bank_id IS NOT NULL;
