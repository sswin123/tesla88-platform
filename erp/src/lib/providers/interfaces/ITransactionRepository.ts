import type { TransactionInput, TransactionRecord, TransactionStatus } from '../types/transaction.types';

/**
 * Data access contract for provider_transactions (migration 056).
 * The existing table is reused — no new transaction table is created.
 */
export interface ITransactionRepository {
  findByTransactionId(provider: string, transactionId: string): Promise<TransactionRecord | null>;

  findByReferenceId(provider: string, referenceId: string): Promise<TransactionRecord[]>;

  findByUser(userId: number, options?: TxQueryOptions): Promise<TransactionRecord[]>;

  create(input: TransactionInput): Promise<TransactionRecord>;

  updateStatus(
    id: number,
    status: TransactionStatus,
    patch?: Partial<Pick<TransactionInput, 'after_balance' | 'error_message' | 'metadata'>>,
  ): Promise<void>;
}

export interface TxQueryOptions {
  provider?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}
