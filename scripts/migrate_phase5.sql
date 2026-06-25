-- Phase 5A + 5B full migration
-- Safe to run multiple times (IF NOT EXISTS guards)

CREATE TABLE IF NOT EXISTS promotions (
    id                  SERIAL PRIMARY KEY,
    name                VARCHAR(100)    NOT NULL,
    description         TEXT,
    promotion_type      VARCHAR(20)     NOT NULL
                        CHECK (promotion_type IN ('FIRST_DEPOSIT','DAILY','UNLIMITED','MANUAL','WEEKLY')),
    bonus_type          VARCHAR(20)     NOT NULL
                        CHECK (bonus_type IN ('PERCENTAGE','FIXED')),
    bonus_value         NUMERIC(10,2)   NOT NULL,
    min_deposit         NUMERIC(10,2)   NOT NULL DEFAULT 0,
    max_bonus           NUMERIC(10,2),
    turnover_multiplier NUMERIC(5,2)    NOT NULL DEFAULT 1,
    turnover_type       VARCHAR(10)     NOT NULL DEFAULT 'BONUS'
                        CHECK (turnover_type IN ('BONUS','DEPOSIT')),
    allowed_games       TEXT[]          NOT NULL DEFAULT '{}',
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ     DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promotions_active
    ON promotions(is_active)
    WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS bonus_claims (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER         NOT NULL REFERENCES users(id),
    promotion_id        INTEGER         NOT NULL REFERENCES promotions(id),
    deposit_amount      NUMERIC(10,2)   NOT NULL,
    bonus_amount        NUMERIC(10,2)   NOT NULL,
    total_credit        NUMERIC(10,2)   NOT NULL,
    turnover_required   NUMERIC(10,2)   NOT NULL,
    turnover_completed  NUMERIC(10,2)   NOT NULL DEFAULT 0,
    status              VARCHAR(10)     NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','ACTIVE','COMPLETED','CANCELLED')),
    claimed_at          TIMESTAMPTZ     DEFAULT NOW(),
    completed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_claims_user
    ON bonus_claims(user_id, status);

CREATE INDEX IF NOT EXISTS idx_claims_user_promo_date
    ON bonus_claims(user_id, promotion_id, claimed_at);

-- If promotions table already existed without turnover_type (Phase 5A only),
-- add the column. The IF NOT EXISTS prevents error if column already exists.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='promotions' AND column_name='turnover_type'
    ) THEN
        ALTER TABLE promotions DROP CONSTRAINT IF EXISTS promotions_promotion_type_check;
        ALTER TABLE promotions ADD CONSTRAINT promotions_promotion_type_check
            CHECK (promotion_type IN ('FIRST_DEPOSIT','DAILY','UNLIMITED','MANUAL','WEEKLY'));
        ALTER TABLE promotions ADD COLUMN turnover_type VARCHAR(10) NOT NULL DEFAULT 'BONUS'
            CHECK (turnover_type IN ('BONUS','DEPOSIT'));
    END IF;
END $$;

-- Phase 5 UX: add promotion_id to deposit_requests (links deposit → promo claim)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='deposit_requests' AND column_name='promotion_id'
    ) THEN
        ALTER TABLE deposit_requests
            ADD COLUMN promotion_id INTEGER REFERENCES promotions(id);
    END IF;
END $$;

-- Verify
SELECT 'promotions' AS tbl, COUNT(*) AS rows FROM promotions
UNION ALL
SELECT 'bonus_claims', COUNT(*) FROM bonus_claims
UNION ALL
SELECT 'deposit_requests', COUNT(*) FROM deposit_requests;
