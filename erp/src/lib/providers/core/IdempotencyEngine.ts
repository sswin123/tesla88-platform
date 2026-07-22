import pool from '@/lib/db';
import type { IIdempotencyEngine, IdempotencyClaimResult } from '../interfaces/IIdempotencyEngine';

/**
 * Idempotency Engine — prevents duplicate wallet operations.
 *
 * Uses the provider_callback_idempotency table (migration 055) as the
 * backing store.  The UNIQUE constraint on (provider, idempotency_key)
 * is the database-level safety net; this class provides the application
 * interface on top of it.
 */
export class IdempotencyEngine implements IIdempotencyEngine {
  async claim(provider: string, referenceId: string): Promise<IdempotencyClaimResult> {
    try {
      await pool.query(
        `INSERT INTO provider_callback_idempotency (provider, idempotency_key)
         VALUES ($1, $2)`,
        [provider, referenceId],
      );
      return { claimed: true, existingLogId: null };
    } catch (err: unknown) {
      // Unique constraint violation → already processed
      if (isUniqueViolation(err)) {
        const existing = await this.getExistingLogId(provider, referenceId);
        return { claimed: false, existingLogId: existing };
      }
      throw err;
    }
  }

  async link(provider: string, referenceId: string, logId: number): Promise<void> {
    await pool.query(
      `UPDATE provider_callback_idempotency
       SET callback_log_id = $1
       WHERE provider = $2 AND idempotency_key = $3`,
      [logId, provider, referenceId],
    );
  }

  async release(provider: string, referenceId: string): Promise<void> {
    await pool.query(
      `DELETE FROM provider_callback_idempotency
       WHERE provider = $1 AND idempotency_key = $2`,
      [provider, referenceId],
    );
  }

  async isDuplicate(provider: string, referenceId: string): Promise<boolean> {
    const { rows } = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM provider_callback_idempotency
         WHERE provider = $1 AND idempotency_key = $2
       ) AS exists`,
      [provider, referenceId],
    );
    return rows[0]?.exists ?? false;
  }

  private async getExistingLogId(provider: string, referenceId: string): Promise<number | null> {
    const { rows } = await pool.query<{ callback_log_id: number | null }>(
      `SELECT callback_log_id FROM provider_callback_idempotency
       WHERE provider = $1 AND idempotency_key = $2`,
      [provider, referenceId],
    );
    return rows[0]?.callback_log_id ?? null;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === '23505'
  );
}
