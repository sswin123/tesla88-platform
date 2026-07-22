import type { HealthCheckRecord, HealthCheckResult } from '../types/health.types';

/** Data access contract for gp_health_checks (migration 069). */
export interface IHealthRepository {
  record(providerId: number, result: HealthCheckResult): Promise<void>;

  findRecent(providerId: number, limit?: number): Promise<HealthCheckRecord[]>;

  /** Average latency over the last N records. */
  averageLatency(providerId: number, last?: number): Promise<number | null>;

  /** Purge health check records older than the given number of days. */
  purgeOlderThan(days: number): Promise<number>;
}
