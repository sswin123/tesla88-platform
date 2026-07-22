/**
 * Health monitoring types.
 */

export type HealthCheckStatus = 'HEALTHY' | 'DEGRADED' | 'DOWN';

/** Result of a single health check ping to a provider. */
export interface HealthCheckResult {
  provider: string;
  status: HealthCheckStatus;
  latency_ms: number | null;
  error_message: string | null;
  checked_at: string;
}

/** Aggregated health report across all active providers. */
export interface PlatformHealthReport {
  checked_at: string;
  providers: HealthCheckResult[];
  healthy_count: number;
  degraded_count: number;
  down_count: number;
}

/** A health check history record from gp_health_checks. */
export interface HealthCheckRecord {
  id: number;
  provider_id: number;
  status: HealthCheckStatus;
  latency_ms: number | null;
  error_message: string | null;
  checked_at: string;
}
