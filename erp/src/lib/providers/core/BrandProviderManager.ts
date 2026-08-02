import type { IGameProvider } from '../interfaces/IGameProvider';
import type { IProviderRepository } from '../interfaces/IProviderRepository';
import type { MasterWalletEngine } from './MasterWalletEngine';
import type { EventLogger } from './EventLogger';
import { BrandProviderRepository } from '../repositories/BrandProviderRepository';
import { createAdapter } from '../adapters/AdapterFactory';
import { ProviderRuntimeBuilder } from './ProviderRuntimeBuilder';
import { RuntimeMetricsStore } from './RuntimeMetricsStore';
import { RuntimeEventStore } from './RuntimeEventStore';
import type {
  ProviderState,
  RuntimeSnapshot,
  RuntimeHealthReport,
  RuntimeCheck,
  RuntimeCheckStatus,
  DiagnosticStep,
} from '../types/runtime.types';

type DecryptFn = (ciphertext: string) => string;

// ── Internal helpers ──────────────────────────────────────────────────────────

function check(
  status: RuntimeCheckStatus,
  message: string,
  detail?: string,
): RuntimeCheck {
  return { status, message, ...(detail !== undefined ? { detail } : {}) };
}

function computeState(
  configCount: number,
  credCount: number,
  adapterBuilt: boolean,
  healthStatus: string,
  gamesSynced: number,
): ProviderState {
  if (configCount === 0 && credCount === 0) return 'CREATED';
  if (credCount === 0) return 'CONFIGURED';
  if (!adapterBuilt) return 'CONFIGURED'; // credentials present but adapter build failed
  if (healthStatus === 'HEALTHY') {
    if (gamesSynced > 0) return 'LAUNCH_READY';
    return 'HEALTHY';
  }
  if (healthStatus === 'DEGRADED') return 'CONNECTED';
  // UNKNOWN or DOWN — adapter builds but not yet tested / failing API
  return 'CREDENTIAL_READY';
}

function buildHealthReport(params: {
  configCount:         number;
  missingConfigKeys:   string[];
  credCount:           number;
  missingCredKeys:     string[];
  adapterBuilt:        boolean;
  adapterError:        string | null;
  healthStatus:        string;
  gamesSynced:         number;
  healthCheckedAt:     string | null;
}): RuntimeHealthReport {
  const {
    configCount, missingConfigKeys,
    credCount, missingCredKeys,
    adapterBuilt, adapterError,
    healthStatus, gamesSynced,
    healthCheckedAt,
  } = params;

  // Configuration check
  const configCheck: RuntimeCheck =
    configCount === 0
      ? check('error', 'No configuration saved', 'Add config keys in the Configuration tab')
      : missingConfigKeys.length > 0
      ? check('warning', `${missingConfigKeys.length} required key(s) missing`, missingConfigKeys.join(', '))
      : check('ok', `${configCount} key(s) configured`);

  // Credentials check
  const credCheck: RuntimeCheck =
    credCount === 0
      ? check('error', 'No credentials saved', 'Add credentials in the Credentials tab')
      : missingCredKeys.length > 0
      ? check('warning', `${missingCredKeys.length} required key(s) missing`, missingCredKeys.join(', '))
      : check('ok', `${credCount} credential(s) loaded`);

  // Adapter check
  const adapterCheck: RuntimeCheck = adapterBuilt
    ? check('ok', 'Adapter built successfully')
    : credCount === 0
    ? check('unknown', 'Waiting for credentials')
    : check('error', 'Adapter build failed', adapterError ?? undefined);

  // Network / Auth / API checks — only known after a Connection Test
  const testedBefore = healthCheckedAt !== null;
  const networkCheck: RuntimeCheck = testedBefore
    ? healthStatus === 'DOWN'
      ? check('error', 'Provider server unreachable', 'Check api_base_url and network connectivity')
      : check('ok', 'Provider server reachable')
    : check('unknown', 'Not yet tested — run Connection Test');

  const authCheck: RuntimeCheck = testedBefore
    ? healthStatus === 'HEALTHY' || healthStatus === 'DEGRADED'
      ? check('ok', 'Authentication accepted')
      : check('error', 'Authentication failed', 'Check credentials — wrong token or key')
    : check('unknown', 'Not yet tested');

  const apiCheck: RuntimeCheck = testedBefore
    ? healthStatus === 'HEALTHY'
      ? check('ok', 'Provider API responding normally')
      : healthStatus === 'DEGRADED'
      ? check('warning', 'Provider API degraded', 'Server reached but API returned errors')
      : check('error', 'Provider API down')
    : check('unknown', 'Not yet tested');

  // Game sync check
  const gameSyncCheck: RuntimeCheck =
    gamesSynced > 0
      ? check('ok', `${gamesSynced} games in catalog`)
      : check('warning', 'No games synced', 'Trigger a game sync in the Provider settings');

  // Launch readiness (derived)
  const launchReady =
    adapterBuilt && healthStatus === 'HEALTHY';
  const launchCheck: RuntimeCheck = launchReady
    ? check('ok', 'Provider ready for player launches')
    : !adapterBuilt
    ? check('error', 'Adapter not ready', 'Fix configuration and credentials first')
    : !testedBefore
    ? check('unknown', 'Run Connection Test to verify launch readiness')
    : check('error', 'Launch blocked', `Health status is ${healthStatus}`);

  // Overall
  const overall: RuntimeHealthReport['overall'] =
    !adapterBuilt || configCount === 0 || credCount === 0
      ? 'DOWN'
      : healthStatus === 'HEALTHY'
      ? 'HEALTHY'
      : healthStatus === 'DEGRADED'
      ? 'DEGRADED'
      : healthStatus === 'DOWN'
      ? 'DOWN'
      : 'UNKNOWN';

  return {
    overall,
    configuration: configCheck,
    credentials:   credCheck,
    adapter:       adapterCheck,
    network:       networkCheck,
    authentication: authCheck,
    provider_api:  apiCheck,
    game_sync:     gameSyncCheck,
    launch:        launchCheck,
    tested_at:     healthCheckedAt,
  };
}

