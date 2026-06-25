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
    promotion_id         INTEGER REFERENCES promotions(id),
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

-- ============================================================
-- Phase 3: Live Chat System
-- ============================================================

CREATE TABLE IF NOT EXISTS support_sessions (
    id                   SERIAL PRIMARY KEY,
    user_id              INTEGER      NOT NULL REFERENCES users(id),
    agent_id             BIGINT,
    agent_username       VARCHAR(100),
    assigned_to_username VARCHAR(100),
    status               VARCHAR(10)  NOT NULL DEFAULT 'OPEN'
                         CHECK (status IN ('OPEN','ACTIVE','CLOSED')),
    erp_unread_count     INTEGER      NOT NULL DEFAULT 0,
    pinned_at            TIMESTAMPTZ,
    notification_msg_id  BIGINT,
    control_msg_id       BIGINT,
    last_message_at      TIMESTAMPTZ  DEFAULT NOW(),
    created_at           TIMESTAMPTZ  DEFAULT NOW(),
    accepted_at          TIMESTAMPTZ,
    closed_at            TIMESTAMPTZ,
    close_reason         VARCHAR(10)
                         CHECK (close_reason IN ('USER','AGENT','TIMEOUT') OR close_reason IS NULL),
    rating               SMALLINT,
    rated_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_status
    ON support_sessions(user_id, status);

CREATE INDEX IF NOT EXISTS idx_sessions_status
    ON support_sessions(status);

CREATE INDEX IF NOT EXISTS idx_sessions_last_message
    ON support_sessions(last_message_at)
    WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS support_messages (
    id              SERIAL PRIMARY KEY,
    session_id      INTEGER     NOT NULL REFERENCES support_sessions(id),
    sender_type     VARCHAR(5)  NOT NULL CHECK (sender_type IN ('USER','AGENT')),
    message_type    VARCHAR(20) NOT NULL
                    CHECK (message_type IN (
                        'TEXT','PHOTO','DOCUMENT','VOICE','STICKER',
                        'VIDEO','VIDEO_NOTE','AUDIO','ANIMATION','OTHER'
                    )),
    user_msg_id     BIGINT,
    group_msg_id    BIGINT,
    content         TEXT,
    caption         TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_session
    ON support_messages(session_id);

CREATE INDEX IF NOT EXISTS idx_messages_group_msg_id
    ON support_messages(group_msg_id)
    WHERE group_msg_id IS NOT NULL;

-- ── Phase 3: SSE triggers (pg_notify on message insert / session update) ──────

CREATE OR REPLACE FUNCTION notify_livechat_message() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('livechat_updates', json_build_object(
    'type',        'new_message',
    'session_id',  NEW.session_id,
    'message_id',  NEW.id,
    'sender_type', NEW.sender_type
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS livechat_msg_notify ON support_messages;
CREATE TRIGGER livechat_msg_notify
  AFTER INSERT ON support_messages
  FOR EACH ROW EXECUTE FUNCTION notify_livechat_message();

CREATE OR REPLACE FUNCTION notify_livechat_session() RETURNS trigger AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
    OR OLD.erp_unread_count IS DISTINCT FROM NEW.erp_unread_count
    OR OLD.assigned_to_username IS DISTINCT FROM NEW.assigned_to_username
  THEN
    PERFORM pg_notify('livechat_updates', json_build_object(
      'type',       'session_update',
      'session_id', NEW.id,
      'status',     NEW.status
    )::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS livechat_session_notify ON support_sessions;
CREATE TRIGGER livechat_session_notify
  AFTER UPDATE ON support_sessions
  FOR EACH ROW EXECUTE FUNCTION notify_livechat_session();

CREATE OR REPLACE FUNCTION increment_erp_unread() RETURNS trigger AS $$
BEGIN
  IF NEW.sender_type = 'USER' THEN
    UPDATE support_sessions
    SET erp_unread_count = erp_unread_count + 1
    WHERE id = NEW.session_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS livechat_unread_increment ON support_messages;
CREATE TRIGGER livechat_unread_increment
  AFTER INSERT ON support_messages
  FOR EACH ROW EXECUTE FUNCTION increment_erp_unread();

-- ============================================================
-- Phase 5A — Promotion & Bonus System
-- ============================================================

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

-- ============================================================
-- Phase 5B/5C Migration (apply to existing DB if Phase 5A tables already exist)
-- ============================================================
-- ALTER TABLE promotions DROP CONSTRAINT IF EXISTS promotions_promotion_type_check;
-- ALTER TABLE promotions ADD CONSTRAINT promotions_promotion_type_check
--     CHECK (promotion_type IN ('FIRST_DEPOSIT','DAILY','UNLIMITED','MANUAL','WEEKLY'));
-- ALTER TABLE promotions ADD COLUMN IF NOT EXISTS
--     turnover_type VARCHAR(10) NOT NULL DEFAULT 'BONUS'
--     CHECK (turnover_type IN ('BONUS','DEPOSIT'));

-- Quick reply categories
CREATE TABLE IF NOT EXISTS quick_reply_categories (
    id         SERIAL      PRIMARY KEY,
    name       VARCHAR(50) NOT NULL UNIQUE,
    sort_order INTEGER     NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO quick_reply_categories (name, sort_order) VALUES
  ('Deposits',   1),
  ('Withdrawals',2),
  ('Technical',  3),
  ('General',    4)
ON CONFLICT DO NOTHING;

-- Quick replies
CREATE TABLE IF NOT EXISTS quick_replies (
    id          SERIAL       PRIMARY KEY,
    category_id INTEGER      REFERENCES quick_reply_categories(id) ON DELETE SET NULL,
    title       VARCHAR(100) NOT NULL,
    body        TEXT         NOT NULL,
    sort_order  INTEGER      NOT NULL DEFAULT 0,
    created_by  VARCHAR(100),
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);

INSERT INTO quick_replies (category_id, title, body, sort_order) VALUES
  (4, 'Please wait',         'Please wait a moment.',                        1),
  (1, 'Send receipt',        'Please upload your deposit receipt.',           2),
  (2, 'Withdrawal approved', 'Your withdrawal has been approved.',            3),
  (3, 'Restart Telegram',    'Please restart Telegram and try again.',        4),
  (4, 'Thank you',           'Thank you for contacting us. Have a nice day.', 5)
ON CONFLICT DO NOTHING;

-- Per-agent favorites
CREATE TABLE IF NOT EXISTS quick_reply_favorites (
    admin_username VARCHAR(100) NOT NULL,
    reply_id       INTEGER      NOT NULL REFERENCES quick_replies(id) ON DELETE CASCADE,
    PRIMARY KEY (admin_username, reply_id)
);

CREATE INDEX IF NOT EXISTS idx_qrf_admin ON quick_reply_favorites(admin_username);
