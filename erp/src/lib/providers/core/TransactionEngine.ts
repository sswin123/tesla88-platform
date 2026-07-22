import pool from '@/lib/db';
import { adjustWallet } from '@/lib/services/wallet';
import type { ITransactionRepository } from '../interfaces/ITransactionRepository';
import type { IIdempotencyEngine } from '../interfaces/IIdempotencyEngine';
import {
  TRANSACTION_STATUS,
  TRANSACTION_TYPE,
  type TransactionType,
  type WalletOperationParams,
  type WalletOperationResult,
} from '../types/transaction.types';
import { randomUUID } from 'crypto';

const DEBIT_TYPES = new Set<TransactionType>([
  TRANSACTION_TYPE.BET,
  TRANSACTION_TYPE.FUND_REQUEST,
  TRANSACTION_TYPE.FREEZE,
]);

const CREDIT_TYPES = new Set<TransactionType>([
  TRANSACTION_TYPE.WIN,
  TRANSACTION_TYPE.REFUND,
  TRANSACTION_TYPE.ROLLBACK,
  TRANSACTION_TYPE.FUND_RETURN,
  TRANSACTION_TYPE.BONUS,
  TRANSACTION_TYPE.ADJUSTMENT,
]);

/**
 * Transaction Engine — orchestrates wallet balance changes for all game events.
 *
 * Every balance-modifying game operation flows through this service.  It:
 *  1. Checks idempotency (reject duplicates immediately)
 *  2. Opens a DB transaction
 *  3. Calls the existing adjustWallet() (which locks the user row)
 *  4. Records the operation in provider_transactions
 *  5. Commits atomically
 *
 * The SYSTEM_OPERATOR_ID is used as the operator for automated game callbacks.
 * Set GAME_SYSTEM_ADMIN_ID in your environment (defaults to 1 = super-admin).
 */
export class TransactionEngine {
  private readonly systemAdminId: number;

  constructor(
    private readonly txRepo: ITransactionRepository,
    private readonly idempotency: IIdempotencyEngine,
  ) {
    this.systemAdminId = parseInt(process.env.GAME_SYSTEM_ADMIN_ID ?? '1', 10);
  }

  async process(params: WalletOperationParams): Promise<WalletOperationResult> {
    // 1. Idempotency gate
    const claim = await this.idempotency.claim(params.provider, params.reference_id);
    if (!claim.claimed) {
      // Already processed — find the existing transaction record and return it
      const existing = await this.txRepo.findByReferenceId(params.provider, params.reference_id);
      const tx = existing[0];
      if (tx) {
        return {
          transaction_id: tx.transaction_id,
          balance_before: parseFloat(tx.before_balance ?? '0'),
          balance_after: parseFloat(tx.after_balance ?? '0'),
          currency: tx.currency,
          status: tx.status,
        };
      }
      throw new Error(
        `Idempotency: key (${params.provider}, ${params.reference_id}) already claimed but no transaction record found.`,
      );
    }

    // Determine wallet direction
    const isDebit = DEBIT_TYPES.has(params.type);
    const isCredit = CREDIT_TYPES.has(params.type);

    if (!isDebit && !isCredit) {
      // Balance query or informational — no wallet change needed
      const { rows } = await pool.query<{ net_deposit: string }>(
        `SELECT net_deposit FROM users WHERE id = $1`,
        [params.user_id],
      );
      const balance = parseFloat(rows[0]?.net_deposit ?? '0');
      return {
        transaction_id: randomUUID(),
        balance_before: balance,
        balance_after: balance,
        currency: params.currency,
        status: TRANSACTION_STATUS.SUCCESS,
      };
    }

    const transactionId = randomUUID();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const walletTx = await adjustWallet(client, {
        userId: params.user_id,
        type: 'PAYMENT_GATEWAY',
        direction: isDebit ? 'D' : 'C',
        amount: params.amount,
        gateway: params.provider,
        referenceNumber: params.reference_id,
        remark: `[GAME] ${params.type} | ${params.provider} | ${params.round_id ?? params.game_id ?? ''}`,
        operatorAdminId: this.systemAdminId,
      });

      const balanceBefore = parseFloat(walletTx.balance_before);
      const balanceAfter = parseFloat(walletTx.balance_after);

      await this.txRepo.create({
        provider: params.provider,
        transaction_id: transactionId,
        reference_id: params.reference_id,
        type: params.type,
        status: TRANSACTION_STATUS.SUCCESS,
        user_id: params.user_id,
        amount: params.amount,
        currency: params.currency,
        before_balance: balanceBefore,
        after_balance: balanceAfter,
        game_id: params.game_id ?? null,
        round_id: params.round_id ?? null,
        session_id: params.session_id ?? null,
        metadata: params.metadata ?? null,
      });

      await client.query('COMMIT');

      return {
        transaction_id: transactionId,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        currency: params.currency,
        status: TRANSACTION_STATUS.SUCCESS,
      };
    } catch (err) {
      // Use nested try/catch so a ROLLBACK failure doesn't swallow the
      // original error and doesn't prevent idempotency key cleanup.
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      // Release idempotency key so the operation can be retried.
      // If this fails too (e.g. total DB loss) the key stays claimed
      // but a DBA can clear it manually.
      try {
        await this.idempotency.release(params.provider, params.reference_id);
      } catch { /* ignore */ }
      throw err;
    } finally {
      client.release();
    }
  }

  /** Query player balance without performing any wallet operation. */
  async getBalance(userId: number): Promise<number> {
    const { rows } = await pool.query<{ net_deposit: string }>(
      `SELECT net_deposit FROM users WHERE id = $1`,
      [userId],
    );
    if (!rows[0]) throw new Error(`User ${userId} not found`);
    return parseFloat(rows[0].net_deposit);
  }
}
