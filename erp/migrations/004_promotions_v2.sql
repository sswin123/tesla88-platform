-- Add soft delete and expiry date to promotions
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS expiry_date TIMESTAMPTZ;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ;
