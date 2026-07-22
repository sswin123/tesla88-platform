import type { IGameSyncService } from '../interfaces/IGameSyncService';
import type { IGameRepository } from '../interfaces/IGameRepository';
import type { IProviderRepository } from '../interfaces/IProviderRepository';
import type { GameSyncResult } from '../types/game.types';
import { PROVIDER_CAPABILITY } from '../types/capability.types';
import type { ProviderRegistry } from './ProviderRegistry';

/**
 * Game Sync Service — fetches and upserts game catalogs from providers.
 *
 * Future providers that expose a game-list API (GAME_SYNC capability) are
 * automatically supported without changes to this service.
 */
export class GameSyncService implements IGameSyncService {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly providerRepo: IProviderRepository,
    private readonly gameRepo: IGameRepository,
  ) {}

  async syncProvider(providerCode: string): Promise<GameSyncResult> {
    const syncedAt = new Date().toISOString();
    const errors: string[] = [];

    const provider = await this.providerRepo.findByCode(providerCode);
    if (!provider) {
      return { provider_code: providerCode, inserted: 0, updated: 0, deactivated: 0, errors: [`Provider "${providerCode}" not found`], synced_at: syncedAt };
    }

    if (!provider.capabilities.includes(PROVIDER_CAPABILITY.GAME_SYNC)) {
      return { provider_code: providerCode, inserted: 0, updated: 0, deactivated: 0, errors: [`Provider "${providerCode}" does not support GAME_SYNC`], synced_at: syncedAt };
    }

    const adapter = this.registry.get(providerCode);

    let gameList;
    try {
      gameList = await adapter.getGameList();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { provider_code: providerCode, inserted: 0, updated: 0, deactivated: 0, errors: [`getGameList failed: ${msg}`], synced_at: syncedAt };
    }

    const { inserted, updated } = await this.gameRepo.upsertBatch(provider.id, gameList.games);

    const activeCodes = new Set(gameList.games.map((g) => g.game_code));
    const deactivated = await this.gameRepo.deactivateMissing(provider.id, activeCodes);

    return { provider_code: providerCode, inserted, updated, deactivated, errors, synced_at: syncedAt };
  }

  async syncAll(): Promise<GameSyncResult[]> {
    const providers = await this.providerRepo.findActive();
    const syncable = providers.filter((p) =>
      p.capabilities.includes(PROVIDER_CAPABILITY.GAME_SYNC) &&
      this.registry.has(p.code),
    );

    const results: GameSyncResult[] = [];
    for (const provider of syncable) {
      results.push(await this.syncProvider(provider.code));
    }
    return results;
  }
}
