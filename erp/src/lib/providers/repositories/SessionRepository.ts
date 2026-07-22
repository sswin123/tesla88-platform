import pool from '@/lib/db';
import type { ISessionRepository, SessionInput, SessionRecord, SessionStatus } from '../interfaces/ISessionRepository';

export class SessionRepository implements ISessionRepository {
  async findByToken(token: string): Promise<SessionRecord | null> {
    const { rows } = await pool.query<SessionRecord>(
      `SELECT * FROM game_sessions WHERE session_token = $1`,
      [token],
    );
    return rows[0] ?? null;
  }

  async findActiveByUser(userId: number, provider?: string): Promise<SessionRecord[]> {
    if (provider) {
      const { rows } = await pool.query<SessionRecord>(
        `SELECT * FROM game_sessions
         WHERE user_id = $1 AND provider = $2 AND status = 'ACTIVE'
         ORDER BY launched_at DESC`,
        [userId, provider],
      );
      return rows;
    }

    const { rows } = await pool.query<SessionRecord>(
      `SELECT * FROM game_sessions
       WHERE user_id = $1 AND status = 'ACTIVE'
       ORDER BY launched_at DESC`,
      [userId],
    );
    return rows;
  }

  async create(input: SessionInput): Promise<SessionRecord> {
    const { rows } = await pool.query<SessionRecord>(
      `INSERT INTO game_sessions
         (session_token, provider, user_id, user_public_id,
          game_id, game_code, environment, launch_url, expires_at, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        input.session_token,
        input.provider,
        input.user_id ?? null,
        input.user_public_id ?? null,
        input.game_id ?? null,
        input.game_code ?? null,
        input.environment ?? 'PRODUCTION',
        input.launch_url ?? null,
        input.expires_at?.toISOString() ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ],
    );
    return rows[0];
  }

  async updateStatus(id: number, status: SessionStatus): Promise<void> {
    await pool.query(
      `UPDATE game_sessions SET status = $1, last_activity = NOW() WHERE id = $2`,
      [status, id],
    );
  }

  async touchActivity(id: number): Promise<void> {
    await pool.query(
      `UPDATE game_sessions SET last_activity = NOW() WHERE id = $1`,
      [id],
    );
  }

  async expireStale(olderThanMinutes: number): Promise<number> {
    const { rowCount } = await pool.query(
      `UPDATE game_sessions
       SET status = 'EXPIRED'
       WHERE status = 'ACTIVE'
         AND last_activity < NOW() - ($1 || ' minutes')::INTERVAL`,
      [olderThanMinutes],
    );
    return rowCount ?? 0;
  }
}
