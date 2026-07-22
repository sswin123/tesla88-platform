import type { RetryInput, RetryRecord, RetryStatus } from '../types/retry.types';

/** Data access contract for gp_retry_queue (migration 069). */
export interface IRetryRepository {
  enqueue(input: RetryInput): Promise<RetryRecord>;

  claimDue(limit?: number): Promise<RetryRecord[]>;

  markSuccess(id: number): Promise<void>;

  markFailed(id: number, error: string, nextAttemptAt: Date): Promise<void>;

  moveToDead(id: number, error: string): Promise<void>;

  updateStatus(id: number, status: RetryStatus): Promise<void>;

  findDead(provider?: string, limit?: number): Promise<RetryRecord[]>;

  requeue(id: number): Promise<void>;
}
