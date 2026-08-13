-- 096_backfill_media_source.sql
-- Backfill source column for historical media records created before source tagging.
-- Safe to run multiple times: WHERE source = 'MEDIA_LIBRARY' prevents double-updates.
-- No rows are deleted. No FK columns are touched.

-- 1. Deposit receipts — identified by FK reference in deposit_requests
UPDATE media_library ml
SET source = 'DEPOSIT_ATTACHMENT'
WHERE ml.source = 'MEDIA_LIBRARY'
  AND EXISTS (
    SELECT 1
    FROM deposit_requests dr
    WHERE dr.receipt_media_id = ml.id
  );

-- 2. Withdrawal receipts — FK reference in withdrawal_requests (staff or member)
--    plus historical staff receipts identified by display_name pattern
UPDATE media_library ml
SET source = 'WITHDRAWAL_RECEIPT'
WHERE ml.source = 'MEDIA_LIBRARY'
  AND (
    EXISTS (
      SELECT 1
      FROM withdrawal_requests wr
      WHERE wr.receipt_media_id = ml.id
         OR wr.member_receipt_media_id = ml.id
    )
    OR ml.display_name LIKE 'WD-%-receipt'
  );
