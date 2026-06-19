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

-- ============================================================
-- Game Account Pool — Phase 1 Extension
-- ============================================================

-- Migration: add total_bonus to users (Phase 4 Promotion placeholder)
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS total_bonus NUMERIC(15,2) DEFAULT 0.00;

-- Account pool: pre-loaded game accounts
CREATE TABLE IF NOT EXISTS account_pool (
    id               SERIAL PRIMARY KEY,
    provider         VARCHAR(20)  NOT NULL
                     CHECK (provider IN ('918Kiss','Mega888','Pussy888','Newtown','Ace333','Live22')),
    username         VARCHAR(100) NOT NULL,
    password         VARCHAR(100) NOT NULL,
    status           VARCHAR(10)  NOT NULL DEFAULT 'AVAILABLE'
                     CHECK (status IN ('AVAILABLE','ASSIGNED','DISABLED')),
    assigned_user_id INTEGER      REFERENCES users(id),
    assigned_at      TIMESTAMPTZ,
    note             VARCHAR(255),
    created_at       TIMESTAMPTZ  DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE(provider, username)
);

CREATE INDEX IF NOT EXISTS idx_account_pool_provider_status
    ON account_pool(provider, status);

DROP TRIGGER IF EXISTS trg_account_pool_updated_at ON account_pool;
CREATE TRIGGER trg_account_pool_updated_at
    BEFORE UPDATE ON account_pool
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- User game account assignments
CREATE TABLE IF NOT EXISTS user_game_accounts (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id),
    provider        VARCHAR(20) NOT NULL
                    CHECK (provider IN ('918Kiss','Mega888','Pussy888','Newtown','Ace333','Live22')),
    account_pool_id INTEGER NOT NULL REFERENCES account_pool(id),
    assigned_at     TIMESTAMPTZ DEFAULT NOW(),
    assigned_by     BIGINT,
    last_changed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_uga_user_id ON user_game_accounts(user_id);

-- ============================================================
-- Phase 2: Deposit / Withdrawal System
-- ============================================================

CREATE TABLE IF NOT EXISTS bonus_types (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(100) NOT NULL,
    percentage   NUMERIC(5,2)  NOT NULL DEFAULT 0,
    max_bonus    NUMERIC(10,2) NOT NULL DEFAULT 0,
    min_deposit  NUMERIC(10,2) NOT NULL DEFAULT 0,
    provider     VARCHAR(20)   DEFAULT NULL
                 CHECK (provider IN ('918Kiss','Mega888','Pussy888','Newtown','Ace333','Live22') OR provider IS NULL),
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO bonus_types (name, percentage, max_bonus, min_deposit, provider, sort_order)
VALUES
    ('Welcome Bonus 50%', 50.00, 50.00, 30.00, NULL, 1),
    ('Reload Bonus 10%',  10.00, 30.00, 50.00, NULL, 2)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS deposit_requests (
    id                   SERIAL PRIMARY KEY,
    user_id              INTEGER       NOT NULL REFERENCES users(id),
    provider             VARCHAR(20)   NOT NULL
                         CHECK (provider IN ('918Kiss','Mega888','Pussy888','Newtown','Ace333','Live22')),
    game_username        VARCHAR(100)  NOT NULL,
    deposit_amount       NUMERIC(10,2) NOT NULL,
    bonus_type_id        INTEGER REFERENCES bonus_types(id),
    bonus_amount         NUMERIC(10,2) NOT NULL DEFAULT 0,
    credit_amount        NUMERIC(10,2) NOT NULL,
    payment_bank         VARCHAR(100)  NOT NULL,
    receipt_file_id      VARCHAR(255)  NOT NULL,
    status               VARCHAR(20)   NOT NULL DEFAULT 'PENDING'
                         CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    reviewed_by          BIGINT,
    admin_note           TEXT,
    notification_msg_id  BIGINT,
    created_at           TIMESTAMPTZ   DEFAULT NOW(),
    reviewed_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_deposit_user_status ON deposit_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_deposit_status      ON deposit_requests(status);

CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id                   SERIAL PRIMARY KEY,
    user_id              INTEGER       NOT NULL REFERENCES users(id),
    provider             VARCHAR(20)   NOT NULL
                         CHECK (provider IN ('918Kiss','Mega888','Pussy888','Newtown','Ace333','Live22')),
    game_username        VARCHAR(100)  NOT NULL,
    withdraw_amount      NUMERIC(10,2) NOT NULL,
    bank_name            VARCHAR(100)  NOT NULL,
    bank_account         VARCHAR(50)   NOT NULL,
    bank_holder_name     VARCHAR(100)  NOT NULL,
    status               VARCHAR(20)   NOT NULL DEFAULT 'PENDING'
                         CHECK (status IN ('PENDING','PAID','REJECTED')),
    reviewed_by          BIGINT,
    admin_note           TEXT,
    notification_msg_id  BIGINT,
    created_at           TIMESTAMPTZ   DEFAULT NOW(),
    reviewed_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_user_status ON withdrawal_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_status      ON withdrawal_requests(status);
