/**
 * Retry queue types.
 * Maps to the gp_retry_queue table (migration 069).
 */

export type RetryStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'DEAD';

/** A retry queue entry. */
export interface RetryRecord {
  id: number;
  provider: string;
  action: string;
  payload: Record<string, unknown>;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  status: RetryStatus;
  dead_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Input for enqueuing a new retry job. */
export interface RetryInput {
  provider: string;
  action: string;
  payload: Record<string, unknown>;
  max_attempts?: number;
  /** ISO timestamp for first attempt; defaults to now. */
  next_attempt_at?: string;
}

/** Result of a retry-queue processing tick. */
export interface RetryTickResult {
  processed: number;
  succeeded: number;
  failed: number;
  moved_to_dead: number;
}
