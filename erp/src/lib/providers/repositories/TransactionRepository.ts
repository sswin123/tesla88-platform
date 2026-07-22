import pool from '@/lib/db';
import type { ITransactionRepository, TxQueryOptions } from '../interfaces/ITransactionRepository';
import type { TransactionInput, TransactionRecord, TransactionStatus } from '../types/transaction.types';

export class TransactionRepository implements ITransactionRepository {
  async findByTransactionId(
    provider: string,
    transactionId: string,
  ): Promise<TransactionRecord | null> {
    const { rows } = await pool.query<TransactionRecord>(
      `SELECT * FROM provider_transactions WHERE provider = $1 AND transaction_id = $2`,
      [provider, transactionId],
    );
    return rows[0] ?? null;
  }

  async findByReferenceId(
    provider: string,
    referenceId: string,
  ): Promise<TransactionRecord[]> {
    const { rows } = await pool.query<TransactionRecord>(
      `SELECT * FROM provider_transactions
       WHERE provider = $1 AND reference_id = $2
       ORDER BY created_at ASC`,
      [provider, referenceId],
    );
    return rows;
  }

  async findByUser(userId: number, opts: TxQueryOptions = {}): Promise<TransactionRecord[]> {
    const conditions: string[] = ['user_id = $1'];
    const values: unknown[] = [userId];
    let i = 2;

    if (opts.provider) {
      conditions.push(`provider = $${i++}`);
      values.push(opts.provider);
    }
    if (opts.from) {
      conditions.push(`created_at >= $${i++}`);
      values.push(opts.from.toISOString());
    }
    if (opts.to) {
      conditions.push(`created_at <= $${i++}`);
      values.push(opts.to.toISOString());
    }

    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    const { rows } = await pool.query<TransactionRecord>(
      `SELECT * FROM provider_transactions
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...values, limit, offset],
    );
    return rows;
  }

  async create(input: TransactionInput): Promise<TransactionRecord> {
    const { rows } = await pool.query<TransactionRecord>(
      `INSERT INTO provider_transactions
         (provider, transaction_id, reference_id, type, status,
          user_id, user_public_id, amount, currency,
          before_balance, after_balance,
          game_id, round_id, session_id, environment,
          metadata, error_message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        input.provider,
        input.transaction_id,
        input.reference_id ?? null,
        input.type,
        input.status ?? 'PENDING',
        input.user_id ?? null,
        input.user_public_id ?? null,
        input.amount ?? 0,
        input.currency ?? 'MYR',
        input.before_balance ?? null,
        input.after_balance ?? null,
        input.game_id ?? null,
        input.round_id ?? null,
        input.session_id ?? null,
        input.environment ?? 'PRODUCTION',
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.error_message ?? null,
      ],
    );
    return rows[0];
  }

  async updateStatus(
    id: number,
    status: TransactionStatus,
    patch?: Partial<Pick<TransactionInput, 'after_balance' | 'error_message' | 'metadata'>>,
  ): Promise<void> {
    if (!patch || Object.keys(patch).length === 0) {
      await pool.query(
        `UPDATE provider_transactions SET status = $1, updated_at = NOW() WHERE id = $2`,
        [status, id],
      );
      return;
    }

    const fields: string[] = ['status = $1', 'updated_at = NOW()'];
    const values: unknown[] = [status];
    let i = 2;

    if ('after_balance' in patch) {
      fields.push(`after_balance = $${i++}`);
      values.push(patch.after_balance ?? null);
    }
    if ('error_message' in patch) {
      fields.push(`error_message = $${i++}`);
      values.push(patch.error_message ?? null);
    }
    if ('metadata' in patch && patch.metadata !== undefined) {
      fields.push(`metadata = $${i++}`);
      values.push(JSON.stringify(patch.metadata));
    }

    values.push(id);
    await pool.query(
      `UPDATE provider_transactions SET ${fields.join(', ')} WHERE id = $${i}`,
      values,
    );
  }
}
