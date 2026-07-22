import type { IGameProvider } from '../interfaces/IGameProvider';
import type { IProviderManager } from '../interfaces/IProviderManager';
import type { IProviderRepository } from '../interfaces/IProviderRepository';
import type { IGameRepository } from '../interfaces/IGameRepository';
import type { GameSyncResult, LaunchParams, LaunchResult } from '../types/game.types';
import type { HealthCheckResult, PlatformHealthReport } from '../types/health.types';
import type { ProviderRecord } from '../types/provider.types';
import { ProviderRegistry } from './ProviderRegistry';
import { HealthMonitor } from './HealthMonitor';
import { GameSyncService } from './GameSyncService';
import type { IHealthRepository } from '../interfaces/IHealthRepository';
import type { ISessionRepository } from '../interfaces/ISessionRepository';
import { randomUUID } from 'crypto';

/**
 * Provider Manager — the primary facade for all game operations.
 *
 * Usage pattern (application startup):
 *
 *   const manager = new ProviderManager(providerRepo, gameRepo, ...);
 *   manager.register(new Kiss918Adapter(credentials, config));  // Phase G2
 *   await manager.boot();
 *
 * After boot(), all active adapters registered with register() are live.
 * Any adapter whose code does not have a corresponding ACTIVE row in
 * gp_providers is silently skipped.
 */
export class ProviderManager implements IProviderManager {
  private readonly registry = new ProviderRegistry();
  private readonly healthMonitor: HealthMonitor;
  private readonly syncService: GameSyncService;
  private booted = false;

  constructor(
    private readonly providerRepo: IProviderRepository,
    private readonly gameRepo: IGameRepository,
    private readonly healthRepo: IHealthRepository,
    private readonly sessionRepo: ISessionRepository,
  ) {
    this.healthMonitor = new HealthMonitor(this.registry, providerRepo, healthRepo);
    this.syncService = new GameSyncService(this.registry, providerRepo, gameRepo);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Boot the manager.  Pre-registered adapters (via register()) are activated
   * for providers that have status = 'ACTIVE' in the database.
   */
  async boot(): Promise<void> {
    if (this.booted) return;

    const activeProviders = await this.providerRepo.findActive();
    const activeCodes = new Set(activeProviders.map((p) => p.code));

    // Remove any pre-registered adapters whose DB row is not ACTIVE
    for (const code of this.registry.listCodes()) {
      if (!activeCodes.has(code)) {
        this.registry.unregister(code);
      }
    }

    this.booted = true;
    console.log(
      `[ProviderManager] Boot complete. Active adapters: [${this.registry.listCodes().join(', ')}]`,
    );
  }

  register(adapter: IGameProvider): void {
    this.registry.register(adapter);
  }

  // ── Provider Control ───────────────────────────────────────────────────────

  async enable(providerCode: string): Promise<void> {
    const provider = await this.providerRepo.findByCode(providerCode);
    if (!provider) throw new Error(`Provider "${providerCode}" not found.`);
    await this.providerRepo.update(provider.id, { status: 'ACTIVE' });
  }

  async disable(providerCode: string): Promise<void> {
    const provider = await this.providerRepo.findByCode(providerCode);
    if (!provider) throw new Error(`Provider "${providerCode}" not found.`);
    await this.providerRepo.update(provider.id, { status: 'DISABLED' });
    this.registry.unregister(providerCode);
  }

  async listProviders(): Promise<ProviderRecord[]> {
    return this.providerRepo.findAll();
  }

  getAdapter(providerCode: string): IGameProvider {
    return this.registry.get(providerCode);
  }

  // ── Game Operations ────────────────────────────────────────────────────────

  async launchGame(params: LaunchParams): Promise<LaunchResult> {
    const adapter = this.registry.get(params.provider_id.toString());

    // Resolve provider record for DB lookups
    const provider = await this.providerRepo.findById(params.provider_id);
    if (!provider) throw new Error(`Provider ID ${params.provider_id} not found.`);

    // Auto-register player if not yet known to this provider
    let playerRecord = await this.providerRepo.findPlayer(params.provider_id, params.user_id);
    if (!playerRecord || !playerRecord.is_registered) {
      const accountId = `u${params.user_id}@${process.env.PROVIDER_POSTFIX ?? 'game'}`;
      const created = await adapter.createPlayer({
        account_id: accountId,
        nickname: `Player${params.user_id}`,
        currency: params.currency ?? 'MYR',
      });

      if (playerRecord) {
        playerRecord = await this.providerRepo.updatePlayer(playerRecord.id, {
          provider_player_id: created.provider_player_id,
          is_registered: true,
          registered_at: new Date().toISOString(),
        }) ?? playerRecord;
      } else {
        playerRecord = await this.providerRepo.createPlayer({
          provider_id: params.provider_id,
          user_id: params.user_id,
          provider_account_id: accountId,
          currency: params.currency ?? 'MYR',
          provider_player_id: created.provider_player_id,
          is_registered: true,
          registered_at: new Date().toISOString(),
        });
      }
    }

    // Obtain login token and build launch URL
    const token = await adapter.getLoginToken({
      provider_player_id: playerRecord.provider_player_id ?? '',
      account_id: playerRecord.provider_account_id,
      currency: playerRecord.currency,
    });

    const launchUrl = params.game_code
      ? adapter.getGameURL(token, params.game_code, params.language, params.lobby_return_url)
      : adapter.getLobbyURL(token, params.language, params.lobby_return_url);

    // Create game session record
    const sessionToken = randomUUID();
    const session = await this.sessionRepo.create({
      session_token: sessionToken,
      provider: provider.code,
      user_id: params.user_id,
      game_code: params.game_code,
      environment: provider.environment,
      launch_url: launchUrl,
    });

    return { launch_url: launchUrl, session_token: sessionToken, session_id: session.id };
  }

  // ── Health & Sync ──────────────────────────────────────────────────────────

  async healthCheckAll(): Promise<PlatformHealthReport> {
    return this.healthMonitor.checkAll();
  }

  async healthCheck(providerCode: string): Promise<HealthCheckResult> {
    return this.healthMonitor.checkProvider(providerCode);
  }

  async syncGames(providerCode: string): Promise<GameSyncResult> {
    return this.syncService.syncProvider(providerCode);
  }

  async syncAllGames(): Promise<GameSyncResult[]> {
    return this.syncService.syncAll();
  }
}
