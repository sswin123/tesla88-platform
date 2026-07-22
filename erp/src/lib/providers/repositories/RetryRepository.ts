import pool from '@/lib/db';
import type { IRetryRepository } from '../interfaces/IRetryRepository';
import type { RetryInput, RetryRecord, RetryStatus } from '../types/retry.types';

export class RetryRepository implements IRetryRepository {
  async enqueue(input: RetryInput): Promise<RetryRecord> {
    const { rows } = await pool.query<RetryRecord>(
      `INSERT INTO gp_retry_queue
         (provider, action, payload, max_attempts, next_attempt_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.provider,
        input.action,
        JSON.stringify(input.payload),
        input.max_attempts ?? 5,
        input.next_attempt_at ?? new Date().toISOString(),
      ],
    );
    return rows[0];
  }

  /**
   * Atomically claim up to `limit` pending jobs that are due for retry.
   * Sets status to PROCESSING to prevent concurrent workers picking the same job.
   */
  async claimDue(limit = 10): Promise<RetryRecord[]> {
    const { rows } = await pool.query<RetryRecord>(
      `UPDATE gp_retry_queue
       SET status = 'PROCESSING', updated_at = NOW()
       WHERE id IN (
         SELECT id FROM gp_retry_queue
         WHERE status = 'PENDING'
           AND next_attempt_at <= NOW()
         ORDER BY next_attempt_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [limit],
    );
    return rows;
  }

  async markSuccess(id: number): Promise<void> {
    await pool.query(
      `UPDATE gp_retry_queue SET status = 'SUCCESS', updated_at = NOW() WHERE id = $1`,
      [id],
    );
  }

  async markFailed(id: number, error: string, nextAttemptAt: Date): Promise<void> {
    await pool.query(
      `UPDATE gp_retry_queue
       SET status = 'PENDING',
           attempt_count = attempt_count + 1,
           last_error = $1,
           next_attempt_at = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [error, nextAttemptAt.toISOString(), id],
    );
  }

  async moveToDead(id: number, error: string): Promise<void> {
    await pool.query(
      `UPDATE gp_retry_queue
       SET status = 'DEAD',
           attempt_count = attempt_count + 1,
           last_error = $1,
           dead_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [error, id],
    );
  }

  async updateStatus(id: number, status: RetryStatus): Promise<void> {
    await pool.query(
      `UPDATE gp_retry_queue SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, id],
    );
  }

  async findDead(provider?: string, limit = 50): Promise<RetryRecord[]> {
    if (provider) {
      const { rows } = await pool.query<RetryRecord>(
        `SELECT * FROM gp_retry_queue
         WHERE status = 'DEAD' AND provider = $1
         ORDER BY dead_at DESC LIMIT $2`,
        [provider, limit],
      );
      return rows;
    }

    const { rows } = await pool.query<RetryRecord>(
      `SELECT * FROM gp_retry_queue
       WHERE status = 'DEAD'
       ORDER BY dead_at DESC LIMIT $1`,
      [limit],
    );
    return rows;
  }

  async requeue(id: number): Promise<void> {
    await pool.query(
      `UPDATE gp_retry_queue
       SET status = 'PENDING',
           next_attempt_at = NOW(),
           dead_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [id],
    );
  }
}
