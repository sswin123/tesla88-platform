import type { IGameProvider } from './IGameProvider';
import type { GameSyncResult, LaunchParams, LaunchResult } from '../types/game.types';
import type { HealthCheckResult, PlatformHealthReport } from '../types/health.types';
import type { ProviderRecord } from '../types/provider.types';

/**
 * Provider Manager contract — the single entry point for all game operations.
 *
 * Callers never import a concrete adapter directly; they go through
 * IProviderManager which resolves the correct adapter internally.
 */
export interface IProviderManager {
  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Boot the manager: load all ACTIVE providers from the database,
   * instantiate their adapters, and register them in the in-memory registry.
   * Must be called once at application startup.
   */
  boot(): Promise<void>;

  /**
   * Register a new adapter instance in the in-memory registry.
   * Called by boot() for each active provider, or directly in tests.
   */
  register(adapter: IGameProvider): void;

  // ── Provider Control ───────────────────────────────────────────────────────

  /** Enable a provider: set status to ACTIVE in DB + registry. */
  enable(providerCode: string): Promise<void>;

  /** Disable a provider: set status to DISABLED in DB + remove from registry. */
  disable(providerCode: string): Promise<void>;

  /** Return all providers from the database (including disabled ones). */
  listProviders(): Promise<ProviderRecord[]>;

  /** Resolve a registered adapter by provider code. */
  getAdapter(providerCode: string): IGameProvider;

  // ── Game Operations ────────────────────────────────────────────────────────

  /**
   * Launch a game or lobby for a player.
   * Handles player auto-registration if the player is not yet registered
   * on the provider's system.
   */
  launchGame(params: LaunchParams): Promise<LaunchResult>;

  // ── Health & Sync ──────────────────────────────────────────────────────────

  /** Run health checks against all active providers. */
  healthCheckAll(): Promise<PlatformHealthReport>;

  /** Run health check against a single provider. */
  healthCheck(providerCode: string): Promise<HealthCheckResult>;

  /** Sync game catalog for a single provider. */
  syncGames(providerCode: string): Promise<GameSyncResult>;

  /** Sync game catalogs for all active providers. */
  syncAllGames(): Promise<GameSyncResult[]>;
}
