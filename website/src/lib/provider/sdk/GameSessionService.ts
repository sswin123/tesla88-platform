// GameSessionService — manages game launch sessions.
// Writes to game_sessions table (migration 056).
// Provider-specific launch logic lives in each adapter's IProviderGame.

import pool from '@/lib/db';
import crypto from 'crypto';
import type { LaunchRequest, LaunchResult, SessionValidation } from './types';
import type { IProviderClient } from './ProviderClient';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface GameSession {
  id:           number;
  sessionToken: string;
  provider:     string;
  userId:       number | null;
  userPublicId: string | null;
  gameId:       string | null;
  gameCode:     string | null;
  environment:  string;
  status:       string;
  launchUrl:    string | null;
  launchedAt:   string;
  lastActivity: string;
  expiresAt:    string | null;
}

// ── GameSessionService ─────────────────────────────────────────────────────────

export class GameSessionService {
  constructor(private readonly client: IProviderClient) {}

  async launch(userId: number | null, req: LaunchRequest): Promise<LaunchResult & { sessionId: number }> {
    const result: LaunchResult = await this.client.game.launch(req);

    const r = await pool.query<{ id: number }>(
      `INSERT INTO game_sessions
         (session_token, provider, user_id, user_public_id, game_id, game_code,
          environment, status, launch_url, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'ACTIVE',$8,$9)
       RETURNING id`,
      [
        result.sessionToken,
        this.client.provider,
        userId,
        req.member.userId,
        req.gameId,
        req.gameCode ?? null,
        req.environment,
        result.launchUrl,
        result.expiresAt ?? null,
      ]
    );
    return { ...result, sessionId: r.rows[0].id };
  }

  async validate(sessionToken: string): Promise<SessionValidation> {
    // Check DB first — if session is ENDED or EXPIRED, reject without provider call
    const row = await this.getByToken(sessionToken);
    if (!row)   return { valid: false, errorCode: 'SESSION_NOT_FOUND' };
    if (row.status !== 'ACTIVE') return { valid: false, errorCode: `SESSION_${row.status}` };
    if (row.expiresAt && new Date(row.expiresAt) < new Date()) {
      await this.expire(sessionToken);
      return { valid: false, errorCode: 'SESSION_EXPIRED' };
    }
    await this.touch(sessionToken);
    return this.client.game.validateSession(sessionToken);
  }

  async end(sessionToken: string): Promise<void> {
    await Promise.all([
      this.client.game.endSession(sessionToken),
      pool.query(
        `UPDATE game_sessions SET status = 'ENDED', last_activity = NOW()
         WHERE session_token = $1`,
        [sessionToken]
      ),
    ]);
  }

  async getByToken(token: string): Promise<GameSession | null> {
    const r = await pool.query<{
      id: number; session_token: string; provider: string; user_id: number | null;
      user_public_id: string | null; game_id: string | null; game_code: string | null;
      environment: string; status: string; launch_url: string | null;
      launched_at: string; last_activity: string; expires_at: string | null;
    }>(
      `SELECT id, session_token, provider, user_id, user_public_id, game_id, game_code,
              environment, status, launch_url, launched_at::text, last_activity::text, expires_at::text
       FROM game_sessions WHERE session_token = $1 LIMIT 1`,
      [token]
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      id:           row.id,
      sessionToken: row.session_token,
      provider:     row.provider,
      userId:       row.user_id,
      userPublicId: row.user_public_id,
      gameId:       row.game_id,
      gameCode:     row.game_code,
      environment:  row.environment,
      status:       row.status,
      launchUrl:    row.launch_url,
      launchedAt:   row.launched_at,
      lastActivity: row.last_activity,
      expiresAt:    row.expires_at,
    };
  }

  // Generate a unique session token
  static generateToken(provider: string): string {
    return `${provider.toLowerCase()}_${Date.now()}_${crypto.randomBytes(12).toString('hex')}`;
  }

  private async touch(token: string): Promise<void> {
    await pool.query(
      `UPDATE game_sessions SET last_activity = NOW() WHERE session_token = $1`,
      [token]
    );
  }

  private async expire(token: string): Promise<void> {
    await pool.query(
      `UPDATE game_sessions SET status = 'EXPIRED' WHERE session_token = $1`,
      [token]
    );
  }
}
