/**
 * Data access contract for game_sessions (migration 056).
 * The existing table is reused — no new session table is created.
 */
export interface ISessionRepository {
  findByToken(token: string): Promise<SessionRecord | null>;

  findActiveByUser(userId: number, provider?: string): Promise<SessionRecord[]>;

  create(input: SessionInput): Promise<SessionRecord>;

  updateStatus(id: number, status: SessionStatus): Promise<void>;

  touchActivity(id: number): Promise<void>;

  expireStale(olderThanMinutes: number): Promise<number>;
}

export type SessionStatus = 'ACTIVE' | 'ENDED' | 'EXPIRED' | 'ERROR';

export interface SessionRecord {
  id: number;
  session_token: string;
  provider: string;
  user_id: number | null;
  user_public_id: string | null;
  game_id: string | null;
  game_code: string | null;
  environment: string;
  status: SessionStatus;
  launched_at: string;
  last_activity: string;
  expires_at: string | null;
  launch_url: string | null;
  metadata: Record<string, unknown> | null;
}

export interface SessionInput {
  session_token: string;
  provider: string;
  user_id?: number | null;
  user_public_id?: string | null;
  game_id?: string | null;
  game_code?: string | null;
  environment?: string;
  launch_url?: string | null;
  expires_at?: Date | null;
  metadata?: Record<string, unknown> | null;
}
