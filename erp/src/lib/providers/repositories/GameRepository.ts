import pool from '@/lib/db';
import type { IGameRepository } from '../interfaces/IGameRepository';
import type { GameListItem, GameRecord, TimepointRecord } from '../types/game.types';

export class GameRepository implements IGameRepository {
  // ── gp_games ──────────────────────────────────────────────────────────────

  async findByProvider(providerId: number, activeOnly = false): Promise<GameRecord[]> {
    const query = activeOnly
      ? `SELECT * FROM gp_games WHERE provider_id = $1 AND is_active = TRUE ORDER BY sort_order ASC, id ASC`
      : `SELECT * FROM gp_games WHERE provider_id = $1 ORDER BY sort_order ASC, id ASC`;
    const { rows } = await pool.query<GameRecord>(query, [providerId]);
    return rows;
  }

  async findByCode(providerId: number, gameCode: string): Promise<GameRecord | null> {
    const { rows } = await pool.query<GameRecord>(
      `SELECT * FROM gp_games WHERE provider_id = $1 AND game_code = $2`,
      [providerId, gameCode],
    );
    return rows[0] ?? null;
  }

  async findById(id: number): Promise<GameRecord | null> {
    const { rows } = await pool.query<GameRecord>(
      `SELECT * FROM gp_games WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async upsertBatch(
    providerId: number,
    games: GameListItem[],
  ): Promise<{ inserted: number; updated: number }> {
    if (games.length === 0) return { inserted: 0, updated: 0 };

    let inserted = 0;
    let updated = 0;

    for (const game of games) {
      const { rowCount, rows } = await pool.query<{ xmax: string }>(
        `INSERT INTO gp_games
           (provider_id, game_code, name, game_type, sub_type, icon_url, banner_url,
            is_active, metadata, synced_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
         ON CONFLICT (provider_id, game_code) DO UPDATE
         SET name       = EXCLUDED.name,
             game_type  = EXCLUDED.game_type,
             sub_type   = EXCLUDED.sub_type,
             icon_url   = EXCLUDED.icon_url,
             banner_url = EXCLUDED.banner_url,
             is_active  = EXCLUDED.is_active,
             metadata   = EXCLUDED.metadata,
             synced_at  = NOW(),
             updated_at = NOW()
         RETURNING (xmax = 0) AS is_insert`,
        [
          providerId,
          game.game_code,
          game.name,
          game.game_type,
          game.sub_type ?? null,
          game.icon_url ?? null,
          game.banner_url ?? null,
          game.is_active ?? true,
          JSON.stringify(game.metadata ?? {}),
        ],
      );

      if (rowCount && rowCount > 0) {
        // xmax = 0 means it was an INSERT, otherwise UPDATE
        if (rows[0]?.xmax === '0') inserted++;
        else updated++;
      }
    }

    return { inserted, updated };
  }

  async deactivateMissing(providerId: number, activeCodes: Set<string>): Promise<number> {
    if (activeCodes.size === 0) return 0;

    const codesArray = Array.from(activeCodes);
    const { rowCount } = await pool.query(
      `UPDATE gp_games
       SET is_active = FALSE, updated_at = NOW()
       WHERE provider_id = $1
         AND is_active = TRUE
         AND game_code != ALL($2::text[])`,
      [providerId, codesArray],
    );
    return rowCount ?? 0;
  }

  async updateFlags(
    id: number,
    patch: {
      is_hot?: boolean;
      is_new?: boolean;
      is_active?: boolean;
      is_maintenance?: boolean;
      sort_order?: number;
    },
  ): Promise<GameRecord | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    for (const [key, val] of Object.entries(patch)) {
      if (val !== undefined) {
        fields.push(`${key} = $${i++}`);
        values.push(val);
      }
    }

    if (fields.length === 0) return this.findById(id);

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const { rows } = await pool.query<GameRecord>(
      `UPDATE gp_games SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values,
    );
    return rows[0] ?? null;
  }

  // ── gp_timepoints ─────────────────────────────────────────────────────────

  async getTimepoint(providerId: number, feedType: string): Promise<TimepointRecord | null> {
    const { rows } = await pool.query<TimepointRecord>(
      `SELECT * FROM gp_timepoints WHERE provider_id = $1 AND feed_type = $2`,
      [providerId, feedType],
    );
    return rows[0] ?? null;
  }

  async setTimepoint(providerId: number, feedType: string, timepoint: number): Promise<void> {
    await pool.query(
      `INSERT INTO gp_timepoints (provider_id, feed_type, last_timepoint, last_polled_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (provider_id, feed_type) DO UPDATE
       SET last_timepoint = EXCLUDED.last_timepoint, last_polled_at = NOW()`,
      [providerId, feedType, timepoint],
    );
  }
}
