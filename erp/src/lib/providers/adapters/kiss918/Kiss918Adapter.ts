import { randomUUID } from 'crypto';
import { BaseProviderAdapter, ProviderError } from '../base/BaseProviderAdapter';
import { PROVIDER_CAPABILITY } from '../../types/capability.types';
import { GAME_TYPE } from '../../types/game.types';
import {
  KISS918_CODE,
  KISS918_NAME,
  KISS918_LANGUAGE,
  OPERATOR_ERROR,
} from './constants';
import { Kiss918CircuitBreaker } from './Kiss918CircuitBreaker';
import { Kiss918AuthService } from './Kiss918AuthService';
import { Kiss918ApiClient } from './Kiss918ApiClient';
import { Kiss918CallbackParser } from './Kiss918CallbackParser';
import { Kiss918CallbackFormatter } from './Kiss918CallbackFormatter';
import { Kiss918CallbackLogger } from './Kiss918CallbackLogger';
import type { IProviderRepository } from '../../interfaces/IProviderRepository';
import type { MasterWalletEngine } from '../../core/MasterWalletEngine';
import type { EventLogger } from '../../core/EventLogger';
import type { ProviderCapability } from '../../types/capability.types';
import type { GameListResult, GameSyncResult, LaunchParams, LaunchResult } from '../../types/game.types';
import type { HealthCheckResult } from '../../types/health.types';
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
} from '../../types/wallet.types';
import type {
  CreatePlayerParams,
  CreatePlayerResult,
  UpdatePlayerParams,
  LoginTokenParams,
  TopUpParams,
  TopUpResult,
  WithdrawParams,
  WithdrawResult,
  PlaySessionsFeed,
  FailedTransactionsFeed,
  CheckOrderParams,
  CheckOrderResult,
  GameListParams,
} from '../../interfaces/IGameProvider';

// ── Credential / Config shapes ────────────────────────────────────────────────

export interface Kiss918Credentials {
  /** 918KISS PROVIDER API access token (sent by us in outbound API calls). */
  api_token: string;
  /** 918KISS OPERATOR token (sent by 918KISS in inbound callback headers). */
  operator_token: string;
  /** MD5Key used in H5 Login signature. */
  md5_key: string;
  /** SecretKey used in H5 Login signature. */
  secret_key: string;
  /** DES EncryptKey (8 bytes) for H5 Login QS encryption. */
  encrypt_key: string;
  /** Delimiter appended before MD5 hash in the sign string. */
  delimiter: string;
}

export interface Kiss918Config {
  /** 918KISS Integration / Operations API base URL. */
  api_base_url: string;
  /** 918KISS DataFeed API base URL (separate from Operations API). */
  datafeed_url?: string;
  /** 918KISS H5 API domain (for /api/Acc/Login, /api/Game/GameList). */
  h5_api_domain: string;
  /** 918KISS H5 Lobby launch domain. */
  h5_lobby_domain: string;
  /** 918KISS H5 Game launch domain. */
  h5_game_domain: string;
  /** Base URL for game icon images. */
  game_icon_url?: string;
  /** PostfixID appended to player accountIDs (e.g. "stopulux"). Must be lowercase. */
  postfix_id: string;
  /** Default currency (default "MYR"). */
  currency?: string;
  /** HTTP request timeout in milliseconds (default 10 000). */
  timeout_ms?: number;
  /** Number of failures before circuit opens (default 5). */
  circuit_threshold?: number;
  /** Circuit breaker cooldown in milliseconds (default 30 000). */
  circuit_cooldown_ms?: number;
  /** Default lobby return URL embedded in login token QS. */
  default_lobby_url?: string;
  /** Enable verbose request/response logging (default false). */
  debug?: boolean;
}

/**
 * Kiss918Adapter — 918KISS H5 API v1.11 implementation.
 *
 * Extends BaseProviderAdapter and implements IGameProvider for the 918KISS
 * game provider using the Seamless Wallet integration model.
 *
 * Supported operations:
 *   Outbound (OPERATOR → 918KISS): CreatePlayer, UpdatePlayer, CheckPlayer,
 *     GetBalance, TopUp, Withdraw, Logout, GameList, Timepoint, CheckOrder.
 *   H5 Launch: DES+MD5 signed H5 Login → getLobbyURL / getGameURL.
 *   Inbound callbacks (918KISS → OPERATOR): Authenticate, GetBalance, Bet,
 *     BetResult, Refund, JackpotWin, FundRequest, FundReturn, FundBetResult.
 *   Replay Support: retryAction() re-processes any callback via idempotency.
 *   Debug Mode: verbose logging when cfg.debug = true.
 *   Circuit Breaker: opens after cfg.circuit_threshold consecutive failures.
 *
 * Hard constraints (never modify):
 *   - Uses existing MasterWalletEngine — no direct wallet balance changes.
 *   - Uses existing TransactionEngine via MasterWalletEngine.
 *   - All 918KISS-specific logic stays inside this adapter boundary.
 *   - Does not modify any Core Framework file.
 */
