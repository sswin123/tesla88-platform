export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'CS' | 'FINANCE' | 'SUPERVISOR' | 'SUPPORT';

export interface WebsiteAnnouncement {
  id: number;
  title: string;
  message: string;
  type: 'info' | 'promotion' | 'warning';
  link_url: string | null;
  display_order: number;
  is_active: boolean;
  start_at: string | null;
  end_at: string | null;
  created_at: string;
  updated_at: string;
}

export type LobbyIconType = 'none' | 'emoji' | 'image' | 'gif' | 'svg';

export interface LobbyIcon {
  icon_type: LobbyIconType;
  icon_emoji: string | null;
  icon_media_id: number | null;
  icon_svg: string | null;
}

export interface WebsiteLobbyCategory extends LobbyIcon {
  id: number;
  category_key: string;
  created_at: string;
  updated_at: string;
}

// Dynamic game lobby category (replaces hardcoded enum)
export interface WebsiteGameCategory extends LobbyIcon {
  id: number;
  category_code: string;
  category_name: string;
  display_order: number;
  is_default: boolean;
  is_active: boolean;
  // Image display settings (v2)
  image_display_size:  'auto' | 'small' | 'medium' | 'large' | 'custom';
  image_display_mode:  'contain' | 'cover' | 'stretch';
  image_custom_width:  number | null;
  image_custom_height: number | null;
  // Reserved future fields
  hover_animation:    string | null;
  border_style:       string | null;
  background_style:   string | null;
  shadow_style:       string | null;
  created_at: string;
  updated_at: string;
}

