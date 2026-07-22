/**
 * Idempotency Engine contract.
 *
 * Every wallet callback that modifies the player's balance MUST pass through
 * this engine before the operation executes.  The engine guarantees that a
 * given (provider, referenceId) pair is only processed once regardless of
 * how many times the PROVIDER retries.
 */
export interface IIdempotencyEngine {
  /**
   * Attempt to claim a key.
   *
   * @returns `{ claimed: true }` if this is the first time the key is seen
   *          and the operation should proceed.
   *          `{ claimed: false, existingLogId }` if the key was already
   *          processed — the caller should return the original response.
   */
  claim(provider: string, referenceId: string): Promise<IdempotencyClaimResult>;

  /**
   * Associate a previously claimed key with the callback log entry that
   * processed it.  Call this after the callback log row has been inserted.
   */
  link(provider: string, referenceId: string, logId: number): Promise<void>;

  /**
   * Release a claim that was never completed (e.g., the process crashed
   * before committing).  This allows the operation to be retried.
   */
  release(provider: string, referenceId: string): Promise<void>;

  /** Check whether a key has already been processed. */
  isDuplicate(provider: string, referenceId: string): Promise<boolean>;
}

export type IdempotencyClaimResult =
  | { claimed: true; existingLogId: null }
  | { claimed: false; existingLogId: number | null };