export class Kiss918Adapter extends BaseProviderAdapter {
  readonly code = KISS918_CODE;
  readonly name = KISS918_NAME;
  readonly walletType = 'SEAMLESS' as const;

  private readonly circuit:   Kiss918CircuitBreaker;
  private readonly auth:      Kiss918AuthService;
  private readonly api:       Kiss918ApiClient;
  private readonly parser:    Kiss918CallbackParser;
  private readonly formatter: Kiss918CallbackFormatter;
  private readonly cbLogger:  Kiss918CallbackLogger;

  private readonly currency:         string;
  private readonly defaultLobbyUrl:  string;
  private readonly debug:            boolean;

  /** Cached provider row ID (loaded lazily from gp_providers). */
  private providerId: number | null = null;

  constructor(
    private readonly creds: Kiss918Credentials,
    private readonly cfg:   Kiss918Config,
    private readonly wallet: MasterWalletEngine,
    private readonly eventLogger: EventLogger,
    private readonly providerRepo: IProviderRepository,
  ) {
    super();

    this.currency        = cfg.currency        ?? 'MYR';
    this.defaultLobbyUrl = cfg.default_lobby_url ?? '';
    this.debug           = cfg.debug            ?? false;

    this.circuit = new Kiss918CircuitBreaker({
      threshold:  cfg.circuit_threshold   ?? 5,
      cooldownMs: cfg.circuit_cooldown_ms ?? 30_000,
    });

    this.auth = new Kiss918AuthService();

    this.api = new Kiss918ApiClient(
      {
        apiBaseUrl:      cfg.api_base_url,
        datafeedBaseUrl: cfg.datafeed_url,
        h5ApiDomain:     cfg.h5_api_domain,
        apiToken:        creds.api_token,
        timeoutMs:       cfg.timeout_ms ?? 10_000,
        debug:           this.debug,
      },
      this.circuit,
    );

    this.parser    = new Kiss918CallbackParser();
    this.formatter = new Kiss918CallbackFormatter();
    this.cbLogger  = new Kiss918CallbackLogger(eventLogger);
  }

  // ── Capability Declaration ─────────────────────────────────────────────────

  getCapabilities(): ProviderCapability[] {
    return [
      PROVIDER_CAPABILITY.SEAMLESS_WALLET,
      PROVIDER_CAPABILITY.JACKPOT,
      PROVIDER_CAPABILITY.GAME_SYNC,
      PROVIDER_CAPABILITY.LOBBY,
      PROVIDER_CAPABILITY.HISTORY,
      PROVIDER_CAPABILITY.TIME_POINT,
      PROVIDER_CAPABILITY.FAILED_TRANSACTION,
      PROVIDER_CAPABILITY.LOGOUT,
      PROVIDER_CAPABILITY.FUND_FLOAT,
      PROVIDER_CAPABILITY.CHECK_ORDER,
      PROVIDER_CAPABILITY.NICKNAME_UPDATE,
    ];
  }

  // ── Player Lifecycle ───────────────────────────────────────────────────────

  async createPlayer(params: CreatePlayerParams): Promise<CreatePlayerResult> {
    const res = await this.api.createPlayer(
      params.account_id,
      params.nickname,
      params.currency ?? this.currency,
      KISS918_LANGUAGE.ZH,
    );
    return {
      provider_player_id: String(res.playerID),
      account_id: params.account_id,
    };
  }

  async updatePlayer(params: UpdatePlayerParams): Promise<void> {
    if (params.nickname) {
      await this.api.updatePlayer(Number(params.provider_player_id), params.nickname);
    }
  }

  async getPlayerID(accountID: string): Promise<string> {
    const res = await this.api.checkPlayer(accountID);
    return String(res.playerID);
  }

  async logout(providerPlayerID: string, currency: string): Promise<void> {
    await this.api.logout(Number(providerPlayerID), currency);
  }

  // ── Game Launch ────────────────────────────────────────────────────────────