// ── BrandProviderManager ──────────────────────────────────────────────────────

/**
 * BrandProviderManager — SaaS-aware runtime adapter resolver.
 *
 * Maintains two in-memory caches per brand-provider pair:
 *   1. `adapters`  — the live IGameProvider adapter used by game routes
 *   2. `snapshots` — a RuntimeSnapshot for the Overview and Health tabs
 *
 * Snapshots are built without network calls (DB-only), so they are cheap
 * to rebuild after config/credential saves. Health details (network,
 * authentication, provider_api) come from brand_providers.health_status,
 * which is updated by the Connection Test endpoint.
 *
 * Call invalidate() after any config/credential/status change; the next
 * getAdapter() / getSnapshot() call will rebuild the cache.
 *
 * Call buildSnapshot() in the background after saves to keep the Overview
 * tab current without requiring the user to navigate away and back.
 */
export class BrandProviderManager {
  private readonly adapters        = new Map<string, IGameProvider>();
  private readonly snapshots       = new Map<string, RuntimeSnapshot>();
  private readonly adapterInFlight = new Map<string, Promise<IGameProvider>>();
  private readonly snapInFlight    = new Map<string, Promise<RuntimeSnapshot>>();

  constructor(
    private readonly brandProviderRepo: BrandProviderRepository,
    private readonly wallet: MasterWalletEngine,
    private readonly eventLogger: EventLogger,
    private readonly providerRepo: IProviderRepository,
    private readonly decrypt: DecryptFn,
  ) {}

  private key(brandCode: string, providerCode: string): string {
    return `${brandCode.toUpperCase()}:${providerCode.toUpperCase()}`;
  }

  // ── Adapter API ─────────────────────────────────────────────────────────────

  /**
   * Return the cached adapter, or load one from DB.
   * @throws if the brand-provider is not found or not ACTIVE.
   */
  async getAdapter(brandCode: string, providerCode: string): Promise<IGameProvider> {
    const k = this.key(brandCode, providerCode);
    const cached = this.adapters.get(k);
    if (cached) return cached;

    const inflight = this.adapterInFlight.get(k);
    if (inflight) return inflight;

    const promise = this._loadAdapter(brandCode.toUpperCase(), providerCode.toUpperCase(), k);
    this.adapterInFlight.set(k, promise);
    try {
      return await promise;
    } finally {
      this.adapterInFlight.delete(k);
    }
  }

