-- =============================================================================
-- 000_base_schema.sql — 基础 Schema（必须在所有编号迁移之前运行）
--
-- 创建核心表，依赖顺序正确。所有语句均使用 IF NOT EXISTS，可安全重复执行。
-- 替代 database.sql 作为 postgres initdb 的 Schema 来源。
--
-- 注意：以下表由编号迁移创建，不在此文件中重复定义：
--   payment_banks (002)、audit_logs (005)、quick_reply_categories (008)、
--   quick_replies (008)、quick_reply_favorites (008)、session_notes (009)、
--   customer_tags (011)、user_tag_assignments (011)、providers (012)、
--   risk_flags (013)、announcements (014)、system_settings (015)、
--   media_library (027)、broadcasts (029)、role_permissions (032)、
--   brand_settings (034)、website_banners (036)、website_announcements (037)、
--   website_game_providers (038)、error_logs/system_backups (040)、
--   website_games (043)、website_lobby_category_icons (044)、
--   website_game_categories (045)
-- =============================================================================

-- ── 通用 updated_at 触发器函数 ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── users ─────────────────────────────────────────────────────────────────────
-- 包含 database.sql "Migration 021/022" 中的 public_id、bank_status 字段
-- （无对应编号迁移文件）
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
    total_deposit        NUMERIC(15,2) DEFAULT 0.00,
    total_withdraw       NUMERIC(15,2) DEFAULT 0.00,
    net_deposit          NUMERIC(15,2) GENERATED ALWAYS AS
                         (total_deposit - total_withdraw) STORED,
    total_bonus          NUMERIC(15,2) DEFAULT 0.00,
    referral_code        VARCHAR(20)   UNIQUE,
    referral_count       INTEGER       DEFAULT 0,
    referred_by          INTEGER       REFERENCES users(id),
    public_id            VARCHAR(20)   UNIQUE,
    bank_status          VARCHAR(10)   NOT NULL DEFAULT 'ACTIVE'
                         CHECK (bank_status IN ('ACTIVE', 'DELETED')),
    created_at           TIMESTAMPTZ   DEFAULT NOW(),
    updated_at           TIMESTAMPTZ   DEFAULT NOW()
);
-- remarks 由 migration 005 添加
-- last_seen_at 由 migration 010 添加

CREATE INDEX IF NOT EXISTS idx_users_phone        ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_telegram_id  ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_bank_account ON users(bank_account);

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── admins ────────────────────────────────────────────────────────────────────
-- 使用完整 role 列表 + 具名约束，migration 016 会 DROP+重建（净效果不变）
CREATE TABLE IF NOT EXISTS admins (
    id          SERIAL PRIMARY KEY,
    telegram_id BIGINT      UNIQUE NOT NULL,
    role        VARCHAR(15) NOT NULL,
    added_by    BIGINT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT admins_role_check
        CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'CS', 'FINANCE', 'SUPERVISOR', 'SUPPORT'))
);
-- erp_username、erp_password_hash、is_active 由 migration 001 添加
-- added_by_username、role constraint re-check 由 migration 016 执行
-- display_name、last_login_at 由 migration 033 添加

