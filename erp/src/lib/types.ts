export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'CS';

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
}

export interface DepositRow {
  id: number;
  user_id: number;
  provider: string;
  deposit_amount: string;
  bonus_amount: string;
  credit_amount: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  created_at: string;
  reviewed_at: string | null;
  first_name: string;
  phone: string;
  promo_name: string | null;
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

// ── Live Chat ────────────────────────────────────────────────────────────────

export type SessionStatus = 'OPEN' | 'ACTIVE' | 'CLOSED';

export interface SupportSession {
  id: number;
  user_id: number;
  agent_id: number | null;
  agent_username: string | null;
  status: SessionStatus;
  last_message_at: string;
  created_at: string;
  accepted_at: string | null;
  closed_at: string | null;
  close_reason: 'USER' | 'AGENT' | 'TIMEOUT' | null;
  // joined fields
  first_name?: string;
  phone?: string;
  telegram_id?: string;
}

export type MessageSenderType = 'USER' | 'AGENT';
export type MessageType = 'TEXT' | 'PHOTO' | 'DOCUMENT' | 'VOICE' | 'STICKER' | 'OTHER';

export interface SupportMessage {
  id: number;
  session_id: number;
  sender_type: MessageSenderType;
  message_type: MessageType;
  content: string | null;
  created_at: string;
}

// ── Payment Banks ────────────────────────────────────────────────────────────

export interface PaymentBank {
  id: number;
  bank_name: string;
  account_number: string;
  account_holder: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