  async getLoginToken(params: LoginTokenParams): Promise<string> {
    const { actk } = await this.auth.getLoginToken({
      accountId:    params.account_id,
      currency:     params.currency,
      nickname:     params.nickname ?? params.account_id,
      language:     KISS918_LANGUAGE.ZH,
      lobbyUrl:     this.defaultLobbyUrl,
      h5ApiDomain:  this.cfg.h5_api_domain,
      md5Key:       this.creds.md5_key,
      secretKey:    this.creds.secret_key,
      encryptKey:   this.creds.encrypt_key,
      delimiter:    this.creds.delimiter,
      timeoutMs:    this.cfg.timeout_ms ?? 10_000,
      debug:        this.debug,
    });
    return actk;
  }

  getLobbyURL(token: string, language: number, lobbyReturnUrl: string): string {
    const base = this.cfg.h5_lobby_domain.replace(/\/$/, '');
    const qs   = new URLSearchParams({
      tkn:      token,
      language: String(language),
      lobbyUrl: lobbyReturnUrl,
    }).toString();
    return `${base}/apiLobby?${qs}`;
  }

  getGameURL(
    token: string,
    gameCode: string,
    language: number,
    lobbyReturnUrl: string,
  ): string {
    const base = this.cfg.h5_game_domain.replace(/\/$/, '');
    const qs   = new URLSearchParams({
      tkn:      token,
      gName:    gameCode,
      language: String(language),
      lobbyUrl: lobbyReturnUrl,
    }).toString();
    return `${base}/CallGame/?${qs}`;
  }

  /**
   * Full launch flow: H5 Login with real lobbyReturnUrl, then build URL.
   * Overrides the ProviderManager flow so lobbyUrl is embedded in the actk.
   */
  async launch(params: LaunchParams): Promise<LaunchResult> {
    const playerRecord = await this.providerRepo.findPlayer(params.provider_id, params.user_id);
    if (!playerRecord) {
      throw new ProviderError(this.code, OPERATOR_ERROR.PLAYER_NOT_FOUND, 'Player not registered.');
    }

    const { actk } = await this.auth.getLoginToken({
      accountId:   playerRecord.provider_account_id,
      currency:    playerRecord.currency,
      nickname:    playerRecord.provider_account_id,
      language:    params.language,
      lobbyUrl:    params.lobby_return_url,
      h5ApiDomain: this.cfg.h5_api_domain,
      md5Key:      this.creds.md5_key,
      secretKey:   this.creds.secret_key,
      encryptKey:  this.creds.encrypt_key,
      delimiter:   this.creds.delimiter,
      timeoutMs:   this.cfg.timeout_ms ?? 10_000,
      debug:       this.debug,
    });

    const launchUrl = params.game_code
      ? this.getGameURL(actk, params.game_code, params.language, params.lobby_return_url)
      : this.getLobbyURL(actk, params.language, params.lobby_return_url);

    return { launch_url: launchUrl, session_token: actk, session_id: 0 };
  }

  // ── Game Catalog ───────────────────────────────────────────────────────────

  async getGameList(_params?: GameListParams): Promise<GameListResult> {
    const games = await this.api.getGameList();
    return { games, total: games.length };
  }

  async syncGames(): Promise<GameSyncResult> {
    // GameSyncService.syncProvider() owns the actual upsert via getGameList() +
    // gameRepo.upsertBatch().  This method pre-fetches the list so callers that
    // bypass GameSyncService get an up-to-date result, but counts are 0 because
    // no DB write occurs here.
    await this.api.getGameList();
    return {
      provider_code: this.code,
      inserted:      0,
      updated:       0,
      deactivated:   0,
      errors:        [],
      synced_at:     new Date().toISOString(),
    };
  }

  // ── Transfer Wallet (optional — used for reconciliation / failsafe) ────────

  async topUp(params: TopUpParams): Promise<TopUpResult> {
    const res = await this.api.topUp(
      Number(params.provider_player_id),
      params.amount,
      params.currency,
      params.reference_id,
    );
    return { order_id: res.orderID, balance: res.balance };
  }

  async withdraw(params: WithdrawParams): Promise<WithdrawResult> {
    const res = await this.api.withdraw(
      Number(params.provider_player_id),
      params.amount,
      params.currency,
      params.reference_id,
    );
    return { order_id: res.orderID, balance: res.balance };
  }

  async getBalance(providerPlayerID: string, currency: string): Promise<number> {
    const res = await this.api.getBalance(Number(providerPlayerID), currency);
    return res.balance;
  }

