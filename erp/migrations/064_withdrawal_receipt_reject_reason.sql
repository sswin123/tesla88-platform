-- Migration 064: Add receipt_media_id to withdrawal_requests
-- reject_reason column already exists (added in earlier migration)

ALTER TABLE withdrawal_requests
  ADD COLUMN IF NOT EXISTS receipt_media_id INTEGER REFERENCES media_library(id) ON DELETE SET NULL;

