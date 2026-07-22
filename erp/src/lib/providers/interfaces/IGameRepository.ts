import type { GameListItem, GameRecord, TimepointRecord } from '../types/game.types';

/** Data access contract for gp_games and gp_timepoints. */
export interface IGameRepository {
  // ── gp_games ──────────────────────────────────────────────────────────────

  findByProvider(providerId: number, activeOnly?: boolean): Promise<GameRecord[]>;

  findByCode(providerId: number, gameCode: string): Promise<GameRecord | null>;

  findById(id: number): Promise<GameRecord | null>;

  /** Upsert a batch of games for a provider. Returns inserted + updated counts. */
  upsertBatch(
    providerId: number,
    games: GameListItem[],
  ): Promise<{ inserted: number; updated: number }>;

  /**
   * Mark games as inactive if their game_code is not in the provided set.
   * Used after a sync to deactivate removed games.
   */
  deactivateMissing(providerId: number, activeCodes: Set<string>): Promise<number>;

  updateFlags(
    id: number,
    patch: { is_hot?: boolean; is_new?: boolean; is_active?: boolean; is_maintenance?: boolean; sort_order?: number },
  ): Promise<GameRecord | null>;

  // ── gp_timepoints ─────────────────────────────────────────────────────────

  getTimepoint(providerId: number, feedType: string): Promise<TimepointRecord | null>;

  setTimepoint(providerId: number, feedType: string, timepoint: number): Promise<void>;
}
