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
