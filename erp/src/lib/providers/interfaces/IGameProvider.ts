import type { ProviderCapability } from '../types/capability.types';
import type {
  GameListResult,
  GameSyncResult,
  LaunchParams,
  LaunchResult,
} from '../types/game.types';
import type { HealthCheckResult } from '../types/health.types';
import type { ProviderRecord } from '../types/provider.types';
import type {
  AuthenticateRequest,
  AuthenticateResponse,
  BetRequest,
  BetResponse,
  BetResultRequest,
  BetResultResponse,
  FundBetResultRequest,
  FundBetResultResponse,
  FundRequestRequest,
  FundRequestResponse,
  FundReturnRequest,
  FundReturnResponse,
  GetBalanceRequest,
  GetBalanceResponse,
  JackpotWinRequest,
  JackpotWinResponse,
  RefundRequest,
  RefundResponse,
} from '../types/wallet.types';

/**
 * Universal Game Provider Interface.
 *
 * Every game provider integration MUST implement this interface.
 * The ProviderManager routes all game operations through it without
 * ever checking the concrete adapter type.
 *
 * Implementation rules for adapter authors:
 *  - All provider-specific encoding, encryption, and signing belongs inside
 *    the adapter — it must never leak into the framework layer.
 *  - Throw a ProviderError (or a subclass) for expected failures so the
 *    framework can translate error codes correctly.
 *  - Throw a standard Error for unexpected / programmer errors.
 */
export interface IGameProvider {
  /**
   * Unique provider code matching gp_providers.code (e.g. "918KISS").
   * Used as the routing key in ProviderRegistry.
   */
  readonly code: string;

  /** Human-readable name used in logs and UI. */
  readonly name: string;

  /** Wallet integration model this adapter requires. */
  readonly walletType: 'SEAMLESS' | 'TRANSFER';

  // ── Capability Declaration ─────────────────────────────────────────────────

  /**
   * Returns the list of capabilities this provider supports.
   * The framework calls this once at registration time to populate
   * gp_providers.capabilities and to gate feature availability.
   */
  getCapabilities(): ProviderCapability[];

  // ── Player Lifecycle ───────────────────────────────────────────────────────

  /**
   * Register a new player account on the provider's system.
   * Called automatically on first game launch if the player is not yet registered.
   * @returns The provider's assigned player ID string.
   */
  createPlayer(params: CreatePlayerParams): Promise<CreatePlayerResult>;

  /**
   * Update a player's profile data on the provider's system.
   * Typically called when the player changes their display name.
   */
  updatePlayer(params: UpdatePlayerParams): Promise<void>;

  /**
   * Retrieve the provider's internal player ID for a known account ID.
   * Used when the provider player ID was not stored from createPlayer.
   */
  getPlayerID(accountID: string): Promise<string>;

  /**
   * Invalidate the player's active session on the provider side.
   * Idempotent — should not throw if the player is already logged out.
   */
  logout(providerPlayerID: string, currency: string): Promise<void>;

  // ── Game Launch ────────────────────────────────────────────────────────────

  /**
   * Obtain a short-lived login token from the provider.
   * Used to construct the game or lobby launch URL.
   */
  getLoginToken(params: LoginTokenParams): Promise<string>;

  /**
   * Construct the full lobby launch URL given an access token.
   * Requires LOBBY capability.
   */
  getLobbyURL(token: string, language: number, lobbyReturnUrl: string): string;

  /**
   * Construct a direct game launch URL given an access token and game code.
   */
  getGameURL(
    token: string,
    gameCode: string,
    language: number,
    lobbyReturnUrl: string,
  ): string;

  /**
   * High-level launch method that calls getLoginToken + builds URL.
   * Called by ProviderManager.launchGame().
   */
  launch(params: LaunchParams): Promise<LaunchResult>;

  // ── Game Catalog ───────────────────────────────────────────────────────────

  /**
   * Fetch the full game list from the provider.
   * Requires GAME_SYNC capability.
   */
  getGameList(params?: GameListParams): Promise<GameListResult>;

  /**
   * Fetch and upsert the game catalog into gp_games.
   * Called by GameSyncService on schedule or manual trigger.
   */
  syncGames(): Promise<GameSyncResult>;

  // ── Transfer Wallet Operations (OPERATOR → PROVIDER) ──────────────────────
  // These are only used when walletType === 'TRANSFER'.

  /**
   * Top up the player's balance on the provider side.
   * Transfer Wallet only.
   */
  topUp?(params: TopUpParams): Promise<TopUpResult>;

  /**
   * Withdraw all or part of the player's balance from the provider side.
   * Transfer Wallet only; also used as a failsafe for FundReturn failures.
   */
  withdraw?(params: WithdrawParams): Promise<WithdrawResult>;

  /**
   * Query the player's current balance on the provider side.
   * Transfer Wallet only.
   */
  getBalance?(providerPlayerID: string, currency: string): Promise<number>;

  // ── Seamless Wallet Callbacks (PROVIDER → US) ─────────────────────────────
  // Adapters translate the raw HTTP request body into these typed shapes.
  // The framework's MasterWalletEngine handles the actual balance changes.

