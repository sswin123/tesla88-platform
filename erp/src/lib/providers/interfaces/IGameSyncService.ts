import type { GameSyncResult } from '../types/game.types';

/** Game catalog synchronization contract. */
export interface IGameSyncService {
  /**
   * Sync games for a single provider by its code.
   * Fetches the provider's game list, upserts into gp_games, and
   * deactivates any games no longer returned by the provider.
   */
  syncProvider(providerCode: string): Promise<GameSyncResult>;

  /**
   * Sync games for all ACTIVE providers that have GAME_SYNC capability.
   * Providers are synced sequentially to avoid hammering provider APIs.
   */
  syncAll(): Promise<GameSyncResult[]>;
}