  // ── Async Callback Handlers (full pipeline) ────────────────────────────────
  // Route handlers call these instead of the sync parse/format pair.
  // These methods own: token validation → logging → player resolution →
  //                    parsing → wallet → formatting.

  async handleAuthenticateCallback(
    rawBody: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    ip: string | null,
  ): Promise<Record<string, unknown>> {
    const logId = await this.cbLogger.logInbound('AUTHENTICATE', rawBody, headers, ip);
    const start = Date.now();
    // Guard: validate operator token before any DB operation
    const tokenErr = this.checkToken(rawBody, headers);
    if (tokenErr) {
      await this.cbLogger.logComplete(logId, tokenErr, 401, Date.now() - start, 'Invalid operator token');
      return tokenErr;
    }
    try {
      const accountId = String(rawBody.userName ?? '');
      const userId    = this.extractUserIdFromAccountId(accountId);
      const req = this.parser.parseAuthenticateRequest({
        ...rawBody,
        __resolved_user_id: userId != null ? String(userId) : undefined,
      });
      const res = await this.wallet.handleAuthenticate(req);
      const out = this.formatter.formatAuthenticate(res);
      await this.cbLogger.logComplete(logId, out, 200, Date.now() - start);
      return out;
    } catch (err) {
      const out = this.formatter.formatAuthenticate(this.systemErrorAuth());
      await this.cbLogger.logComplete(logId, out, 500, Date.now() - start,
        err instanceof Error ? err.message : String(err));
      return out;
    }
  }

  async handleGetBalanceCallback(
    rawBody: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    ip: string | null,
  ): Promise<Record<string, unknown>> {
    const logId = await this.cbLogger.logInbound('GET_BALANCE', rawBody, headers, ip);
    const start = Date.now();
    const tokenErr = this.checkToken(rawBody, headers);
    if (tokenErr) {
      await this.cbLogger.logComplete(logId, tokenErr, 401, Date.now() - start, 'Invalid operator token');
      return tokenErr;
    }
    try {
      const userId = await this.resolveUserId(String(rawBody.playerID ?? ''));
      const req    = this.parser.parseGetBalanceRequest({ ...rawBody, __resolved_user_id: userId });
      const res    = await this.wallet.handleGetBalance(req);
      const out    = this.formatter.formatGetBalance(res);
      await this.cbLogger.logComplete(logId, out, 200, Date.now() - start);
      return out;
    } catch (err) {
      const out = { error: OPERATOR_ERROR.SYSTEM_ERROR, balance: 0 };
      await this.cbLogger.logComplete(logId, out, 500, Date.now() - start,
        err instanceof Error ? err.message : String(err));
      return out;
    }
  }

  async handleBetCallback(
    rawBody: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    ip: string | null,
  ): Promise<Record<string, unknown>> {
    const logId = await this.cbLogger.logInbound('BET', rawBody, headers, ip);
    const start = Date.now();
    const tokenErr = this.checkToken(rawBody, headers);
    if (tokenErr) {
      await this.cbLogger.logComplete(logId, tokenErr, 401, Date.now() - start, 'Invalid operator token');
      return tokenErr;
    }
    try {
      const userId = await this.resolveUserId(String(rawBody.playerID ?? ''));
      const req    = this.parser.parseBetRequest({ ...rawBody, __resolved_user_id: userId });
      const res    = await this.wallet.handleBet(req);
      const out    = this.formatter.formatBet(res);
      await this.cbLogger.logComplete(logId, out, 200, Date.now() - start);
      return out;
    } catch (err) {
      const out = this.formatter.formatBet(this.systemErrorBet());
      await this.cbLogger.logComplete(logId, out, 500, Date.now() - start,
        err instanceof Error ? err.message : String(err));
      return out;
    }
  }

  async handleBetResultCallback(
    rawBody: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    ip: string | null,
  ): Promise<Record<string, unknown>> {
    const logId = await this.cbLogger.logInbound('BET_RESULT', rawBody, headers, ip);
    const start = Date.now();
    const tokenErr = this.checkToken(rawBody, headers);
    if (tokenErr) {
      await this.cbLogger.logComplete(logId, tokenErr, 401, Date.now() - start, 'Invalid operator token');
      return tokenErr;
    }
    try {
      const userId = await this.resolveUserId(String(rawBody.playerID ?? ''));
      const req    = this.parser.parseBetResultRequest({ ...rawBody, __resolved_user_id: userId });
      const res    = await this.wallet.handleBetResult(req);
      const out    = this.formatter.formatBetResult(res);
      await this.cbLogger.logComplete(logId, out, 200, Date.now() - start);
      return out;
    } catch (err) {
      const out = this.formatter.formatBetResult(this.systemErrorBetResult());
      await this.cbLogger.logComplete(logId, out, 500, Date.now() - start,
        err instanceof Error ? err.message : String(err));
      return out;
    }
  }

