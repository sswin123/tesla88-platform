// TransactionService — records and queries provider transactions.
// Writes to provider_transactions table (migration 056).
// All wallet operations go through here for audit trail + idempotency.

import pool from '@/lib/db';
import type { DebitRequest, CreditRequest, RollbackRequest, TransactionResult, Money } from './types';
import type { ITransactionRecorder } from './WalletService';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ProviderTransaction {
  id:            number;
  provider:      string;
  transactionId: string;
  referenceId:   string | null;
  type:          string;
  status:        string;
  userPublicId:  string | null;
  amount:        number | null;
  currency:      string;
  beforeBalance: number | null;
  afterBalance:  number | null;
  gameId:        string | null;
  roundId:       string | null;
  environment:   string;
  errorMessage:  string | null;
  createdAt:     string;
}

// ── TransactionService (implements ITransactionRecorder) ─────────────────────

export class TransactionService implements ITransactionRecorder {

  async isDuplicate(provider: string, transactionId: string): Promise<boolean> {
    const r = await pool.query<{ id: number }>(
      `SELECT id FROM provider_transactions
       WHERE provider = $1 AND transaction_id = $2 LIMIT 1`,
      [provider, transactionId]
    );
    return r.rows.length > 0;
  }

  async recordDebit(
    provider: string, req: DebitRequest, result: TransactionResult, before: Money
  ): Promise<void> {
    await this.upsert({
      provider,
      transaction_id: req.transactionId,
      reference_id:   req.referenceId ?? null,
      type:           'DEBIT',
      status:         result.status,
      user_public_id: req.member.userId,
      amount:         req.amount.amount,
      currency:       req.amount.currency,
      before_balance: before.amount,
      after_balance:  result.balance?.amount ?? null,
      game_id:        req.gameId ?? null,
      round_id:       req.roundId ?? null,
      error_message:  result.errorMessage ?? null,
    });
  }

  async recordCredit(
    provider: string, req: CreditRequest, result: TransactionResult, before: Money
  ): Promise<void> {
    await this.upsert({
      provider,
      transaction_id: req.transactionId,
      reference_id:   req.referenceId ?? null,
      type:           'CREDIT',
      status:         result.status,
      user_public_id: req.member.userId,
      amount:         req.amount.amount,
      currency:       req.amount.currency,
      before_balance: before.amount,
      after_balance:  result.balance?.amount ?? null,
      game_id:        req.gameId ?? null,
      round_id:       req.roundId ?? null,
      error_message:  result.errorMessage ?? null,
    });
  }

  async recordRollback(
    provider: string, req: RollbackRequest, result: TransactionResult
  ): Promise<void> {
    await this.upsert({
      provider,
      transaction_id: req.transactionId,
      reference_id:   req.originalTransactionId,
      type:           'ROLLBACK',
      status:         result.status,
      user_public_id: req.member.userId,
      amount:         null,
      currency:       req.member.currency,
      before_balance: null,
      after_balance:  result.balance?.amount ?? null,
      game_id:        null,
      round_id:       null,
      error_message:  result.errorMessage ?? null,
    });
  }

  async getTransaction(provider: string, transactionId: string): Promise<ProviderTransaction | null> {
    const r = await pool.query<{
      id: number; provider: string; transaction_id: string; reference_id: string | null;
      type: string; status: string; user_public_id: string | null;
      amount: string | null; currency: string;
      before_balance: string | null; after_balance: string | null;
      game_id: string | null; round_id: string | null;
      environment: string; error_message: string | null; created_at: string;
    }>(
      `SELECT id, provider, transaction_id, reference_id, type, status, user_public_id,
              amount, currency, before_balance, after_balance, game_id, round_id,
              environment, error_message, created_at::text
       FROM provider_transactions
       WHERE provider = $1 AND transaction_id = $2 LIMIT 1`,
      [provider, transactionId]
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      id:            row.id,
      provider:      row.provider,
      transactionId: row.transaction_id,
      referenceId:   row.reference_id,
      type:          row.type,
      status:        row.status,
      userPublicId:  row.user_public_id,
      amount:        row.amount !== null ? parseFloat(row.amount) : null,
      currency:      row.currency,
      beforeBalance: row.before_balance !== null ? parseFloat(row.before_balance) : null,
      afterBalance:  row.after_balance  !== null ? parseFloat(row.after_balance)  : null,
      gameId:        row.game_id,
      roundId:       row.round_id,
      environment:   row.environment,
      errorMessage:  row.error_message,
      createdAt:     row.created_at,
    };
  }

  private async upsert(row: {
    provider: string; transaction_id: string; reference_id: string | null;
    type: string; status: string; user_public_id: string;
    amount: number | null; currency: string;
    before_balance: number | null; after_balance: number | null;
    game_id: string | null; round_id: string | null; error_message: string | null;
  }): Promise<void> {
    await pool.query(
      `INSERT INTO provider_transactions
         (provider, transaction_id, reference_id, type, status, user_public_id,
          amount, currency, before_balance, after_balance, game_id, round_id, error_message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (provider, transaction_id)
       DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()`,
      [
        row.provider, row.transaction_id, row.reference_id, row.type, row.status,
        row.user_public_id, row.amount, row.currency, row.before_balance, row.after_balance,
        row.game_id, row.round_id, row.error_message,
      ]
    );
  }
}
