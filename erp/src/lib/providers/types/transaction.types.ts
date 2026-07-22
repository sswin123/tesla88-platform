/**
 * Transaction Engine types.
 * Maps to the provider_transactions table (migration 056).
 */

export const TRANSACTION_TYPE = {
  BALANCE_QUERY: 'BALANCE_QUERY',
  BET: 'DEBIT',           // Bet = wallet debit
  WIN: 'CREDIT',          // BetResult / JackpotWin = wallet credit
  REFUND: 'REFUND',
  ROLLBACK: 'ROLLBACK',
  FUND_REQUEST: 'FUND_REQUEST',
  FUND_RETURN: 'FUND_RETURN',
  FREEZE: 'FREEZE',
  UNFREEZE: 'UNFREEZE',
  SETTLEMENT: 'SETTLEMENT',
  BONUS: 'BONUS',
  ADJUSTMENT: 'ADJUSTMENT',
} as const;

export type TransactionType = (typeof TRANSACTION_TYPE)[keyof typeof TRANSACTION_TYPE];

export const TRANSACTION_STATUS = {
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  ROLLED_BACK: 'ROLLED_BACK',
  DUPLICATE: 'DUPLICATE',
} as const;

export type TransactionStatus = (typeof TRANSACTION_STATUS)[keyof typeof TRANSACTION_STATUS];

/** A transaction record from provider_transactions. */
export interface TransactionRecord {
  id: number;
  provider: string;
  transaction_id: string;
  reference_id: string | null;
  type: string;
  status: TransactionStatus;
  user_id: number | null;
  user_public_id: string | null;
  amount: string;
  currency: string;
  before_balance: string | null;
  after_balance: string | null;
  game_id: string | null;
  round_id: string | null;
  session_id: number | null;
  environment: string;
  metadata: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/** Input for creating a new provider transaction record. */
export interface TransactionInput {
  provider: string;
  transaction_id: string;
  reference_id?: string | null;
  type: string;
  status?: TransactionStatus;
  user_id?: number | null;
  user_public_id?: string | null;
  amount?: number;
  currency?: string;
  before_balance?: number | null;
  after_balance?: number | null;
  game_id?: string | null;
  round_id?: string | null;
  session_id?: number | null;
  environment?: string;
  metadata?: Record<string, unknown> | null;
  error_message?: string | null;
}

/** Parameters passed to the TransactionEngine for a wallet operation. */
export interface WalletOperationParams {
  provider: string;
  user_id: number;
  amount: number;
  currency: string;
  type: TransactionType;
  reference_id: string;
  game_id?: string | null;
  round_id?: string | null;
  session_id?: number | null;
  round_details?: string | null;
  metadata?: Record<string, unknown>;
}

/** Result returned by the TransactionEngine after a wallet operation. */
export interface WalletOperationResult {
  transaction_id: string;
  balance_before: number;
  balance_after: number;
  currency: string;
  status: TransactionStatus;
}