  async handleRefundCallback(
    rawBody: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    ip: string | null,
  ): Promise<Record<string, unknown>> {
    const logId = await this.cbLogger.logInbound('REFUND', rawBody, headers, ip);
    const start = Date.now();
    const tokenErr = this.checkToken(rawBody, headers);
    if (tokenErr) {
      await this.cbLogger.logComplete(logId, tokenErr, 401, Date.now() - start, 'Invalid operator token');
      return tokenErr;
    }
    try {
      const userId = await this.resolveUserId(String(rawBody.playerID ?? ''));
      const req    = this.parser.parseRefundRequest({ ...rawBody, __resolved_user_id: userId });
      const res    = await this.wallet.handleRefund(req);
      const out    = this.formatter.formatRefund(res);
      await this.cbLogger.logComplete(logId, out, 200, Date.now() - start);
      return out;
    } catch (err) {
      const out = this.formatter.formatRefund(this.systemErrorRefund());
      await this.cbLogger.logComplete(logId, out, 500, Date.now() - start,
        err instanceof Error ? err.message : String(err));
      return out;
    }
  }

  async handleJackpotWinCallback(
    rawBody: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    ip: string | null,
  ): Promise<Record<string, unknown>> {
    const logId = await this.cbLogger.logInbound('JACKPOT_WIN', rawBody, headers, ip);
    const start = Date.now();
    const tokenErr = this.checkToken(rawBody, headers);
    if (tokenErr) {
      await this.cbLogger.logComplete(logId, tokenErr, 401, Date.now() - start, 'Invalid operator token');
      return tokenErr;
    }
    try {
      const userId = await this.resolveUserId(String(rawBody.playerID ?? ''));
      const req    = this.parser.parseJackpotWinRequest({ ...rawBody, __resolved_user_id: userId });
      const res    = await this.wallet.handleJackpotWin(req);
      const out    = this.formatter.formatJackpotWin(res);
      await this.cbLogger.logComplete(logId, out, 200, Date.now() - start);
      return out;
    } catch (err) {
      const out = this.formatter.formatJackpotWin(this.systemErrorJackpot());
      await this.cbLogger.logComplete(logId, out, 500, Date.now() - start,
        err instanceof Error ? err.message : String(err));
      return out;
    }
  }

  async handleFundRequestCallback(
    rawBody: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    ip: string | null,
  ): Promise<Record<string, unknown>> {
    const logId = await this.cbLogger.logInbound('FUND_REQUEST', rawBody, headers, ip);
    const start = Date.now();
    const tokenErr = this.checkToken(rawBody, headers);
    if (tokenErr) {
      await this.cbLogger.logComplete(logId, tokenErr, 401, Date.now() - start, 'Invalid operator token');
      return tokenErr;
    }
    try {
      const userId = await this.resolveUserId(String(rawBody.playerID ?? ''));
      const req    = this.parser.parseFundRequestRequest({ ...rawBody, __resolved_user_id: userId });
      const res    = await this.wallet.handleFundRequest(req);
      const out    = this.formatter.formatFundRequest(res);
      await this.cbLogger.logComplete(logId, out, 200, Date.now() - start);
      return out;
    } catch (err) {
      const out = this.formatter.formatFundRequest(this.systemErrorFundRequest());
      await this.cbLogger.logComplete(logId, out, 500, Date.now() - start,
        err instanceof Error ? err.message : String(err));
      return out;
    }
  }

  async handleFundReturnCallback(
    rawBody: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    ip: string | null,
  ): Promise<Record<string, unknown>> {
    const logId = await this.cbLogger.logInbound('FUND_RETURN', rawBody, headers, ip);
    const start = Date.now();
    const tokenErr = this.checkToken(rawBody, headers);
    if (tokenErr) {
      await this.cbLogger.logComplete(logId, tokenErr, 401, Date.now() - start, 'Invalid operator token');
      return tokenErr;
    }
    try {
      const userId = await this.resolveUserId(String(rawBody.playerID ?? ''));
      const req    = this.parser.parseFundReturnRequest({ ...rawBody, __resolved_user_id: userId });
      const res    = await this.wallet.handleFundReturn(req);
      const out    = this.formatter.formatFundReturn(res);
      await this.cbLogger.logComplete(logId, out, 200, Date.now() - start);
      return out;
    } catch (err) {
      const out = this.formatter.formatFundReturn(this.systemErrorFundReturn());
      await this.cbLogger.logComplete(logId, out, 500, Date.now() - start,
        err instanceof Error ? err.message : String(err));
      return out;
    }
  }

