-- Migration 090: Add receipt_media_id to deposit_requests
-- Mirrors withdrawal_requests.receipt_media_id (migration 064).
-- This column stores the media_library FK for customer-uploaded deposit receipts.
-- Without this column, Levels 1 & 2 of the transaction detail query fail (42703),
-- falling through to Level 3 which returns NULL for ALL processing fields,
-- causing both the receipt display AND the Approve/Reject buttons to disappear.

ALTER TABLE deposit_requests
  ADD COLUMN IF NOT EXISTS receipt_media_id INTEGER REFERENCES media_library(id) ON DELETE SET NULL;

-- Add member_receipt_media_id to withdrawal_requests for customer-uploaded receipts
-- at withdrawal submission time. This is separate from receipt_media_id which stores
-- the ERP admin's payment proof (bank transfer screenshot sent to member).

ALTER TABLE withdrawal_requests
  ADD COLUMN IF NOT EXISTS member_receipt_media_id INTEGER REFERENCES media_library(id) ON DELETE SET NULL;