  private async _loadAdapter(
    brandCode: string,
    providerCode: string,
    cacheKey: string,
  ): Promise<IGameProvider> {
    const bp = await this.brandProviderRepo.findActive(brandCode, providerCode);
    if (!bp) {
      throw new Error(
        `BrandProviderManager: no active configuration for ${cacheKey}. ` +
        `Ensure the brand exists, the provider is enabled, and status is ACTIVE.`,
      );
    }

    const rawCreds = await this.brandProviderRepo.getCredentials(bp.id);
    const credentials: Record<string, string> = {};
    for (const row of rawCreds) {
      credentials[row.key] = row.is_encrypted ? this.decrypt(row.value) : row.value;
    }

    const rawCfg = await this.brandProviderRepo.getConfig(bp.id);
    const config: Record<string, string> = {};
    for (const row of rawCfg) config[row.key] = row.value;

    const adapter = createAdapter(providerCode, credentials, config, {
      wallet:        this.wallet,
      eventLogger:   this.eventLogger,
      providerRepo:  this.providerRepo,
      gpProviderId:  bp.provider_id,
    });

    this.adapters.set(cacheKey, adapter);
    return adapter;
  }

  // ── Snapshot API ────────────────────────────────────────────────────────────

  /**
   * Return the cached RuntimeSnapshot, or build one from DB.
   * Never makes network calls — all data is read from the database.
   */
  async getSnapshot(brandCode: string, providerCode: string): Promise<RuntimeSnapshot> {
    const k = this.key(brandCode, providerCode);
    const cached = this.snapshots.get(k);
    if (cached) return cached;
    return this.buildSnapshot(brandCode, providerCode);
  }

  /**
   * Build a fresh RuntimeSnapshot from the database (bypasses cache).
   * Deduplicates concurrent requests for the same key.
   *
   * Called:
   *  - by getSnapshot() on cache miss
   *  - explicitly by invalidateAndReload() after config/credential saves
   *  - by the Reload Adapter endpoint
   */
  async buildSnapshot(brandCode: string, providerCode: string): Promise<RuntimeSnapshot> {
    const k = this.key(brandCode, providerCode);

    const inflight = this.snapInFlight.get(k);
    if (inflight) return inflight;

    const promise = this._buildSnapshot(brandCode.toUpperCase(), providerCode.toUpperCase(), k);
    this.snapInFlight.set(k, promise);
    try {
      return await promise;
    } finally {
      this.snapInFlight.delete(k);
    }
  }