  async handleFundBetResultCallback(
    rawBody: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    ip: string | null,
  ): Promise<Record<string, unknown>> {
    const logId = await this.cbLogger.logInbound('FUND_BET_RESULT', rawBody, headers, ip);
    const start = Date.now();
    const tokenErr = this.checkToken(rawBody, headers);
    if (tokenErr) {
      await this.cbLogger.logComplete(logId, tokenErr, 401, Date.now() - start, 'Invalid operator token');
      return tokenErr;
    }
    try {
      const userId = await this.resolveUserId(String(rawBody.playerID ?? ''));
      const req    = this.parser.parseFundBetResultRequest({ ...rawBody, __resolved_user_id: userId });
      // FundBetResult is informational — wallet engine acknowledges without balance change
      const res    = await this.wallet.handleFundBetResult(req);
      const out    = this.formatter.formatFundBetResult(res);
      await this.cbLogger.logComplete(logId, out, 200, Date.now() - start);
      return out;
    } catch (err) {
      const out = this.formatter.formatFundBetResult({ error_code: OPERATOR_ERROR.SYSTEM_ERROR });
      await this.cbLogger.logComplete(logId, out, 500, Date.now() - start,
        err instanceof Error ? err.message : String(err));
      return out;
    }
  }

  /**
   * Validate the operator token sent by 918KISS in every callback.
   * Token may be in the request body (operatorToken field) or in a header
   * (operator-token or authorization).  Returns a formatted error response
   * if invalid, or null if the token is valid.
   */
  private checkToken(
    rawBody: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
  ): Record<string, unknown> | null {
    const token =
      String(rawBody.operatorToken ?? '') ||
      String(headers['operator-token'] ?? '') ||
      String(headers['authorization'] ?? '').replace(/^Bearer\s+/i, '');

    if (!this.validateCallbackToken(token)) {
      return { error: OPERATOR_ERROR.INVALID_TOKEN };
    }
    return null;
  }

  // ── Replay Support ─────────────────────────────────────────────────────────

  /**
   * Re-play a previously failed callback through the wallet engine.
   * Called by RetryQueue.tick() with the original action + payload.
   * Idempotency in TransactionEngine prevents double-crediting.
   */
  async retryAction(action: string, payload: Record<string, unknown>): Promise<void> {
    if (this.debug) {
      console.debug(`[Kiss918Adapter] Replaying action="${action}"`, payload);
    }

    // Resolve the user_id from stored provider_player_id in the payload
    const providerId918 = String(payload.playerID ?? payload.__resolved_user_id ?? '');
    const userId        = await this.resolveUserId(providerId918).catch(() => providerId918);
    const enriched      = { ...payload, __resolved_user_id: userId };

    switch (action) {
      case 'BET':
        await this.wallet.handleBet(this.parser.parseBetRequest(enriched));
        break;
      case 'BET_RESULT':
        await this.wallet.handleBetResult(this.parser.parseBetResultRequest(enriched));
        break;
      case 'REFUND':
        await this.wallet.handleRefund(this.parser.parseRefundRequest(enriched));
        break;
      case 'JACKPOT_WIN':
        await this.wallet.handleJackpotWin(this.parser.parseJackpotWinRequest(enriched));
        break;
      case 'FUND_REQUEST':
        await this.wallet.handleFundRequest(this.parser.parseFundRequestRequest(enriched));
        break;
      case 'FUND_RETURN':
        await this.wallet.handleFundReturn(this.parser.parseFundReturnRequest(enriched));
        break;
      default:
        throw new Error(`[Kiss918Adapter] Unknown retry action: "${action}"`);
    }
  }

  // ── Mandatory Sync Parse Methods (IGameProvider interface) ─────────────────

  parseAuthenticateRequest(body: Record<string, unknown>): AuthenticateRequest {
    return this.parser.parseAuthenticateRequest(body);
  }

  parseGetBalanceRequest(body: Record<string, unknown>): GetBalanceRequest {
    return this.parser.parseGetBalanceRequest(body);
  }

  parseBetRequest(body: Record<string, unknown>): BetRequest {
    return this.parser.parseBetRequest(body);
  }

