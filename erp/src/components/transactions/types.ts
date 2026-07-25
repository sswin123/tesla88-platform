export interface HandleDetail {
  id: number;
  type: 'deposit' | 'withdrawal';
  user_id: number;
  status: string;
  reject_reason: string | null;
  created_at: string;
  processing_by: number | null;
  processing_by_name: string | null;
  processing_at: string | null;
  approved_by: number | null;
  approved_at: string | null;
  rejected_by: number | null;
  rejected_at: string | null;
  first_name: string;
  phone: string;
  public_id: string | null;
  available_balance: string;
  // Deposit fields
  deposit_amount?: string;
  bonus_amount?: string;
  credit_amount?: string;
  payment_bank?: string;
  promo_name?: string | null;
  receiving_bank_name?: string | null;
  receiving_bank_account_name?: string | null;
  receiving_bank_account_number?: string | null;
  receiving_bank_qr_media_id?: number | null;
  // Withdrawal fields
  withdraw_amount?: string;
  provider?: string;
  game_username?: string;
  bank_name?: string;
  bank_account?: string;
  bank_holder_name?: string;
  receipt_media_id?: number | null;
  active_turnover_required?: string | null;
  active_turnover_completed?: string | null;
}

export const STATUS_CLASS: Record<string, string> = {
  PENDING:          'bg-yellow-100 text-yellow-800 border-yellow-200',
  PROCESSING:       'bg-blue-100 text-blue-800 border-blue-200',
  AWAITING_RECEIPT: 'bg-amber-100 text-amber-800 border-amber-200',
  APPROVED:         'bg-green-100 text-green-800 border-green-200',
  PAID:             'bg-green-100 text-green-800 border-green-200',
  REJECTED:         'bg-red-100 text-red-800 border-red-200',
};

export interface TimelineEvent {
  id: number;
  event: string;
  description: string | null;
  adminName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)} day ago`;
}
