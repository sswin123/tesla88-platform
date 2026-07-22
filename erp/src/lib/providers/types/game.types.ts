/**
 * Game catalog and sync types.
 */

export const GAME_TYPE = {
  SLOT: 1,
  ARCADE: 2,
  TABLE: 3,
  FISHING: 4,
  LIVE_CASINO: 5,
  OTHER: 9,
} as const;

export type GameType = (typeof GAME_TYPE)[keyof typeof GAME_TYPE];

/** A game record as stored in gp_games. */
export interface GameRecord {
  id: number;
  provider_id: number;
  game_code: string;
  name: string;
  game_type: GameType;
  sub_type: string | null;
  icon_url: string | null;
  banner_url: string | null;
  is_active: boolean;
  is_hot: boolean;
  is_new: boolean;
  is_maintenance: boolean;
  sort_order: number;
  metadata: Record<string, unknown>;
  synced_at: string;
  created_at: string;
  updated_at: string;
}

/** Minimal game data returned by a provider's game-list API. */
export interface GameListItem {
  game_code: string;
  name: string;
  game_type: GameType;
  sub_type?: string | null;
  icon_url?: string | null;
  banner_url?: string | null;
  is_active?: boolean;
  metadata?: Record<string, unknown>;
}

/** Result of a game-list API call. */
export interface GameListResult {
  games: GameListItem[];
  /** Total count from the provider (may differ from games.length if paginated). */
  total?: number;
}

/** Result of a sync operation that upserts games into gp_games. */
export interface GameSyncResult {
  provider_code: string;
  inserted: number;
  updated: number;
  deactivated: number;
  errors: string[];
  synced_at: string;
}

/** Parameters for launching a game or lobby. */
export interface LaunchParams {
  user_id: number;
  provider_id: number;
  /** null = lobby launch */
  game_code: string | null;
  language: number;
  /** Return-to-lobby URL embedded in the game frame. */
  lobby_return_url: string;
  platform?: 'MOBILE' | 'WEB';
  currency?: string;
}

/** Result of a game launch request. */
export interface LaunchResult {
  /** The URL to open in the player's browser / iframe. */
  launch_url: string;
  /** Session token created by the provider (may be null for some providers). */
  session_token: string | null;
  /** Our internal game session ID. */
  session_id: number;
}

/** Timepoint cursor record from gp_timepoints. */
export interface TimepointRecord {
  provider_id: number;
  feed_type: string;
  last_timepoint: number;
  last_polled_at: string | null;
}
