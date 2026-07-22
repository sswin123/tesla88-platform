import type { IHealthMonitor } from '../interfaces/IHealthMonitor';
import type { IHealthRepository } from '../interfaces/IHealthRepository';
import type { IProviderRepository } from '../interfaces/IProviderRepository';
import type { HealthCheckResult, PlatformHealthReport } from '../types/health.types';
import type { ProviderRegistry } from './ProviderRegistry';

/**
 * Health Monitor — periodically checks provider connectivity.
 *
 * Calls IGameProvider.healthCheck() for each active registered adapter,
 * records the result in gp_health_checks, and updates the provider's
 * health_status in gp_providers.
 */
export class HealthMonitor implements IHealthMonitor {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly providerRepo: IProviderRepository,
    private readonly healthRepo: IHealthRepository,
  ) {}

  async checkProvider(providerCode: string): Promise<HealthCheckResult> {
    const adapter = this.registry.get(providerCode);
    const provider = await this.providerRepo.findByCode(providerCode);
    if (!provider) {
      throw new Error(`Provider "${providerCode}" not found in database.`);
    }

    const result = await adapter.healthCheck();

    await this.healthRepo.record(provider.id, result);

    const isSuccess = result.status === 'HEALTHY';
    await this.providerRepo.updateHealthStatus(
      provider.id,
      result.status,
      new Date(result.checked_at),
      isSuccess ? new Date(result.checked_at) : undefined,
    );

    return result;
  }

  async checkAll(): Promise<PlatformHealthReport> {
    const codes = this.registry.listCodes();
    const results = await Promise.allSettled(
      codes.map((code) => this.checkProvider(code)),
    );

    const providers: HealthCheckResult[] = results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      return {
        provider: codes[i],
        status: 'DOWN' as const,
        latency_ms: null,
        error_message: r.reason instanceof Error ? r.reason.message : String(r.reason),
        checked_at: new Date().toISOString(),
      };
    });

    return buildReport(providers);
  }

  async getLastKnownStatus(): Promise<PlatformHealthReport> {
    const providers = await this.providerRepo.findActive();
    const results: HealthCheckResult[] = providers.map((p) => ({
      provider: p.code,
      status: p.health_status as HealthCheckResult['status'],
      latency_ms: null,
      error_message: null,
      checked_at: p.health_checked_at ?? new Date().toISOString(),
    }));
    return buildReport(results);
  }
}

function buildReport(providers: HealthCheckResult[]): PlatformHealthReport {
  return {
    checked_at: new Date().toISOString(),
    providers,
    healthy_count: providers.filter((p) => p.status === 'HEALTHY').length,
    degraded_count: providers.filter((p) => p.status === 'DEGRADED').length,
    down_count: providers.filter((p) => p.status === 'DOWN').length,
  };
}
