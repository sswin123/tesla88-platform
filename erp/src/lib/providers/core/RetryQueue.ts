import type { IRetryRepository } from '../interfaces/IRetryRepository';
import type { RetryInput, RetryTickResult } from '../types/retry.types';
import type { ProviderRegistry } from './ProviderRegistry';

/**
 * Retry Queue — processes failed wallet callbacks with exponential backoff.
 *
 * The queue is drained by a background job (e.g. a cron route or a
 * Next.js route handler at /api/internal/retry-tick).  Each tick claims
 * up to N pending jobs, dispatches them, and updates their status.
 *
 * Backoff schedule (attempt_count → delay):
 *   1 → 30s, 2 → 2m, 3 → 10m, 4 → 1h, 5 → dead
 */
export class RetryQueue {
  private static readonly BACKOFF_SECONDS = [30, 120, 600, 3600];

  constructor(
    private readonly repo: IRetryRepository,
    private readonly registry: ProviderRegistry,
  ) {}

  /** Enqueue a new retry job. */
  async enqueue(input: RetryInput): Promise<void> {
    await this.repo.enqueue(input);
  }

  /**
   * Process one batch of due retry jobs.
   * @param batchSize Maximum number of jobs to process per tick.
   */
  async tick(batchSize = 10): Promise<RetryTickResult> {
    const jobs = await this.repo.claimDue(batchSize);
    const result: RetryTickResult = { processed: 0, succeeded: 0, failed: 0, moved_to_dead: 0 };

    for (const job of jobs) {
      result.processed++;
      try {
        // Re-dispatch the action through the provider adapter
        const adapter = this.registry.get(job.provider);
        await this.dispatch(adapter, job.action, job.payload);
        await this.repo.markSuccess(job.id);
        result.succeeded++;
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        const nextAttempt = job.attempt_count + 1;

        if (nextAttempt >= job.max_attempts) {
          await this.repo.moveToDead(job.id, error);
          result.moved_to_dead++;
        } else {
          const delaySeconds = RetryQueue.BACKOFF_SECONDS[nextAttempt - 1] ?? 3600;
          const nextAttemptAt = new Date(Date.now() + delaySeconds * 1000);
          await this.repo.markFailed(job.id, error, nextAttemptAt);
          result.failed++;
        }
      }
    }

    return result;
  }

  /**
   * Re-dispatch a retry action through the correct adapter.
   * Each `action` string maps to a method on the adapter.
   * This method is extended as new callback types are introduced.
   */
  private async dispatch(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adapter: any,
    action: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    // Adapters expose a retryAction() method for re-playing callbacks.
    // If the adapter doesn't implement it, throw to move the job to dead.
    if (typeof adapter.retryAction === 'function') {
      await adapter.retryAction(action, payload);
      return;
    }
    throw new Error(
      `Adapter "${adapter.code}" does not implement retryAction(). Cannot retry "${action}".`,
    );
  }
}