export interface WebsiteGameProvider extends LobbyIcon {
  id: number;
  provider_code: string;
  provider_name: string;
  category: string;         // legacy enum string — kept for backward compat
  category_id: number | null; // FK to website_game_categories
  logo_media_id: number | null;
  banner_media_id: number | null;
  is_hot: boolean;
  is_new: boolean;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface WebsiteGame extends LobbyIcon {
  id: number;
  provider_id: number | null;
  provider_name?: string | null;
  game_code: string;
  game_name: string;
  category: string;         // legacy enum string — kept for backward compat
  category_id: number | null; // FK to website_game_categories
  thumbnail_media_id: number | null;
  banner_media_id: number | null;
  is_hot: boolean;
  is_new: boolean;
  is_active: boolean;
  source: 'manual' | 'api';
  api_provider: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface WebsiteBanner {
  id: number;
  title: string;
  description: string | null;
  image_media_id: number | null;
  mobile_image_media_id: number | null;
  link_url: string | null;
  button_text: string | null;
  display_order: number;
  is_active: boolean;
  start_at: string | null;
  end_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ERPAdmin {
  id: number;
  telegram_id: string;
  erp_username: string;
  role: AdminRole;
  is_active: boolean;
  created_at: string;
}

export interface JWTPayload {
  sub: number;       // admins.id (integer)
  username: string;  // admins.erp_username
  role: AdminRole;
  iat: number;
  exp: number;
}

export interface Member {
  id: number;
  public_id: string | null;
  telegram_id: string;
  telegram_username: string | null;
  first_name: string;
  phone: string;
  status: 'ACTIVE' | 'FROZEN';
  total_deposit: string;
  total_withdraw: string;
  net_deposit: string;
  total_bonus: string;
  created_at: string;
}

export interface MemberDetail extends Member {
  bank_name: string;
  bank_account: string;
  bank_holder_name: string;
  deposit_count: number;
  withdrawal_count: number;
  remarks: string | null;
}

export interface DepositRow {
  id: number;
  user_id: number;
  provider: string;
  deposit_amount: string;
  bonus_amount: string;
  credit_amount: string;
  payment_bank: string;            // legacy text field (kept for backward compat)
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reject_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  first_name: string;
  phone: string;
  public_id: string | null;
  promo_name: string | null;
  // Receiving bank (from payment_banks JOIN via receiving_bank_id)
  receiving_bank_id: number | null;
  receiving_bank_name: string | null;
  receiving_bank_account_name: string | null;
  receiving_bank_account_number: string | null;
}

export interface DepositDetail {
  id: number;
  deposit_amount: string;
  bonus_amount: string;
  credit_amount: string;
  payment_bank: string;
  game_username: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  created_at: string;
  first_name: string;
  phone: string;
  public_id: string | null;
  promo_name: string | null;
  // Receiving bank full info
  receiving_bank_id: number | null;
  receiving_bank_name: string | null;
  receiving_bank_account_name: string | null;
  receiving_bank_account_number: string | null;
  receiving_bank_qr_media_id: number | null;
}

export interface WithdrawalRow {
  id: number;
  user_id: number;
  provider: string;
  game_username: string;
  withdraw_amount: string;
  bank_name: string;
  bank_account: string;
  bank_holder_name: string;
  status: 'PENDING' | 'PAID' | 'REJECTED';
  reject_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  first_name: string;
  phone: string;
}

export interface DashboardStats {
  totalMembers: number;
  activeMembers: number;
  totalDeposits: number;
  totalWithdrawals: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
  todayDepositAmount: number;
  todayDepositCount: number;
  todayWithdrawalAmount: number;
  todayWithdrawalCount: number;
  depositChart: { date: string; amount: number; count: number }[];
  withdrawalChart: { date: string; amount: number; count: number }[];
  topPromotions: { name: string; claim_count: number }[];
  topDepositors: { first_name: string; total: number }[];
  // NEW fields
  todayBonusAmount: number;
  todayNetDeposit: number;
  todayProfit: number;
  newMembersToday: number;
  activeMembersToday: number;
  onlineSupportStaff: number;
  topGameProviders: { provider: string; deposit_count: number; deposit_amount: number }[];
  monthlyRevenue: { month: string; net: number; deposit: number; withdrawal: number }[];
  // Dashboard 2.0 — new fields
  vipMembers: number;
  onlineMembers: number;
  openLiveChats: number;
  waitingCustomers: number;
  broadcastSentToday: number;
  weeklyDepositAmount: number;
  thisMonthDepositAmount: number;
  avgResponseTimeSeconds: number;
  chatSessionsToday: number;
  csPerformance: { agent: string; sessions: number }[];
  thirtyDayChart: { date: string; deposit: number; withdrawal: number }[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// ── Promotions ──────────────────────────────────────────────────────────────

export type PromotionType = 'FIRST_DEPOSIT' | 'DAILY' | 'UNLIMITED' | 'MANUAL' | 'WEEKLY';
export type BonusType = 'PERCENTAGE' | 'FIXED';
export type TurnoverType = 'BONUS' | 'DEPOSIT';

export interface Promotion {
  id: number;
  name: string;
  description: string | null;
  promotion_type: PromotionType;
  bonus_type: BonusType;
  bonus_value: string;
  min_deposit: string;
  max_bonus: string | null;
  turnover_multiplier: string;
  turnover_type: TurnoverType;
  allowed_games: string[];
  is_active: boolean;
  expiry_date: string | null;   // new
  deleted_at: string | null;    // new — soft delete
  created_at: string;
  updated_at: string;
}

export type BonusClaimStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface BonusClaim {
  id: number;
  user_id: number;
  promotion_id: number;
  deposit_amount: string;
  bonus_amount: string;
  total_credit: string;
  turnover_required: string;
  turnover_completed: string;
  status: BonusClaimStatus;
  claimed_at: string;
  completed_at: string | null;
  promo_name?: string;
}

// ── Customer Tags ─────────────────────────────────────────────────────────────

export interface CustomerTag {
  id: number;
  name: string;
  color: string;
  created_at: string;
}

export interface UserTagAssignment {
  user_id: number;
  tag_id: number;
  tag_name: string;
  tag_color: string;
  assigned_by: string;
  assigned_at: string;
}

// ── Live Chat ────────────────────────────────────────────────────────────────

export type SessionStatus = 'OPEN' | 'ACTIVE' | 'CLOSED';
export type MessageSenderType = 'USER' | 'AGENT';
export type MessageType =
  | 'TEXT' | 'PHOTO' | 'DOCUMENT' | 'VOICE' | 'STICKER'
  | 'VIDEO' | 'VIDEO_NOTE' | 'AUDIO' | 'ANIMATION' | 'OTHER';

export interface SupportSession {
  id: number;
  user_id: number | null;
  guest_id?: string | null;
  source?: string | null;
  agent_id: number | null;
  agent_username: string | null;
  assigned_to_username: string | null;  // NEW: ERP assignment
  status: SessionStatus;
  erp_unread_count: number;             // NEW
  pinned_at: string | null;             // NEW
  muted_until: string | null;
  last_message_at: string;
  created_at: string;
  accepted_at: string | null;
  closed_at: string | null;
  close_reason: 'USER' | 'AGENT' | 'TIMEOUT' | null;
  // joined from users table
  first_name?: string;
  phone?: string;
  telegram_id?: string;
  telegram_username?: string;           // NEW: joined from users.telegram_username
  public_id?: string | null;
  // computed / aggregated
  last_message_content?: string;        // NEW: last message preview text
  last_message_type?: MessageType;      // NEW
  tags?: CustomerTag[];                 // populated by getSessionsLiveChat
}

export interface SupportMessage {
  id: number;
  session_id: number;
  sender_type: MessageSenderType;
  message_type: MessageType;
  content: string | null;
  caption: string | null;
  file_name: string | null;
  file_size: number | null;
  user_msg_id: number | null;
  group_msg_id: number | null;
  created_at: string;
  // Phase 5.2 additions
  reply_to_message_id: number | null;
  reply_to_content: string | null;
  reply_to_sender_type: string | null;
  status: string | null;
}

export interface SessionSummary {
  id: number;
  status: SessionStatus;
  created_at: string;
  closed_at: string | null;
  assigned_to_username: string | null;
}

export interface LiveChatSSEEvent {
  type: 'new_message' | 'session_update';
  session_id: number;
  user_id?: number;          // present on new_message events after migration 023
  message_id?: number;
  sender_type?: MessageSenderType;
  status?: SessionStatus;
}

export interface MemberCardData {
  id: number;
  first_name: string;
  telegram_id: string;
  telegram_username: string | null;
  phone: string;
  status: 'ACTIVE' | 'FROZEN';
  created_at: string;
  last_seen_at: string | null;
  // Financials
  total_deposit: string;
  total_withdraw: string;
  total_bonus: string;
  net_deposit: string;
  // Last transactions
  last_deposit_at: string | null;
  last_deposit_amount: string | null;
  last_withdrawal_at: string | null;
  last_withdrawal_amount: string | null;
  // Bank
  bank_name: string;
  bank_account: string;
  bank_holder_name: string;
  // Game accounts
  game_accounts: { provider: string; username: string; display_name?: string | null; logo_media_id?: number | null }[];
  // Current promotion (null if none active)
  current_promotion: { name: string; bonus_amount: string; status: string } | null;
  // Previous sessions (up to 5, excluding current)
  previous_sessions: SessionSummary[];
  // Customer tags
  tags: CustomerTag[];
}

// ── Payment Banks ────────────────────────────────────────────────────────────

export interface PaymentBank {
  id: number;
  bank_name: string;
  account_number: string;
  account_name: string;
  qr_image: string | null;
  qr_media_id: number | null;
  instructions: string | null;
  is_active: boolean;
  display_order: number;
  maintenance_mode: boolean;
  maintenance_message: string | null;
  provider_binding: string | null;
  priority: number;
  created_at: string;
  updated_at: string;
}

// ── Audit Log ─────────────────────────────────────────────────────────────

export interface AuditLog {
  id: number;
  admin_id: number;
  action: string;
  target_type: string;
  target_id: number | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
  // joined
  admin_username?: string;
}

export type QuickReplyContentType =
  | 'TEXT' | 'IMAGE' | 'GIF' | 'VIDEO' | 'AUDIO' | 'VOICE'
  | 'DOCUMENT' | 'PDF' | 'APK' | 'ZIP' | 'RAR';

export interface QuickReplyCategory {
  id: number;
  name: string;
  sort_order: number;
}

export interface QuickReply {
  id: number;
  category_id: number | null;
  category_name: string | null;
  title: string;
  /** Text body. For TEXT type: the sent message. For media types: supplementary text. */
  body: string;
  /** Optional caption displayed under media. */
  caption: string | null;
  content_type: QuickReplyContentType;
  /** FK to media_library. NULL for TEXT type. */
  media_id: number | null;
  /** Joined media record — present in admin responses. */
  media?: import('@/lib/media/types').MediaRecord;
  is_active: boolean;
  sort_order: number;
  is_favorite?: boolean;
  pinned: boolean;
  archived_at: string | null;
  archived_by: string | null;
  usage_count: number;
  last_used_at: string | null;
  used_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

export interface SessionNote {
  id: number;
  session_id: number;
  author: string;
  body: string;
  created_at: string;
}

// ── Member Analytics ─────────────────────────────────────────────────────────

export interface MemberAnalytics {
  total_members: number;
  active_30d: number;
  first_deposit_rate: number;
  retention_rate_30d: number;
  new_members_daily: { date: string; count: number }[];
  top_depositors: { id: number; first_name: string; total: number; count: number }[];
  top_bonus_users: { id: number; first_name: string; total: number; claims: number }[];
  referral_stats: {
    referred_members: number;
    organic_members: number;
    active_referrers: number;
  };
  top_promotions_by_members: { name: string; member_count: number }[];
}

// ── Risk Center ──────────────────────────────────────────────────────────────

export interface RiskScanResult {
  duplicate_phones: { phone: string; user_count: number; user_ids: number[]; names: string[] }[];
  duplicate_banks: { bank_account: string; bank_name: string; user_count: number; user_ids: number[]; names: string[] }[];
  high_bonus_ratio: { id: number; first_name: string; total_dep: number; total_bonus: number; bonus_ratio: number }[];
  frequent_withdrawals: { id: number; first_name: string; withdrawal_count: number }[];
  rapid_pattern: { id: number; first_name: string; rapid_count: number }[];
}

export interface RiskFlag {
  id: number;
  user_id: number;
  user_name?: string;
  risk_type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'OPEN' | 'IGNORED' | 'REVIEWED';
  note: string | null;
  flagged_by: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Providers ────────────────────────────────────────────────────────────────

export interface Provider {
  id: number;
  name: string;
  display_name: string;
  description: string | null;
  logo_url: string | null;
  status: 'ACTIVE' | 'DISABLED' | 'MAINTENANCE';
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ── Game Account Pool ────────────────────────────────────────────────────────

export interface AccountPoolRow {
  id: number;
  provider: string;
  username: string;
  password?: string;  // only populated during import, not returned in list queries
  status: 'AVAILABLE' | 'ASSIGNED' | 'DISABLED';
  assigned_user_id: number | null;
  assigned_user_name: string | null;
  assigned_at: string | null;
  note: string | null;
  created_at: string;
}

export interface AccountStats {
  total: number;
  available: number;
  assigned: number;
  disabled: number;
  by_provider: { provider: string; available: number; assigned: number; disabled: number }[];
}

// ── Announcements ────────────────────────────────────────────────────────────

export interface Announcement {
  id: number;
  title: string;
  content: string;
  type: 'POPUP' | 'BANNER' | 'TICKER' | 'BROADCAST';
  target: 'ALL' | 'VIP' | 'TAG';
  target_tag_id: number | null;
  target_tag_name: string | null;  // joined from customer_tags
  status: 'DRAFT' | 'ACTIVE' | 'SCHEDULED' | 'ENDED';
  start_at: string | null;
  end_at: string | null;
  created_by: string;
  sent_count: number;
  created_at: string;
  updated_at: string;
}

// ── System Settings ──────────────────────────────────────────────────────────

export interface SystemSetting {
  key: string;
  value: string;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
}

// ── Finance Reports ──────────────────────────────────────────────────────────

export interface FinanceReport {
  period_start: string;
  period_end: string;
  total_deposit: number;
  total_withdrawal: number;
  total_bonus: number;
  net_deposit: number;
  gross_profit: number;
  deposit_count: number;
  withdrawal_count: number;
  avg_deposit: number;
  avg_withdrawal: number;
  first_deposit_count: number;
  repeat_deposit_count: number;
  vip_deposit_amount: number;
  daily_breakdown: {
    date: string;
    deposit: number;
    withdrawal: number;
    bonus: number;
    net: number;
  }[];
}

// ── Broadcast ────────────────────────────────────────────────────────────────

export type BroadcastContentType =
  | 'TEXT' | 'IMAGE' | 'GIF' | 'VIDEO' | 'AUDIO'
  | 'DOCUMENT' | 'PDF' | 'APK' | 'ZIP' | 'RAR';

export type BroadcastAudienceType =
  | 'ALL' | 'TAG' | 'VIP' | 'ACTIVE' | 'INACTIVE'
  | 'NEVER_DEPOSIT' | 'DEPOSITED' | 'SELECTED';

export type BroadcastStatus =
  | 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT'
  | 'PARTIALLY_SENT' | 'FAILED' | 'CANCELLED';

export type BroadcastChannel = 'TELEGRAM' | 'LIVECHAT';

export interface Broadcast {
  id: number;
  title: string;
  content_type: BroadcastContentType;
  body: string;
  caption: string | null;
  media_id: number | null;
  media?: import('@/lib/media/types').MediaRecord;
  channels: BroadcastChannel[];
  audience_type: BroadcastAudienceType;
  audience_tag_id: number | null;
  audience_tag_name: string | null;
  audience_user_ids: number[] | null;
  status: BroadcastStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  recipient_count: number;
  success_count: number;
  failed_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateBroadcastInput {
  title: string;
  content_type: BroadcastContentType;
  body: string;
  caption?: string | null;
  media_id?: number | null;
  channels: BroadcastChannel[];
  audience_type: BroadcastAudienceType;
  audience_tag_id?: number | null;
  audience_user_ids?: number[] | null;
  status?: BroadcastStatus;
  scheduled_at?: string | null;
}

// ── Website ──────────────────────────────────────────────────────────────────

export interface ApkVersion {
  id: number;
  version_name: string;
  version_code: number;
  release_notes: string | null;
  media_id: number | null;
  min_android: string;
  is_current: boolean;
  force_update: boolean;
  download_count: number;
  created_by: string;
  created_at: string;
}

export interface WebsiteSettings {
  site_brand_name: string;
  site_primary_color: string;
  site_logo_media_id: string;
  site_banner_text: string;
  site_banner_media_id: string;
  site_contact_email: string;
  site_contact_phone: string;
  site_seo_title: string;
  site_seo_description: string;
  site_terms_url: string;
  website_enabled: string;
}