-- ── free_list ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS free_list (
    id          SERIAL PRIMARY KEY,
    phone       VARCHAR(20) UNIQUE NOT NULL,
    imported_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_free_list_phone ON free_list(phone);

-- ── account_pool ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS account_pool (
    id               SERIAL PRIMARY KEY,
    provider         VARCHAR(20)  NOT NULL,
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

-- ── user_game_accounts ────────────────────────────────────────────────────────
-- 包含 database.sql "Migration 022" 中的 status 字段（无对应编号迁移文件）
CREATE TABLE IF NOT EXISTS user_game_accounts (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id),
    provider        VARCHAR(20) NOT NULL,
    account_pool_id INTEGER NOT NULL REFERENCES account_pool(id),
    status          VARCHAR(10) NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE', 'REMOVED')),
    assigned_at     TIMESTAMPTZ DEFAULT NOW(),
    assigned_by     BIGINT,
    last_changed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_uga_user_id ON user_game_accounts(user_id);

-- ── bonus_types ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bonus_types (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(100) NOT NULL,
    percentage   NUMERIC(5,2)  NOT NULL DEFAULT 0,
    max_bonus    NUMERIC(10,2) NOT NULL DEFAULT 0,
    min_deposit  NUMERIC(10,2) NOT NULL DEFAULT 0,
    provider     VARCHAR(20)   DEFAULT NULL,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO bonus_types (name, percentage, max_bonus, min_deposit, provider, sort_order)
VALUES
    ('Welcome Bonus 50%', 50.00, 50.00, 30.00, NULL, 1),
    ('Reload Bonus 10%',  10.00, 30.00, 50.00, NULL, 2)
ON CONFLICT DO NOTHING;

-- ── promotions ────────────────────────────────────────────────────────────────
-- 必须在 deposit_requests 之前创建（deposit_requests 有 FK 引用此表）
-- 修复：database.sql 将 promotions 定义在 deposit_requests 之后，导致 FK 失败
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
-- expiry_date、deleted_at 由 migration 004 添加

CREATE INDEX IF NOT EXISTS idx_promotions_active
    ON promotions(is_active)
    WHERE is_active = TRUE;

-- ── deposit_requests ──────────────────────────────────────────────────────────
-- promotions 必须已存在（上方已创建）
CREATE TABLE IF NOT EXISTS deposit_requests (
    id                   SERIAL PRIMARY KEY,
    user_id              INTEGER       NOT NULL REFERENCES users(id),
    provider             VARCHAR(20)   NOT NULL,
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
-- reject_reason 由 migration 017 添加

CREATE INDEX IF NOT EXISTS idx_deposit_user_status ON deposit_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_deposit_status      ON deposit_requests(status);

-- ── withdrawal_requests ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id                   SERIAL PRIMARY KEY,
    user_id              INTEGER       NOT NULL REFERENCES users(id),
    provider             VARCHAR(20)   NOT NULL,
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
-- reject_reason 由 migration 017 添加

CREATE INDEX IF NOT EXISTS idx_withdrawal_user_status ON withdrawal_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_status      ON withdrawal_requests(status);

-- ── bonus_claims ──────────────────────────────────────────────────────────────
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

-- ── support_sessions ──────────────────────────────────────────────────────────
-- user_id 设为可空（支持 guest 会话，migration 041 会再次确认）
-- 包含 migration 006 添加的 erp_unread_count、assigned_to_username、pinned_at
-- 包含 migration 019 中的 muted_until（原 database.sql 内嵌迁移）
CREATE TABLE IF NOT EXISTS support_sessions (
    id                   SERIAL PRIMARY KEY,
    user_id              INTEGER,
    agent_id             BIGINT,
    agent_username       VARCHAR(100),
    assigned_to_username VARCHAR(100),
    status               VARCHAR(10)  NOT NULL DEFAULT 'OPEN'
                         CHECK (status IN ('OPEN','ACTIVE','CLOSED')),
    erp_unread_count     INTEGER      NOT NULL DEFAULT 0,
    pinned_at            TIMESTAMPTZ,
    muted_until          TIMESTAMPTZ,
    notification_msg_id  BIGINT,
    control_msg_id       BIGINT,
    last_message_at      TIMESTAMPTZ  DEFAULT NOW(),
    created_at           TIMESTAMPTZ  DEFAULT NOW(),
    accepted_at          TIMESTAMPTZ,
    closed_at            TIMESTAMPTZ,
    close_reason         VARCHAR(10)
                         CHECK (close_reason IN ('USER','AGENT','TIMEOUT') OR close_reason IS NULL),
    rating               SMALLINT,
    rated_at             TIMESTAMPTZ,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
-- guest_id、source 由 migration 041、042 添加

CREATE INDEX IF NOT EXISTS idx_sessions_user_status
    ON support_sessions(user_id, status)
    WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_status
    ON support_sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_last_message
    ON support_sessions(last_message_at)
    WHERE status = 'ACTIVE';

-- ── support_messages ──────────────────────────────────────────────────────────
-- 包含 migration 007 添加的 caption 字段（schema 初始化包含更合理）
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
-- file_name、file_size 由 migration 021 添加
-- reply_to_*、status 由 migration 024 添加

CREATE INDEX IF NOT EXISTS idx_messages_session
    ON support_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_group_msg_id
    ON support_messages(group_msg_id)
    WHERE group_msg_id IS NOT NULL;

-- ── Live Chat pg_notify 触发器 ────────────────────────────────────────────────
-- Migration 006/023 会使用 CREATE OR REPLACE 更新这些函数的实现

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
