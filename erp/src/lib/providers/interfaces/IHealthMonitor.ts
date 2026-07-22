import type { HealthCheckResult, PlatformHealthReport } from '../types/health.types';

/** Health monitor contract — checks provider connectivity on a schedule. */
export interface IHealthMonitor {
  /**
   * Run a health check against a single provider by its code.
   * Updates gp_providers.health_status after each check.
   */
  checkProvider(providerCode: string): Promise<HealthCheckResult>;

  /**
   * Run health checks against all ACTIVE providers in parallel.
   * Returns an aggregated report.
   */
  checkAll(): Promise<PlatformHealthReport>;

  /**
   * Return the last known health status for each provider without
   * performing new network calls.
   */
  getLastKnownStatus(): Promise<PlatformHealthReport>;
}