  parseBetResultRequest(body: Record<string, unknown>): BetResultRequest {
    return this.parser.parseBetResultRequest(body);
  }

  parseRefundRequest(body: Record<string, unknown>): RefundRequest {
    return this.parser.parseRefundRequest(body);
  }

  parseJackpotWinRequest(body: Record<string, unknown>): JackpotWinRequest {
    return this.parser.parseJackpotWinRequest(body);
  }

  parseFundRequestRequest(body: Record<string, unknown>): FundRequestRequest {
    return this.parser.parseFundRequestRequest(body);
  }

  parseFundReturnRequest(body: Record<string, unknown>): FundReturnRequest {
    return this.parser.parseFundReturnRequest(body);
  }

  parseFundBetResultRequest(body: Record<string, unknown>): FundBetResultRequest {
    return this.parser.parseFundBetResultRequest(body);
  }

  // ── Mandatory Sync Format Methods ──────────────────────────────────────────

  formatAuthenticateResponse(res: AuthenticateResponse): Record<string, unknown> {
    return this.formatter.formatAuthenticate(res);
  }

  formatGetBalanceResponse(res: GetBalanceResponse): Record<string, unknown> {
    return this.formatter.formatGetBalance(res);
  }

  formatBetResponse(res: BetResponse): Record<string, unknown> {
    return this.formatter.formatBet(res);
  }

  formatBetResultResponse(res: BetResultResponse): Record<string, unknown> {
    return this.formatter.formatBetResult(res);
  }

  formatRefundResponse(res: RefundResponse): Record<string, unknown> {
    return this.formatter.formatRefund(res);
  }

  formatJackpotWinResponse(res: JackpotWinResponse): Record<string, unknown> {
    return this.formatter.formatJackpotWin(res);
  }

  formatFundRequestResponse(res: FundRequestResponse): Record<string, unknown> {
    return this.formatter.formatFundRequest(res);
  }

  formatFundReturnResponse(res: FundReturnResponse): Record<string, unknown> {
    return this.formatter.formatFundReturn(res);
  }

  formatFundBetResultResponse(res: FundBetResultResponse): Record<string, unknown> {
    return this.formatter.formatFundBetResult(res);
  }

  // ── Data Feeds ────────────────────────────────────────────────────────────

  async getPlaySessions(timepoint = 0): Promise<PlaySessionsFeed> {
    // playerID=0 is the 918KISS wildcard meaning "all players for this operator".
    const res = await this.api.getPlaySessions(0, timepoint);
    return {
      records: res.records.map((r) => ({
        reference_id: String(r['referenceID'] ?? ''),
        round_id:     r['roundID'] != null ? String(r['roundID']) : null,
        game_code:    r['gameID'] != null ? String(r['gameID']) : null,
        bet_amount:   Number(r['betAmount'] ?? 0),
        win_amount:   Number(r['winAmount'] ?? 0),
        currency:     String(r['currency'] ?? 'MYR'),
        status:       String(r['status'] ?? ''),
        created_at:   String(r['createdAt'] ?? ''),
      })),
      next_timepoint: res.nextTimePoint,
    };
  }

  async getFailedTransactions(timepoint = 0): Promise<FailedTransactionsFeed> {
    const res = await this.api.getFailedTransactions(timepoint);
    return {
      records: res.records.map((r) => ({
        reference_id:  String(r['referenceID'] ?? ''),
        callback_type: String(r['type'] ?? ''),
        status:        String(r['status'] ?? ''),
        amount:        Number(r['amount'] ?? 0),
        currency:      String(r['currency'] ?? 'MYR'),
        created_at:    String(r['createdAt'] ?? ''),
      })),
      next_timepoint: res.nextTimePoint,
    };
  }

  async getTimepoint(datetime: string): Promise<number> {
    const res = await this.api.getTimepoint(datetime);
    return res.timePoint;
  }

  async checkOrder(params: CheckOrderParams): Promise<CheckOrderResult> {
    return this.api.checkOrder(
      Number(params.provider_player_id),
      params.order_id,
    );
  }

  async updateNickname(providerPlayerID: string, nickname: string): Promise<void> {
    await this.api.updatePlayer(Number(providerPlayerID), nickname);
  }

  // ── Health Check ───────────────────────────────────────────────────────────

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      // Lightweight health probe: check circuit state first
      if (this.circuit.getState() === 'OPEN') {
        return this.healthDown(
          `Circuit breaker OPEN (${this.circuit.getFailureCount()} failures)`,
          Date.now() - start,
        );
      }

