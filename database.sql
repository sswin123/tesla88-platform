-- ============================================================
-- Telegram Member Bot — Phase 1 Schema
-- ============================================================

-- Users
CREATE TABLE IF NOT EXISTS users (
    id                   SERIAL PRIMARY KEY,
    telegram_id          BIGINT        UNIQUE NOT NULL,
    telegram_username    VARCHAR(255),
    first_name           VARCHAR(255)  NOT NULL,
    phone                VARCHAR(20)   UNIQUE NOT NULL,
    bank_name            VARCHAR(100)  NOT NULL,
    bank_account         VARCHAR(100)  UNIQUE NOT NULL,
    bank_holder_name     VARCHAR(255)  NOT NULL,
    eligible_free_credit BOOLEAN       DEFAULT FALSE,
    status               VARCHAR(10)   DEFAULT 'ACTIVE'
                         CHECK (status IN ('ACTIVE', 'FROZEN')),

    -- Financial stats: updated by Phase 3 / Phase 5 handlers
    total_deposit        NUMERIC(15,2) DEFAULT 0.00,
    total_withdraw       NUMERIC(15,2) DEFAULT 0.00,
    net_deposit          NUMERIC(15,2) GENERATED ALWAYS AS
                         (total_deposit - total_withdraw) STORED,

    -- Phase 2 Referral placeholders (NULL in Phase 1)
    referral_code        VARCHAR(20)   UNIQUE,
    referral_count       INTEGER       DEFAULT 0,
    referred_by          INTEGER       REFERENCES users(id),

    created_at           TIMESTAMPTZ   DEFAULT NOW(),
    updated_at           TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_phone        ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_telegram_id  ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_bank_account ON users(bank_account);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Admins
CREATE TABLE IF NOT EXISTS admins (
    id          SERIAL PRIMARY KEY,
    telegram_id BIGINT      UNIQUE NOT NULL,
    role        VARCHAR(15) NOT NULL
                CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'CS')),
    added_by    BIGINT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Free list
CREATE TABLE IF NOT EXISTS free_list (
    id          SERIAL PRIMARY KEY,
    phone       VARCHAR(20) UNIQUE NOT NULL,
    imported_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_free_list_phone ON free_list(phone);
