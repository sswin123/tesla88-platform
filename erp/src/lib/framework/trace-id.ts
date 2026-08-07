/**
 * TraceIdGenerator — Gaming Provider Framework Phase 3
 *
 * Generates structured trace IDs that link all events in a single gaming
 * session (GAME_LAUNCH_START → Transfer → Bet → Win → Sync) so CS / Audit /
 * Finance can query the full lifecycle from one trace_id.
 *
 * Format:  {PREFIX}-{YYYYMMDD}-{8 hex chars}
 * Example: GS-20260807-a3f9c12e
 *
 * Prefixes:
 *   GS — Gaming Session (minted by GamingActivityService on LaunchStart)
 *
 * Future prefixes (not yet in use):
 *   TX — Financial Transaction
 *   OR — Withdrawal / Deposit Order
 *   AP — API Request
 *
 * This utility has no dependencies — it is a pure function suitable for
 * use in any service without risk of circular imports.
 */

import { randomBytes } from 'crypto';

export type TraceIdPrefix = 'GS' | 'TX' | 'OR' | 'AP';

/**
 * Generate a structured trace ID.
 *
 * @param prefix  Short uppercase prefix identifying the trace domain.
 *                Defaults to 'GS' (Gaming Session).
 * @returns       A string of the form `{prefix}-{YYYYMMDD}-{8 hex chars}`.
 *                Cryptographically random — safe for concurrent sessions.
 *
 * @example
 *   generateTraceId()       // 'GS-20260807-a3f9c12e'
 *   generateTraceId('TX')   // 'TX-20260807-1f4a2b7c'
 */
export function generateTraceId(prefix: TraceIdPrefix = 'GS'): string {
  const date = new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '');
  const hex = randomBytes(4).toString('hex');
  return `${prefix}-${date}-${hex}`;
}