      // Ping the Operations API with a lightweight call
      await this.api.getGameList();
      return this.healthOk(Date.now() - start);
    } catch (err) {
      return this.healthDown(
        err instanceof Error ? err.message : String(err),
        Date.now() - start,
      );
    }
  }

  // ── Token Validation ───────────────────────────────────────────────────────

  validateCallbackToken(token: string): boolean {
    return token === this.creds.operator_token;
  }

  // ── Internal Helpers ───────────────────────────────────────────────────────

  /**
   * Look up our users.id from a 918KISS-assigned playerID.
   * Queries gp_players by (provider_id, provider_player_id).
   */
  private async resolveUserId(kiss918PlayerID: string): Promise<string> {
    const pid = await this.getProviderId();
    const player = await this.findPlayerByProviderPlayerId(pid, kiss918PlayerID);
    if (!player) {
      if (this.debug) {
        console.debug(`[Kiss918Adapter] Player not found: kiss918PlayerID=${kiss918PlayerID}`);
      }
      throw new ProviderError(this.code, OPERATOR_ERROR.PLAYER_NOT_FOUND,
        `No gp_players row for provider_player_id="${kiss918PlayerID}"`);
    }
    return String(player.user_id);
  }

  /**
   * Lazy-load our provider_id from gp_providers.
   */
  private async getProviderId(): Promise<number> {
    if (this.providerId !== null) return this.providerId;
    const provider = await this.providerRepo.findByCode(KISS918_CODE);
    if (!provider) {
      throw new Error(`[Kiss918Adapter] Provider "${KISS918_CODE}" not found in gp_providers.`);
    }
    this.providerId = provider.id;
    return provider.id;
  }

  /**
   * Find a gp_players row by (provider_id, provider_player_id).
   * This executes a direct DB query since IProviderRepository.findPlayer
   * takes (provider_id, user_id) not (provider_id, provider_player_id).
   */
  private async findPlayerByProviderPlayerId(
    providerIdVal: number,
    kiss918PlayerId: string,
  ): Promise<{ user_id: number } | null> {
    // Use pool directly for this targeted lookup (not exposed via IProviderRepository)
    const { default: pool } = await import('@/lib/db');
    const { rows } = await pool.query<{ user_id: number }>(
      `SELECT user_id FROM gp_players
        WHERE provider_id = $1 AND provider_player_id = $2
        LIMIT 1`,
      [providerIdVal, kiss918PlayerId],
    );
    return rows[0] ?? null;
  }

  /**
   * Extract our users.id from the accountID format "u{userId}@{postfixId}".
   * Returns null if the format does not match.
   */
  private extractUserIdFromAccountId(accountId: string): number | null {
    const postfix = this.cfg.postfix_id ? `@${this.cfg.postfix_id}` : '';
    const re = postfix
      ? new RegExp(`^u(\\d+)${postfix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
      : /^u(\d+)@/;
    const m = accountId.match(re);
    return m ? Number(m[1]) : null;
  }

  // ── System Error Response Factories ───────────────────────────────────────

  private systemErrorAuth(): AuthenticateResponse {
    return { player_id: '', balance: 0, currency: this.currency, error_code: OPERATOR_ERROR.SYSTEM_ERROR };
  }

  private systemErrorBet(): BetResponse {
    return { transaction_id: randomUUID(), balance: 0, currency: this.currency, error_code: OPERATOR_ERROR.SYSTEM_ERROR };
  }

  private systemErrorBetResult(): BetResultResponse {
    return { transaction_id: randomUUID(), balance: 0, currency: this.currency, error_code: OPERATOR_ERROR.SYSTEM_ERROR };
  }

  private systemErrorRefund(): RefundResponse {
    return { transaction_id: randomUUID(), balance: 0, currency: this.currency, error_code: OPERATOR_ERROR.SYSTEM_ERROR };
  }

  private systemErrorJackpot(): JackpotWinResponse {
    return { transaction_id: randomUUID(), balance: 0, currency: this.currency, error_code: OPERATOR_ERROR.SYSTEM_ERROR };
  }

  private systemErrorFundRequest(): FundRequestResponse {
    return { transaction_id: randomUUID(), balance: 0, currency: this.currency, error_code: OPERATOR_ERROR.SYSTEM_ERROR };
  }

  private systemErrorFundReturn(): FundReturnResponse {
    return { transaction_id: randomUUID(), balance: 0, currency: this.currency, error_code: OPERATOR_ERROR.SYSTEM_ERROR };
  }
}