  parseAuthenticateRequest(body: Record<string, unknown>): AuthenticateRequest;
  parseGetBalanceRequest(body: Record<string, unknown>): GetBalanceRequest;
  parseBetRequest(body: Record<string, unknown>): BetRequest;
  parseBetResultRequest(body: Record<string, unknown>): BetResultRequest;
  parseRefundRequest(body: Record<string, unknown>): RefundRequest;
  parseJackpotWinRequest?(body: Record<string, unknown>): JackpotWinRequest;
  parseFundRequestRequest?(body: Record<string, unknown>): FundRequestRequest;
  parseFundReturnRequest?(body: Record<string, unknown>): FundReturnRequest;
  parseFundBetResultRequest?(body: Record<string, unknown>): FundBetResultRequest;

  /**
   * Serialize a wallet callback response into the provider's expected JSON shape.
   * Each provider may have different field names and error code conventions.
   */
  formatAuthenticateResponse(res: AuthenticateResponse): Record<string, unknown>;
  formatGetBalanceResponse(res: GetBalanceResponse): Record<string, unknown>;
  formatBetResponse(res: BetResponse): Record<string, unknown>;
  formatBetResultResponse(res: BetResultResponse): Record<string, unknown>;
  formatRefundResponse(res: RefundResponse): Record<string, unknown>;
  formatJackpotWinResponse?(res: JackpotWinResponse): Record<string, unknown>;
  formatFundRequestResponse?(res: FundRequestResponse): Record<string, unknown>;
  formatFundReturnResponse?(res: FundReturnResponse): Record<string, unknown>;
  formatFundBetResultResponse?(res: FundBetResultResponse): Record<string, unknown>;

  // ── Data Feeds ────────────────────────────────────────────────────────────

  /**
   * Fetch play sessions (completed rounds) since the given timepoint.
   * Requires TIME_POINT capability.
   * @param timepoint UTC epoch milliseconds cursor; 0 = start from beginning.
   */
  getPlaySessions?(timepoint?: number): Promise<PlaySessionsFeed>;

  /**
   * Fetch failed / incomplete transactions since the given timepoint.
   * Requires FAILED_TRANSACTION capability.
   */
  getFailedTransactions?(timepoint?: number): Promise<FailedTransactionsFeed>;

  /**
   * Get a single play session by its reference ID.
   */
  checkPlaySession?(referenceID: string): Promise<PlaySessionRecord | null>;

  /**
   * Convert a datetime string to a provider timepoint cursor.
   * Requires TIME_POINT capability.
   */
  getTimepoint?(datetime: string): Promise<number>;

  /**
   * Verify the status of a TopUp/Withdraw order.
   */
  checkOrder?(params: CheckOrderParams): Promise<CheckOrderResult>;

  // ── Operations ─────────────────────────────────────────────────────────────

  /**
   * Perform a lightweight ping or API call to verify connectivity.
   * Called by HealthMonitor on a schedule.
   */
  healthCheck(): Promise<HealthCheckResult>;

  /**
   * Update the display nickname of a player on the provider's system.
   * Requires NICKNAME_UPDATE capability.
   */
  updateNickname?(providerPlayerID: string, nickname: string): Promise<void>;

  /**
   * Validate that an inbound callback token / header belongs to this provider.
   * Called by SecurityService before routing the callback.
   */
  validateCallbackToken(token: string): boolean;
}

// ── Supporting parameter / result types ──────────────────────────────────────

export interface CreatePlayerParams {
  account_id: string;
  nickname: string;
  currency: string;
  metadata?: Record<string, unknown>;
}

export interface CreatePlayerResult {
  provider_player_id: string;
  account_id: string;
}

export interface UpdatePlayerParams {
  provider_player_id: string;
  nickname?: string;
  currency?: string;
  metadata?: Record<string, unknown>;
}

export interface LoginTokenParams {
  provider_player_id: string;
  account_id: string;
  currency: string;
  nickname?: string;
}

export interface GameListParams {
  cursor?: string | number | null;
  page_size?: number;
}

export interface TopUpParams {
  provider_player_id: string;
  amount: number;
  currency: string;
  reference_id: string;
}

export interface TopUpResult {
  order_id: string;
  balance: number;
}

export interface WithdrawParams {
  provider_player_id: string;
  amount: number;
  currency: string;
  reference_id: string;
}

export interface WithdrawResult {
  order_id: string;
  balance: number;
}

export interface PlaySessionRecord {
  reference_id: string;
  round_id: string | null;
  game_code: string | null;
  bet_amount: number;
  win_amount: number;
  currency: string;
  status: string;
  created_at: string;
}

export interface PlaySessionsFeed {
  records: PlaySessionRecord[];
  next_timepoint: number;
}

export interface FailedTransactionRecord {
  reference_id: string;
  callback_type: string;
  status: string;
  amount: number;
  currency: string;
  created_at: string;
}

export interface FailedTransactionsFeed {
  records: FailedTransactionRecord[];
  next_timepoint: number;
}

export interface CheckOrderParams {
  order_id: string;
  provider_player_id: string;
}

export interface CheckOrderResult {
  order_id: string;
  status: 'CONFIRMED' | 'UNCONFIRMED' | 'CANCELLED' | 'PENDING';
  amount: number;
  currency: string;
}
