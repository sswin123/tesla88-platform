-- Migration 084: Backfill users.public_id
-- Fixes LOCAL schema gap: 000_base_schema.sql used CREATE TABLE IF NOT EXISTS,
-- so public_id was never added to the pre-existing users table.
-- Corresponds to database.sql "Migration 021" (ADD COLUMN only, no data reset).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS public_id VARCHAR(20) UNIQUE;

-- Backfill any existing users that have no public_id yet.
-- Uses 'SS' prefix matching the existing brand_settings.member_id_prefix default.
UPDATE users
SET public_id = 'SS' || (1000000 + id)::text
WHERE public_id IS NULL;
