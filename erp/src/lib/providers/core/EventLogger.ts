import type { IEventRepository } from '../interfaces/IEventRepository';
import type { EventLogInput } from '../types/event.types';

/**
 * Event Logger — records every inbound wallet callback and outbound API call.
 *
 * This is the production debugging layer: every callback that enters the
 * platform is logged with its full request and response bodies so that
 * support can reconstruct any transaction dispute.
 */
export class EventLogger {
  constructor(private readonly repo: IEventRepository) {}

  /**
   * Log an inbound wallet callback.
   * @returns The generated log entry ID (used for idempotency linking).
   */
  async logCallback(
    provider: string,
    action: string,
    input: Omit<EventLogInput, 'provider' | 'action'>,
  ): Promise<number> {
    return this.repo.create({ provider, action, ...input });
  }

  /**
   * Update an existing log entry with the response details.
   * Call this after the callback has been processed.
   */
  async completeCallback(
    logId: number,
    response: Record<string, unknown>,
    statusCode: number,
    processingTimeMs: number,
    errorMessage?: string | null,
  ): Promise<void> {
    // The provider_callback_logs table doesn't have an update path exposed via
    // the repository — we store the response at creation time via the input.
    // For Phase G1, responses are included in the initial log call when
    // processing is synchronous.  This method is a hook for future async flows.
    void logId; void response; void statusCode; void processingTimeMs; void errorMessage;
  }

  /** Mark a log entry as needing retry. */
  async markForRetry(logId: number): Promise<void> {
    await this.repo.markRetryNeeded(logId);
  }

  /** Convenience: log a callback and return the log ID in one call. */
  async log(input: EventLogInput): Promise<number> {
    return this.repo.create(input);
  }
}