  private async _buildSnapshot(
    brandCode: string,
    providerCode: string,
    cacheKey: string,
  ): Promise<RuntimeSnapshot> {
    // ── Delegate DB read + adapter build to ProviderRuntimeBuilder ──────────
    // This is the SINGLE place where brand_provider_* tables are read for
    // snapshot construction.  Never duplicate this logic in other classes.
    const r = await ProviderRuntimeBuilder.build(
      brandCode,
      providerCode,
      this.decrypt,
      {
        wallet:       this.wallet,
        eventLogger:  this.eventLogger,
        providerRepo: this.providerRepo,
      },
      true, // include game count
    );

    // Cache the adapter if one was built
    if (r.adapterBuilt && r.adapter) {
      this.adapters.set(cacheKey, r.adapter);
    }

    // Record metrics
    RuntimeMetricsStore.recordAdapterBuild(brandCode, providerCode, r.adapterBuilt, r.adapterError);

    // Error snapshot for "not found"
    if (!r.found) {
      const errSnap: RuntimeSnapshot = {
        brandCode, providerCode, bpId: -1,
        status: 'UNKNOWN', environment: 'UNKNOWN', wallet_type: 'UNKNOWN', currency: 'MYR',
        state: 'CREATED',
        config_count: 0, credential_count: 0,
        missing_config_keys: r.missingConfigKeys, missing_credential_keys: r.missingCredKeys,
        adapter_built: false, adapter_error: r.adapterError,
        health: buildHealthReport({
          configCount: 0, missingConfigKeys: [], credCount: 0, missingCredKeys: [],
          adapterBuilt: false, adapterError: null, healthStatus: 'UNKNOWN',
          gamesSynced: 0, healthCheckedAt: null,
        }),
        health_status: 'UNKNOWN', health_checked_at: null,
        last_success_at: null, last_failed_at: null,
        games_synced: 0,
        adapter_version: r.adapterVersion,
        diagnostics: r.diagnostics,
        loaded_at: r.builtAt,
        build_error: r.adapterError,
      };
      RuntimeEventStore.append(brandCode, providerCode, 'SNAPSHOT_BUILD', 'FAILED',
        'Snapshot build failed', r.adapterError, r.buildDurationMs);
      return errSnap;
    }

    // ── Compute state + health from builder result ────────────────────────
    const state = computeState(
      r.configCount,
      r.credCount,
      r.adapterBuilt,
      r.bpHealthStatus,
      r.gamesSynced,
    );

    const health = buildHealthReport({
      configCount:       r.configCount,
      missingConfigKeys: r.missingConfigKeys,
      credCount:         r.credCount,
      missingCredKeys:   r.missingCredKeys,
      adapterBuilt:      r.adapterBuilt,
      adapterError:      r.adapterError,
      healthStatus:      r.bpHealthStatus,
      gamesSynced:       r.gamesSynced,
      healthCheckedAt:   r.bpHealthCheckedAt,
    });

    RuntimeEventStore.append(brandCode, providerCode, 'SNAPSHOT_BUILD', 'SUCCESS',
      `Snapshot built: state=${state}`,
      `adapter=${r.adapterBuilt}, games=${r.gamesSynced}`,
      r.buildDurationMs);

    const snapshot: RuntimeSnapshot = {
      brandCode,
      providerCode,
      bpId:                    r.bpId,
      status:                  r.bpStatus,
      environment:             r.bpEnvironment,
      wallet_type:             r.bpWalletType,
      currency:                r.bpCurrency,
      state,
      config_count:            r.configCount,
      credential_count:        r.credCount,
      missing_config_keys:     r.missingConfigKeys,
      missing_credential_keys: r.missingCredKeys,
      adapter_built:           r.adapterBuilt,
      adapter_error:           r.adapterError,
      health,
      health_status:           r.bpHealthStatus,
      health_checked_at:       r.bpHealthCheckedAt,
      last_success_at:         r.bpLastSuccessAt,
      last_failed_at:          r.bpLastFailedAt,
      games_synced:            r.gamesSynced,
      adapter_version:         r.adapterVersion,
      diagnostics:             r.diagnostics,
      loaded_at:               r.builtAt,
      build_error:             null,
    };

    this.snapshots.set(cacheKey, snapshot);
    return snapshot;
  }

  // ── Cache invalidation ──────────────────────────────────────────────────────

  /**
   * Evict cached adapter and snapshot for a specific brand-provider pair.
   * Call after any config, credential, or status change.
   */
  invalidate(brandCode: string, providerCode: string): void {
    const k = this.key(brandCode, providerCode);
    this.adapters.delete(k);
    this.snapshots.delete(k);
    this.adapterInFlight.delete(k);
    this.snapInFlight.delete(k);
  }

  /** Evict all cached adapters and snapshots. */
  invalidateAll(): void {
    this.adapters.clear();
    this.snapshots.clear();
    this.adapterInFlight.clear();
    this.snapInFlight.clear();
  }

  /**
   * Invalidate then eagerly rebuild the snapshot in the background.
   * Use this after config/credential saves so the Overview tab is
   * immediately current without needing a manual Reload Adapter.
   *
   * The returned Promise resolves once the snapshot is built.
   * Callers may fire-and-forget (`.catch(console.warn)`) if they don't
   * want to block the HTTP response.
   */
  async invalidateAndReload(brandCode: string, providerCode: string): Promise<RuntimeSnapshot> {
    this.invalidate(brandCode, providerCode);
    return this.buildSnapshot(brandCode, providerCode);
  }

  /** Current adapter cache size (for monitoring). */
  get cacheSize(): number {
    return this.adapters.size;
  }

  /** Current snapshot cache size (for monitoring). */
  get snapshotSize(): number {
    return this.snapshots.size;
  }
}
