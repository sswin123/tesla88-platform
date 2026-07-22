import { KISS918_CODE } from './constants';
import type { EventLogger } from '../../core/EventLogger';

/**
 * Kiss918CallbackLogger — structured callback logging for 918KISS.
 *
 * Wraps the shared EventLogger with 918KISS-specific context, providing
 * a two-phase logging pattern:
 *   1. logInbound()  — record the raw request as soon as it arrives.
 *   2. logComplete() — attach the response + latency after processing.
 *
 * This pattern ensures every callback is durably recorded even if the
 * processing step throws, enabling forensic replay.
 */
export class Kiss918CallbackLogger {
  constructor(private readonly logger: EventLogger) {}

  /**
   * Log an inbound 918KISS callback before processing begins.
   * @returns The log entry ID (pass to logComplete()).
   */
  async logInbound(
    action: string,
    body: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    ip: string | null,
  ): Promise<number> {
    return this.logger.log({
      provider:      KISS918_CODE,
      action,
      request_method:'POST',
      headers,
      json_body:     body,
      raw_body:      JSON.stringify(body),
      ip,
      user_agent:    typeof headers['user-agent'] === 'string' ? headers['user-agent'] : null,
    });
  }

  /**
   * Attach the processed response to an existing log entry.
   * The EventLogger.completeCallback() is a no-op in Phase G1 (response is
   * stored at creation time in async flows); this call is a forward-compatible
   * hook for Phase G5+ when log updates are wired to the DB.
   */
  async logComplete(
    logId: number,
    response: Record<string, unknown>,
    statusCode: number,
    latencyMs: number,
    error?: string | null,
  ): Promise<void> {
    await this.logger.completeCallback(logId, response, statusCode, latencyMs, error);
  }

  /** Mark the callback as needing retry (e.g. after a transient wallet error). */
  async markForRetry(logId: number): Promise<void> {
    await this.logger.markForRetry(logId);
  }
}
