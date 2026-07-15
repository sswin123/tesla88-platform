-- Migration 033: Referral system backfill
-- 1. Ensure referral_code column exists (should already exist from earlier migrations)
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by   INTEGER REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_count INTEGER NOT NULL DEFAULT 0;

-- 2. Backfill referral_code = public_id for members who have public_id but no referral_code
UPDATE users
SET referral_code = public_id
WHERE referral_code IS NULL
  AND public_id IS NOT NULL;

-- 3. Sync referral_count to actual counted referrals (fixes bot-registered referrals)
UPDATE users u
SET referral_count = (
    SELECT COUNT(*) FROM users r WHERE r.referred_by = u.id
);

-- 4. Index for fast referral_code lookups
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by   ON users(referred_by);
