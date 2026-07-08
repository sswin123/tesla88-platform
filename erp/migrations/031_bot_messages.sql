-- erp/migrations/031_bot_messages.sql
-- Phase 5.8 — Bot Messages CMS
-- Depends on: set_updated_at() trigger function from migration 027

-- ── cache_versions ────────────────────────────────────────────────────────────
-- Generic version table for cache invalidation across components.
-- Bot polls this every 10 s; increments trigger a full cache reload.
CREATE TABLE IF NOT EXISTS cache_versions (
  component   VARCHAR(50)  PRIMARY KEY,
  version     INTEGER      NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO cache_versions (component, version) VALUES
  ('bot_messages', 1),
  ('bot_buttons',  1)
ON CONFLICT (component) DO NOTHING;

-- ── bot_message_keys ──────────────────────────────────────────────────────────
-- Metadata only. Never stores translatable content.
CREATE TABLE IF NOT EXISTS bot_message_keys (
  id           SERIAL      PRIMARY KEY,
  module       VARCHAR(20) NOT NULL
               CHECK (module IN ('USER','ADMIN','AGENT','SYSTEM')),
  category     VARCHAR(30) NOT NULL
               CHECK (category IN ('WELCOME','REGISTER','DEPOSIT','WITHDRAW','GAME','PROMOTION','SUPPORT','HISTORY','BUTTON','PROFILE')),
  message_key  VARCHAR(80) NOT NULL UNIQUE,
  description  TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bmk_category ON bot_message_keys(category);
CREATE INDEX IF NOT EXISTS idx_bmk_module   ON bot_message_keys(module);

CREATE TRIGGER set_bot_message_keys_updated_at
  BEFORE UPDATE ON bot_message_keys
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── bot_message_translations ──────────────────────────────────────────────────
-- Stores editable content per language.
-- content      = live (published) version; bot reads this
-- draft_content = pending edit (NULL when no draft)
-- seed_content  = immutable original; "Reset Default" copies this → content
CREATE TABLE IF NOT EXISTS bot_message_translations (
  id             SERIAL       PRIMARY KEY,
  key_id         INTEGER      NOT NULL REFERENCES bot_message_keys(id) ON DELETE CASCADE,
  language_code  VARCHAR(10)  NOT NULL DEFAULT 'zh',
  content        TEXT         NOT NULL,
  draft_content  TEXT,
  seed_content   TEXT         NOT NULL,
  updated_by     VARCHAR(100),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (key_id, language_code)
);

CREATE INDEX IF NOT EXISTS idx_bmt_key_id ON bot_message_translations(key_id);

CREATE TRIGGER set_bot_message_translations_updated_at
  BEFORE UPDATE ON bot_message_translations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── bot_message_history ───────────────────────────────────────────────────────
-- Auto-populated by trigger below. Never written by application code.
CREATE TABLE IF NOT EXISTS bot_message_history (
  id                    SERIAL       PRIMARY KEY,
  translation_id        INTEGER      NOT NULL REFERENCES bot_message_translations(id) ON DELETE CASCADE,
  language_code         VARCHAR(10)  NOT NULL,
  old_content           TEXT         NOT NULL,
  changed_by            VARCHAR(100),
  changed_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  restored_from_version INTEGER
);

CREATE INDEX IF NOT EXISTS idx_bmh_translation_id ON bot_message_history(translation_id);
CREATE INDEX IF NOT EXISTS idx_bmh_changed_at     ON bot_message_history(changed_at DESC);

-- Trigger: record history only when published content (content col) changes.
-- Draft saves update draft_content, leaving content unchanged → no history entry.
-- Publish action sets content = draft_content → OLD.content != NEW.content → history recorded.
CREATE OR REPLACE FUNCTION fn_bot_message_history()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.content IS DISTINCT FROM NEW.content THEN
    INSERT INTO bot_message_history
      (translation_id, language_code, old_content, changed_by, changed_at)
    VALUES
      (OLD.id, OLD.language_code, OLD.content, NEW.updated_by, NOW());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bot_message_history
  BEFORE UPDATE ON bot_message_translations
  FOR EACH ROW EXECUTE FUNCTION fn_bot_message_history();

-- ── bot_buttons ────────────────────────────────────────────────────────────────
-- Static button groups only. Dynamic buttons (provider list, promo list, bank list)
-- remain code-generated. button_payload JSONB supports all Telegram button types
-- without schema changes (callback, url, webapp, etc.).
CREATE TABLE IF NOT EXISTS bot_buttons (
  id             SERIAL      PRIMARY KEY,
  group_key      VARCHAR(60) NOT NULL,
  label          TEXT        NOT NULL,
  language_code  VARCHAR(10) NOT NULL DEFAULT 'zh',
  button_payload JSONB       NOT NULL DEFAULT '{}',
  row_order      INTEGER     NOT NULL DEFAULT 0,
  column_order   INTEGER     NOT NULL DEFAULT 0,
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bb_group_key ON bot_buttons(group_key);
CREATE INDEX IF NOT EXISTS idx_bb_active    ON bot_buttons(group_key, language_code)
  WHERE is_active = TRUE;

CREATE TRIGGER set_bot_buttons_updated_at
  BEFORE UPDATE ON bot_buttons
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════
-- SEED: bot_message_keys (116 rows)
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO bot_message_keys (module, category, message_key, description) VALUES
  -- WELCOME (4)
  ('USER',   'WELCOME',   'start_returning_user',       'Shown when a registered user sends /start'),
  ('USER',   'WELCOME',   'start_new_user',             'Shown when an unregistered user sends /start'),
  ('USER',   'WELCOME',   'home_returned',              'Shown after user returns to main menu'),
  ('USER',   'WELCOME',   'cancel_done',                'Shown after user cancels an FSM flow'),
  -- REGISTER (17)
  ('USER',   'REGISTER',  'register_enter_phone',       'Prompt user to enter phone number'),
  ('USER',   'REGISTER',  'register_phone_invalid',     'Phone number format invalid, ask again'),
  ('USER',   'REGISTER',  'register_phone_exists',      'Phone number already registered'),
  ('USER',   'REGISTER',  'register_telegram_exists',   'Telegram account already registered'),
  ('USER',   'REGISTER',  'register_select_bank',       'Prompt user to select bank'),
  ('USER',   'REGISTER',  'register_enter_custom_bank', 'Prompt user to type custom bank name'),
  ('USER',   'REGISTER',  'register_bank_selected',     'Confirm bank selected, prompt account number'),
  ('USER',   'REGISTER',  'register_bank_name_empty',   'Bank name empty validation error'),
  ('USER',   'REGISTER',  'register_account_empty',     'Bank account number empty validation error'),
  ('USER',   'REGISTER',  'register_account_exists',    'Bank account already in use'),
  ('USER',   'REGISTER',  'register_enter_holder_name', 'Prompt user to enter bank holder name'),
  ('USER',   'REGISTER',  'register_holder_name_empty', 'Bank holder name empty validation error'),
  ('USER',   'REGISTER',  'register_conflict_error',    'Registration failed due to data conflict'),
  ('USER',   'REGISTER',  'register_success',           'Registration completed successfully'),
  ('USER',   'REGISTER',  'register_back_to_phone',     'Back to phone entry step'),
  ('USER',   'REGISTER',  'register_back_to_bank',      'Back to bank selection step'),
  ('USER',   'REGISTER',  'register_back_to_account',   'Back to account number entry step'),
  -- DEPOSIT (21)
  ('USER',   'DEPOSIT',   'deposit_not_registered',     'User not registered, redirect to /start'),
  ('USER',   'DEPOSIT',   'deposit_account_frozen',     'Account frozen, cannot deposit'),
  ('USER',   'DEPOSIT',   'deposit_pending_exists',     'Pending deposit exists, must wait'),
  ('USER',   'DEPOSIT',   'deposit_no_game_account',    'No game account claimed yet'),
  ('USER',   'DEPOSIT',   'deposit_select_platform',    'Prompt user to select game platform'),
  ('USER',   'DEPOSIT',   'deposit_select_promo',       'Prompt user to select promotion for deposit'),
  ('USER',   'DEPOSIT',   'deposit_enter_amount',       'Prompt user to enter deposit amount'),
  ('USER',   'DEPOSIT',   'deposit_amount_invalid',     'Deposit amount format invalid'),
  ('USER',   'DEPOSIT',   'deposit_min_not_met',        'Deposit amount below promotion minimum'),
  ('USER',   'DEPOSIT',   'deposit_no_bank_available',  'No receiving bank account available'),
  ('USER',   'DEPOSIT',   'deposit_preview',            'Deposit preview with bank selection'),
  ('USER',   'DEPOSIT',   'deposit_bank_invalid',       'Selected bank account no longer valid'),
  ('USER',   'DEPOSIT',   'deposit_confirm',            'Deposit confirmation with receipt upload prompt'),
  ('USER',   'DEPOSIT',   'deposit_receipt_invalid',    'Receipt upload format invalid'),
  ('USER',   'DEPOSIT',   'deposit_submitted',          'Deposit request submitted successfully'),
  ('USER',   'DEPOSIT',   'deposit_cancelled',          'Deposit request cancelled'),
  ('USER',   'DEPOSIT',   'deposit_promo_unavailable',  'Selected promotion no longer available'),
  ('USER',   'DEPOSIT',   'deposit_promo_invalid',      'Promotion not applicable'),
  ('USER',   'DEPOSIT',   'deposit_promo_first_only',   'First-deposit promo already used'),
  ('USER',   'DEPOSIT',   'deposit_promo_daily_limit',  'Daily promo claim limit reached'),
  ('USER',   'DEPOSIT',   'deposit_promo_weekly_limit', 'Weekly promo claim limit reached'),
  -- WITHDRAW (12)
  ('USER',   'WITHDRAW',  'withdraw_not_registered',    'User not registered, redirect to /start'),
  ('USER',   'WITHDRAW',  'withdraw_account_frozen',    'Account frozen, cannot withdraw'),
  ('USER',   'WITHDRAW',  'withdraw_pending_exists',    'Pending withdrawal exists, must wait'),
  ('USER',   'WITHDRAW',  'withdraw_no_game_account',   'No game account claimed yet'),
  ('USER',   'WITHDRAW',  'withdraw_select_platform',   'Prompt user to select game platform'),
  ('USER',   'WITHDRAW',  'withdraw_enter_amount',      'Prompt user to enter withdrawal amount'),
  ('USER',   'WITHDRAW',  'withdraw_amount_invalid',    'Withdrawal amount format invalid'),
  ('USER',   'WITHDRAW',  'withdraw_min_not_met',       'Withdrawal amount below minimum'),
  ('USER',   'WITHDRAW',  'withdraw_confirm',           'Withdrawal confirmation summary'),
  ('USER',   'WITHDRAW',  'withdraw_submitted',         'Withdrawal request submitted successfully'),
  ('USER',   'WITHDRAW',  'withdraw_cancelled',         'Withdrawal request cancelled'),
  ('USER',   'WITHDRAW',  'withdraw_invalid_platform',  'Platform selected is invalid'),
  -- GAME (11)
  ('USER',   'GAME',      'game_not_registered',        'User not registered, redirect to /start'),
  ('USER',   'GAME',      'game_no_stock_available',    'No game accounts available to claim'),
  ('USER',   'GAME',      'game_invalid_platform',      'Platform is invalid'),
  ('USER',   'GAME',      'game_no_stock_callback',     'No stock available via callback'),
  ('USER',   'GAME',      'game_claim_success',         'Game account claimed successfully'),
  ('USER',   'GAME',      'game_no_accounts_to_change', 'No accounts claimed yet to change'),
  ('USER',   'GAME',      'game_select_change_platform','Prompt to select platform to change'),
  ('USER',   'GAME',      'game_change_cooldown',       'Account change cooldown not yet expired'),
  ('USER',   'GAME',      'game_no_new_stock',          'No new stock available for account change'),
  ('USER',   'GAME',      'game_change_success',        'Game account changed successfully'),
  ('USER',   'GAME',      'game_account_not_found',     'Game account not found for platform'),
  -- PROMOTION (10)
  ('USER',   'PROMOTION', 'promo_none_active',          'No active promotions available'),
  ('USER',   'PROMOTION', 'promo_list_header',          'Promotion center header message'),
  ('USER',   'PROMOTION', 'promo_not_registered',       'User not registered, redirect to /start'),
  ('USER',   'PROMOTION', 'promo_unavailable',          'Selected promotion no longer available'),
  ('USER',   'PROMOTION', 'promo_enter_amount',         'Prompt to enter deposit amount for promo'),
  ('USER',   'PROMOTION', 'promo_expired',              'Promotion has expired'),
  ('USER',   'PROMOTION', 'promo_amount_invalid',       'Promo deposit amount format invalid'),
  ('USER',   'PROMOTION', 'promo_min_not_met',          'Deposit amount below promo minimum'),
  ('USER',   'PROMOTION', 'promo_my_claims_empty',      'User has no active promo claims'),
  ('USER',   'PROMOTION', 'bonus_disclaimer',           'Violation disclaimer shown on bonus pages'),
  -- SUPPORT (9)
  ('USER',   'SUPPORT',   'support_not_registered',     'User not registered, redirect to /start'),
  ('USER',   'SUPPORT',   'support_account_frozen',     'Account frozen, cannot contact support'),
  ('USER',   'SUPPORT',   'support_session_exists',     'Active support session already exists'),
  ('USER',   'SUPPORT',   'support_menu',               'Live chat welcome and instructions'),
  ('USER',   'SUPPORT',   'support_cancelled',          'Support request cancelled'),
  ('USER',   'SUPPORT',   'support_system_busy',        'System busy, retry later'),
  ('USER',   'SUPPORT',   'support_submitted',          'Support session created successfully'),
  ('AGENT',  'SUPPORT',   'support_agent_joined',       'Shown to user when agent joins session'),
  ('AGENT',  'SUPPORT',   'support_session_closed_user','Shown to user when session is closed'),
  -- HISTORY (4)
  ('USER',   'HISTORY',   'history_deposit_empty',      'No deposit history found'),
  ('USER',   'HISTORY',   'history_deposit_header',     'Deposit history list header'),
  ('USER',   'HISTORY',   'history_withdraw_empty',     'No withdrawal history found'),
  ('USER',   'HISTORY',   'history_withdraw_header',    'Withdrawal history list header'),
  -- PROFILE (9)
  ('USER',   'PROFILE',   'profile_header',             'Member profile section header'),
  ('USER',   'PROFILE',   'profile_phone',              'Profile phone number line'),
  ('USER',   'PROFILE',   'profile_bank_name',          'Profile bank name line'),
  ('USER',   'PROFILE',   'profile_bank_account',       'Profile bank account line'),
  ('USER',   'PROFILE',   'profile_holder_name',        'Profile bank holder name line'),
  ('USER',   'PROFILE',   'profile_registered_at',      'Profile registration date line'),
  ('USER',   'PROFILE',   'profile_game_accounts_header','Game accounts section header in profile'),
  ('USER',   'PROFILE',   'profile_no_accounts',        'Shown when user has no game accounts'),
  ('USER',   'PROFILE',   'profile_unclaimed',          'Lists unclaimed game providers'),
  -- BUTTON (19)
  ('SYSTEM', 'BUTTON',    'btn_my_profile',             'Main menu button: My Profile'),
  ('SYSTEM', 'BUTTON',    'btn_game_accounts',          'Main menu button: My Game Accounts'),
  ('SYSTEM', 'BUTTON',    'btn_deposit',                'Main menu button: Deposit'),
  ('SYSTEM', 'BUTTON',    'btn_withdraw',               'Main menu button: Withdraw'),
  ('SYSTEM', 'BUTTON',    'btn_deposit_history',        'Main menu button: Deposit History'),
  ('SYSTEM', 'BUTTON',    'btn_withdraw_history',       'Main menu button: Withdrawal History'),
  ('SYSTEM', 'BUTTON',    'btn_promotions',             'Main menu button: Promotion Center'),
  ('SYSTEM', 'BUTTON',    'btn_my_promotions',          'Main menu button: My Promotions'),
  ('SYSTEM', 'BUTTON',    'btn_change_account',         'Main menu button: Change Game Account'),
  ('SYSTEM', 'BUTTON',    'btn_support',                'Main menu button: Contact Support'),
  ('SYSTEM', 'BUTTON',    'btn_back',                   'Navigation button: Back'),
  ('SYSTEM', 'BUTTON',    'btn_home',                   'Navigation button: Main Menu'),
  ('SYSTEM', 'BUTTON',    'btn_cancel',                 'Navigation button: Cancel'),
  ('SYSTEM', 'BUTTON',    'btn_register',               'Registration start button'),
  ('SYSTEM', 'BUTTON',    'btn_no_promo',               'Deposit flow: No promotion option'),
  ('SYSTEM', 'BUTTON',    'btn_calculate_bonus',        'Promotion: Calculate bonus button'),
  ('SYSTEM', 'BUTTON',    'btn_deposit_now',            'Promotion: Deposit now button'),
  ('SYSTEM', 'BUTTON',    'btn_back_to_promos',         'Promotion: Back to promo list button'),
  ('SYSTEM', 'BUTTON',    'btn_recalculate',            'Promotion: Recalculate bonus button')
ON CONFLICT (message_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SEED: bot_message_translations (116 rows, language_code = 'zh')
-- Uses JOIN on message_key to resolve FK. ON CONFLICT DO NOTHING = idempotent.
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO bot_message_translations (key_id, language_code, content, seed_content)
SELECT k.id, v.lang, v.content, v.content
FROM bot_message_keys k
JOIN (VALUES
  -- WELCOME
  ('start_returning_user', 'zh', E'欢迎回来，{first_name}！\n状态：{status_emoji} {status}\n\n请选择操作：'),
  ('start_new_user',       'zh', E'欢迎注册会员\n\n请选择：'),
  ('home_returned',        'zh', '🏠 已返回主菜单'),
  ('cancel_done',          'zh', '❌ 已取消操作'),
  -- REGISTER
  ('register_enter_phone',       'zh', E'请输入您的电话号码：\n\n支持格式：\n  0123456789\n  60123456789\n  +60123456789'),
  ('register_phone_invalid',     'zh', E'电话号码格式不正确，请重新输入：\n\n支持格式：\n  0123456789\n  60123456789\n  +60123456789'),
  ('register_phone_exists',      'zh', '此电话号码已注册。'),
  ('register_telegram_exists',   'zh', '此 Telegram 已注册。'),
  ('register_select_bank',       'zh', '请选择您的银行或电子钱包：'),
  ('register_enter_custom_bank', 'zh', '请输入您的银行或电子钱包名称：'),
  ('register_bank_selected',     'zh', E'已选择：{bank_name}\n\n请输入银行账号：'),
  ('register_bank_name_empty',   'zh', '银行名称不能为空，请重新输入：'),
  ('register_account_empty',     'zh', '银行账号不能为空，请重新输入：'),
  ('register_account_exists',    'zh', '此银行账号已被使用，请输入其他账号：'),
  ('register_enter_holder_name', 'zh', '请输入银行户口姓名（请与银行资料一致）：'),
  ('register_holder_name_empty', 'zh', '银行户口姓名不能为空，请重新输入：'),
  ('register_conflict_error',    'zh', '注册失败：信息冲突，请重新注册。'),
  ('register_success',           'zh', E'✅ 注册成功！\n\n📱 电话：{phone}\n🏦 银行：{bank_name}\n💳 账号：{bank_account}\n👤 户口姓名：{bank_holder_name}\n\n欢迎加入会员系统。\n\n请从下方菜单开始使用。'),
  ('register_back_to_phone',     'zh', E'请重新输入电话号码：\n\n{hint}支持格式：\n  0123456789\n  60123456789\n  +60123456789'),
  ('register_back_to_bank',      'zh', '请重新选择银行或电子钱包：'),
  ('register_back_to_account',   'zh', E'已选择：{bank_name}\n\n请输入银行账号：'),
  -- DEPOSIT
  ('deposit_not_registered',    'zh', '您尚未注册。请发送 /start 开始注册。'),
  ('deposit_account_frozen',    'zh', '❌ 您的账号已被冻结，无法提交充值申请。'),
  ('deposit_pending_exists',    'zh', '⚠️ 您有一个待审核的充值申请，请等待处理后再提交新申请。'),
  ('deposit_no_game_account',   'zh', '⚠️ 您尚未领取任何游戏账号，请先在「🎮 我的游戏账号」领取账号。'),
  ('deposit_select_platform',   'zh', E'💰 充值\n\n请选择游戏平台：'),
  ('deposit_select_promo',      'zh', E'💰 充值 — {provider}\n\n请选择优惠：'),
  ('deposit_enter_amount',      'zh', E'请输入充值金额（RM）\n\nExample：\n100\n300\n500'),
  ('deposit_amount_invalid',    'zh', E'⚠️ 输入格式错误\n\n请输入正确金额，例如：\n\n100\n300\n500'),
  ('deposit_min_not_met',       'zh', E'⚠️ 使用「{promo_name}」最低充值为 RM {min_deposit:.2f}\n\n您的金额不符合条件，请重新输入：'),
  ('deposit_no_bank_available', 'zh', '⚠️ 暂无可用收款账号，请联系客服。'),
  ('deposit_preview',           'zh', E'💰 充值预览\n\n🎮 平台：{provider}\n👤 游戏账号：{game_username}\n\n💵 充值金额：RM {amount:.2f}\n{credit_block}\n━━━━━━━━━━━━━━\n\n🏦 请选择收款账号：'),
  ('deposit_bank_invalid',      'zh', '❌ 收款账号已失效，请重新选择。'),
  ('deposit_confirm',           'zh', E'💰 充值确认\n\n🎮 平台：{provider}\n👤 游戏账号：{game_username}\n\n💵 充值金额：RM {amount:.2f}\n{credit_block}\n━━━━━━━━━━━━━━\n\n🏦 收款账号：\n银行：{bank_name}\n账户名：{account_name}\n账号：{account_number}\n\n📷 请上传转账收据截图\n\n支持格式：\n✅ JPG / PNG\n✅ Telegram 图片'),
  ('deposit_receipt_invalid',   'zh', E'⚠️ 格式不正确\n\n请上传图片截图（JPG / PNG / Telegram 图片）'),
  ('deposit_submitted',         'zh', E'✅ 充值申请已提交！\n申请编号：#{req_id}\n请等待管理员审核。'),
  ('deposit_cancelled',         'zh', '❌ 已取消充值申请。'),
  ('deposit_promo_unavailable', 'zh', '⚠️ 该优惠已下线'),
  ('deposit_promo_invalid',     'zh', '该优惠不可用。'),
  ('deposit_promo_first_only',  'zh', '此优惠每位用户只能领取一次，您已达到领取上限。'),
  ('deposit_promo_daily_limit', 'zh', '此优惠今日已领取，请明天再来。'),
  ('deposit_promo_weekly_limit','zh', '此优惠本周已领取，请下周再来。'),
  -- WITHDRAW
  ('withdraw_not_registered',  'zh', '您尚未注册。请发送 /start 开始注册。'),
  ('withdraw_account_frozen',  'zh', '❌ 您的账号已被冻结，无法提交提款申请。'),
  ('withdraw_pending_exists',  'zh', '⚠️ 您有一个待审核的提款申请，请等待处理后再提交新申请。'),
  ('withdraw_no_game_account', 'zh', '⚠️ 您尚未领取任何游戏账号，请先在「🎮 我的游戏账号」领取账号。'),
  ('withdraw_select_platform', 'zh', E'💸 提款\n\n请选择游戏平台：'),
  ('withdraw_enter_amount',    'zh', E'请输入提款金额（RM）\n\n例如：\n100\n300\n500'),
  ('withdraw_amount_invalid',  'zh', E'⚠️ 输入格式错误\n\n请输入正确金额，例如：\n\n100\n300\n500'),
  ('withdraw_min_not_met',     'zh', E'⚠️ 最低提款金额为 RM {min_amount:.2f}\n\n请重新输入金额：'),
  ('withdraw_confirm',         'zh', E'💸 提款确认\n\n🎮 平台：{provider}\n👤 游戏账号：{game_username}\n💵 提款金额：RM {amount:.2f}\n\n🏦 收款银行：{bank_name}\n💳 收款账号：{bank_account}\n👤 账户名：{bank_holder_name}'),
  ('withdraw_submitted',       'zh', E'✅ 提款申请已提交！\n申请编号：#{req_id}\n请等待管理员审核。'),
  ('withdraw_cancelled',       'zh', '❌ 已取消提款申请。'),
  ('withdraw_invalid_platform','zh', '无效平台。'),
  -- GAME
  ('game_not_registered',        'zh', '您尚未注册。请发送 /start 开始注册。'),
  ('game_no_stock_available',    'zh', '🎮 当前没有可领取的账号，请联系客服。'),
  ('game_invalid_platform',      'zh', '无效的平台。'),
  ('game_no_stock_callback',     'zh', '⚠️ 当前暂无可用账号，请稍后再试或联系客服。'),
  ('game_claim_success',         'zh', E'✅ 领取成功\n\n🎮 平台：{provider}\n👤 账号：{username}\n🔑 密码：{password}'),
  ('game_no_accounts_to_change', 'zh', E'您尚未领取任何游戏账号。\n请先在「🎮 我的游戏账号」领取账号。'),
  ('game_select_change_platform','zh', '请选择要更换的游戏平台：'),
  ('game_change_cooldown',       'zh', E'❌ {provider} 距上次更换不足 {cooldown_hours} 小时。\n请于 {next_time} 后再试。'),
  ('game_no_new_stock',          'zh', E'⚠️ 当前没有可用的新账号。\n您的现有账号保持不变。{current_info}'),
  ('game_change_success',        'zh', E'✅ 更换成功\n\n🎮 平台：{provider}\n\n📤 旧账号：{old_username}\n📥 新账号：{new_username}\n🔑 密码：{new_password}'),
  ('game_account_not_found',     'zh', '找不到该平台账号。'),
  -- PROMOTION
  ('promo_none_active',    'zh', '目前暂无进行中的优惠。敬请期待！'),
  ('promo_list_header',    'zh', E'🎁 <b>优惠中心</b>\n\n请选择您感兴趣的优惠：'),
  ('promo_not_registered', 'zh', '您尚未注册。请发送 /start 开始注册。'),
  ('promo_unavailable',    'zh', '⚠️ 该优惠已下线'),
  ('promo_enter_amount',   'zh', E'🧮 请输入充值金额（RM）\n\n例如：\n100\n300\n500'),
  ('promo_expired',        'zh', '❌ 优惠已失效，已返回主菜单。'),
  ('promo_amount_invalid', 'zh', E'⚠️ 输入格式错误\n\n请输入正确金额，例如：\n\n100\n300\n500'),
  ('promo_min_not_met',    'zh', E'⚠️ 此优惠最低充值为 RM{min_dep:.2f}\n\n请重新输入金额：'),
  ('promo_my_claims_empty','zh', E'🎁 <b>我的优惠</b>\n\n您目前没有进行中的优惠。\n\n点击「🎁 优惠中心」查看可选择的优惠！'),
  ('bonus_disclaimer',     'zh', E'🚫 <b>违规声明</b>\n\n🔥 如发现任何违规、套利、对冲、对刷、刷流水或滥用优惠行为\n\n🔥 所有分数一律 BURN\n\n📋 平台保留最终决定权'),
  -- SUPPORT
  ('support_not_registered',    'zh', '您尚未注册。请发送 /start 开始注册。'),
  ('support_account_frozen',    'zh', '❌ 您的账号已被冻结，无法联系客服。'),
  ('support_session_exists',    'zh', E'⚠️ 您已有进行中的客服会话。\n\n会话编号：#{session_id}\n\n请直接发送消息继续沟通。'),
  ('support_menu',              'zh', E'💬 联系客服\n\n请描述您遇到的问题。\n\n支持：\n✅ 文字\n✅ 图片\n✅ 文件\n✅ 语音\n\n客服会尽快回复您。'),
  ('support_cancelled',         'zh', '❌ 已取消客服请求。'),
  ('support_system_busy',       'zh', '⚠️ 系统繁忙，请稍后重试。'),
  ('support_submitted',         'zh', E'✅ 客服请求已提交\n\n会话编号：\n#{session_id}\n\n客服将尽快为您服务。\n\n请保持在线。'),
  ('support_agent_joined',      'zh', E'✅ 客服已接入您的会话。\n\n请直接发送消息与客服沟通。'),
  ('support_session_closed_user','zh', E'🔚 客服会话已结束\n\n会话编号：\n#{session_id}\n\n如需再次咨询，\n请点击「📞 联系客服」。'),
  -- HISTORY
  ('history_deposit_empty',   'zh', E'📜 充值记录\n\n暂无充值记录。'),
  ('history_deposit_header',  'zh', '📜 充值记录（最近 10 条）'),
  ('history_withdraw_empty',  'zh', E'📜 提款记录\n\n暂无提款记录。'),
  ('history_withdraw_header', 'zh', '📜 提款记录（最近 10 条）'),
  -- PROFILE
  ('profile_header',              'zh', '👤 会员资料'),
  ('profile_phone',               'zh', '📱 电话号码：{phone}'),
  ('profile_bank_name',           'zh', '🏦 银行名称：{bank_name}'),
  ('profile_bank_account',        'zh', '💳 银行账号：{bank_account}'),
  ('profile_holder_name',         'zh', '👤 户口姓名：{bank_holder_name}'),
  ('profile_registered_at',       'zh', '📅 注册时间：{registered_at}'),
  ('profile_game_accounts_header','zh', '🎮 游戏平台账号'),
  ('profile_no_accounts',         'zh', '尚未领取任何账号'),
  ('profile_unclaimed',           'zh', '尚未领取：{providers}'),
  -- BUTTON
  ('btn_my_profile',     'zh', '📋 我的资料'),
  ('btn_game_accounts',  'zh', '🎮 我的游戏账号'),
  ('btn_deposit',        'zh', '💰 充值'),
  ('btn_withdraw',       'zh', '💸 提款'),
  ('btn_deposit_history','zh', '📜 充值记录'),
  ('btn_withdraw_history','zh','📜 提款记录'),
  ('btn_promotions',     'zh', '🎁 优惠中心'),
  ('btn_my_promotions',  'zh', '🎁 我的优惠'),
  ('btn_change_account', 'zh', '🔄 更换游戏账号'),
  ('btn_support',        'zh', '📞 联系客服'),
  ('btn_back',           'zh', '⬅️ 返回'),
  ('btn_home',           'zh', '🏠 主菜单'),
  ('btn_cancel',         'zh', '❌ 取消'),
  ('btn_register',       'zh', '✅ 注册会员'),
  ('btn_no_promo',       'zh', '无优惠'),
  ('btn_calculate_bonus','zh', '🧮 计算奖金'),
  ('btn_deposit_now',    'zh', '💰 立即充值'),
  ('btn_back_to_promos', 'zh', '⬅️ 返回优惠列表'),
  ('btn_recalculate',    'zh', '🔄 重新计算')
) AS v(msg_key, lang, content) ON k.message_key = v.msg_key
ON CONFLICT (key_id, language_code) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SEED: bot_buttons (static button group definitions)
-- main_menu: the 5x2 persistent reply keyboard
-- navigation: back / home / cancel reply keyboard
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO bot_buttons (group_key, label, language_code, button_payload, row_order, column_order, is_active) VALUES
  ('main_menu', '📋 我的资料',     'zh', '{"type":"reply"}', 0, 0, true),
  ('main_menu', '🎮 我的游戏账号', 'zh', '{"type":"reply"}', 0, 1, true),
  ('main_menu', '💰 充值',         'zh', '{"type":"reply"}', 1, 0, true),
  ('main_menu', '💸 提款',         'zh', '{"type":"reply"}', 1, 1, true),
  ('main_menu', '📜 充值记录',     'zh', '{"type":"reply"}', 2, 0, true),
  ('main_menu', '📜 提款记录',     'zh', '{"type":"reply"}', 2, 1, true),
  ('main_menu', '🎁 优惠中心',     'zh', '{"type":"reply"}', 3, 0, true),
  ('main_menu', '🎁 我的优惠',     'zh', '{"type":"reply"}', 3, 1, true),
  ('main_menu', '🔄 更换游戏账号', 'zh', '{"type":"reply"}', 4, 0, true),
  ('main_menu', '📞 联系客服',     'zh', '{"type":"reply"}', 4, 1, true),
  ('navigation', '⬅️ 返回',  'zh', '{"type":"reply"}', 0, 0, true),
  ('navigation', '🏠 主菜单', 'zh', '{"type":"reply"}', 1, 0, true),
  ('navigation', '❌ 取消',   'zh', '{"type":"reply"}', 2, 0, true)
ON CONFLICT DO NOTHING;
