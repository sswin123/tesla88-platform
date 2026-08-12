-- Migration 095: Add source column to media_library
-- Separates Media Library assets from business attachments.
--
-- MEDIA_LIBRARY     : Admin-uploaded reusable assets (Website Builder, banners, promotions)
-- WITHDRAWAL_RECEIPT: Staff-uploaded payment proof for withdrawal requests
-- DEPOSIT_ATTACHMENT: Member-uploaded deposit proof (via internal upload endpoint)
-- SYSTEM_UPLOAD     : System-generated or bot-related uploads (e.g. bot avatar)
--
-- DEFAULT 'MEDIA_LIBRARY' is intentional:
--   All existing rows were uploaded via the admin Media Library page.
--   No backfill required — existing receipts remain visible in their own context.
--   New business attachments will be tagged at upload time.

ALTER TABLE media_library
  ADD COLUMN IF NOT EXISTS source VARCHAR(30) NOT NULL DEFAULT 'MEDIA_LIBRARY';

CREATE INDEX IF NOT EXISTS idx_media_library_source
  ON media_library (source);
