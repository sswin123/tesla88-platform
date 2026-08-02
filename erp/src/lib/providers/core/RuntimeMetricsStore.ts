/**
 * RuntimeMetricsStore — in-memory, per brand-provider metrics accumulator.
 *
 * Tracks operational statistics since the current process started.
 * Metrics reset on process restart (Node.js process memory).
 *
 * All counters are updated via static record*() methods called from
 * BrandProviderManager and the Connection Test / Reload routes.
 */

export interface TestMetrics {
  total:          number;
  success:        number;
  failed:         number;
  last_at:        string | null;
  last_latency_ms: number | null;
  /** Exponential moving average of successful test latencies. */
  avg_latency_ms: number;
}

export interface BuildMetrics {
  total:      number;
  success:    number;
  failed:     number;
  last_error: string | null;
  last_at:    string | null;
}

export interface ReloadMetrics {
  total:   number;
  last_at: string | null;
}

export interface RuntimeMetrics {
  /** "BRANDCODE:PROVIDERCODE" */
  key:              string;
  connection_tests: TestMetrics;
  adapter_builds:   BuildMetrics;
  reloads:          ReloadMetrics;
  last_health_status: string;
  last_health_at:   string | null;
  /** ISO timestamp of process start (when metrics collection began). */
  since:            string;
}

const PROCESS_START = new Date().toISOString();
const EMA_ALPHA     = 0.3; // weight of latest observation in EMA

function emptyTestMetrics(): TestMetrics {
  return { total: 0, success: 0, failed: 0, last_at: null, last_latency_ms: null, avg_latency_ms: 0 };
}
function emptyBuildMetrics(): BuildMetrics {
  return { total: 0, success: 0, failed: 0, last_error: null, last_at: null };
}
function emptyReloadMetrics(): ReloadMetrics {
  return { total: 0, last_at: null };
}

function emptyMetrics(key: string): RuntimeMetrics {
  return {
    key,
    connection_tests:   emptyTestMetrics(),
    adapter_builds:     emptyBuildMetrics(),
    reloads:            emptyReloadMetrics(),
    last_health_status: 'UNKNOWN',
    last_health_at:     null,
    since:              PROCESS_START,
  };
}

export class RuntimeMetricsStore {
  private static readonly store = new Map<string, RuntimeMetrics>();

  private static key(brandCode: string, providerCode: string): string {
    return `${brandCode.toUpperCase()}:${providerCode.toUpperCase()}`;
  }

  private static get(brandCode: string, providerCode: string): RuntimeMetrics {
    const k = this.key(brandCode, providerCode);
    let m = this.store.get(k);
    if (!m) { m = emptyMetrics(k); this.store.set(k, m); }
    return m;
  }

  /** Record the result of a Connection Test. */
  static recordConnectionTest(
    brandCode:    string,
    providerCode: string,
    success:      boolean,
    latency_ms:   number | null,
  ): void {
    const m = this.get(brandCode, providerCode);
    const now = new Date().toISOString();
    m.connection_tests.total++;
    m.connection_tests.last_at = now;
    m.connection_tests.last_latency_ms = latency_ms;
    if (success) {
      m.connection_tests.success++;
      if (latency_ms !== null) {
        const prev = m.connection_tests.avg_latency_ms;
        m.connection_tests.avg_latency_ms = prev === 0
          ? latency_ms
          : Math.round(EMA_ALPHA * latency_ms + (1 - EMA_ALPHA) * prev);
      }
    } else {
      m.connection_tests.failed++;
    }
  }

  /** Record the result of an adapter build (buildSnapshot / getAdapter). */
  static recordAdapterBuild(
    brandCode:    string,
    providerCode: string,
    success:      boolean,
    error:        string | null = null,
  ): void {
    const m = this.get(brandCode, providerCode);
    m.adapter_builds.total++;
    m.adapter_builds.last_at = new Date().toISOString();
    if (success) {
      m.adapter_builds.success++;
      m.adapter_builds.last_error = null;
    } else {
      m.adapter_builds.failed++;
      m.adapter_builds.last_error = error;
    }
  }

  /** Record a Reload event. */
  static recordReload(brandCode: string, providerCode: string): void {
    const m = this.get(brandCode, providerCode);
    m.reloads.total++;
    m.reloads.last_at = new Date().toISOString();
  }

  /** Update the cached health status after a Connection Test or background check. */
  static updateHealth(brandCode: string, providerCode: string, status: string): void {
    const m = this.get(brandCode, providerCode);
    m.last_health_status = status;
    m.last_health_at     = new Date().toISOString();
  }

  /** Return current metrics (read-only copy). */
  static getMetrics(brandCode: string, providerCode: string): RuntimeMetrics {
    return { ...this.get(brandCode, providerCode) };
  }

  /** Return all metrics (for admin dashboard). */
  static getAllMetrics(): RuntimeMetrics[] {
    return Array.from(this.store.values()).map(m => ({ ...m }));
  }

  /** Reset metrics for a provider (called on reload / invalidate). */
  static reset(brandCode: string, providerCode: string): void {
    const k = this.key(brandCode, providerCode);
    this.store.delete(k);
  }
}
