// erp/src/lib/providers/adapters/megah5/MegaH5Adapter.ts
import { BaseProviderAdapter, ProviderError } from '../base/BaseProviderAdapter';
import { PROVIDER_CAPABILITY } from '../../types/capability.types';
import { MEGAH5_CODE, MEGAH5_NAME, MEGAH5_LANGUAGE, OPERATOR_ERROR } from './constants';
import { MegaH5ApiClient } from './MegaH5ApiClient';
import { MegaH5CallbackParser } from './MegaH5CallbackParser';
import { MegaH5CallbackFormatter } from './MegaH5CallbackFormatter';
import type { MegaH5Credentials, MegaH5Config } from './types';
import type { IProviderRepository } from '../../interfaces/IProviderRepository';
import type { MasterWalletEngine } from '../../core/MasterWalletEngine';
import type { EventLogger } from '../../core/EventLogger';
import type { ProviderCapability } from '../../types/capability.types';
import type { GameListResult, GameSyncResult, LaunchParams, LaunchResult } from '../../types/game.types';
import type { HealthCheckResult } from '../../types/health.types';
import type {
  AuthenticateRequest, AuthenticateResponse, BetRequest, BetResponse,
  BetResultRequest, BetResultResponse, FundBetResultRequest, FundBetResultResponse,
  FundRequestRequest, FundRequestResponse, FundReturnRequest, FundReturnResponse,
  GetBalanceRequest, GetBalanceResponse, JackpotWinRequest, JackpotWinResponse,
  RefundRequest, RefundResponse,
} from '../../types/wallet.types';
import type {
  CreatePlayerParams, CreatePlayerResult, UpdatePlayerParams,
  LoginTokenParams, GameListParams,
} from '../../interfaces/IGameProvider';

export class MegaH5Adapter extends BaseProviderAdapter {
  readonly code       = MEGAH5_CODE;
  readonly name       = MEGAH5_NAME;
  readonly walletType = 'SEAMLESS' as const;

  private readonly api:       MegaH5ApiClient;
  private readonly parser:    MegaH5CallbackParser;
  private readonly formatter: MegaH5CallbackFormatter;
  private readonly currency:  string;

  private readonly providerId: number;

  constructor(
    private readonly creds:        MegaH5Credentials,
    private readonly cfg:          MegaH5Config,
    private readonly wallet:       MasterWalletEngine,
    private readonly eventLogger:  EventLogger,
    private readonly providerRepo: IProviderRepository,
    gpProviderId: number,
  ) {
    super();
    this.providerId = gpProviderId;
    this.currency  = cfg.currency ?? 'MYR';
    this.api       = new MegaH5ApiClient(creds, cfg);
    this.parser    = new MegaH5CallbackParser();
    this.formatter = new MegaH5CallbackFormatter();
  }

  // ── Capabilities ─────────────────────────────────────────────────────────────

  getCapabilities(): ProviderCapability[] {
    return [
      PROVIDER_CAPABILITY.SEAMLESS_WALLET,
      PROVIDER_CAPABILITY.LOBBY,
      PROVIDER_CAPABILITY.GAME_SYNC,
    ];
  }

  // ── Player Lifecycle ─────────────────────────────────────────────────────────

  async createPlayer(params: CreatePlayerParams): Promise<CreatePlayerResult> {
    const res = await this.api.createPlayer(
      params.account_id,
      params.nickname,
      params.currency ?? this.currency,
    );
    return { provider_player_id: String(res.playerID), account_id: params.account_id };
  }

  async updatePlayer(_params: UpdatePlayerParams): Promise<void> {
    // MEGAH5 does not expose a separate update-player API; no-op.
  }

  async getPlayerID(accountID: string): Promise<string> {
    const res = await this.api.checkPlayer(accountID);
    return String(res.playerID);
  }

  async logout(_providerPlayerID: string, _currency: string): Promise<void> {
    // MEGAH5 sessions expire automatically; no explicit logout API required.
  }

  // ── Game Launch ──────────────────────────────────────────────────────────────

  async getLoginToken(params: LoginTokenParams): Promise<string> {
    const accountId = this.withPostfix(params.account_id);
    const { actk } = await this.api.h5Login({
      accountId,
      currency:  params.currency ?? this.currency,
      nickname:  params.nickname ?? accountId,
      language:  MEGAH5_LANGUAGE.ZH,
      lobbyUrl:  '',
    });
    return actk;
  }

  getLobbyURL(token: string, _language: number, _lobbyReturnUrl: string): string {
    // MEGAH5 lobby format: /apiLobby?tkn={token}
    const base = this.cfg.h5_lobby_domain.replace(/\/$/, '');
    return `${base}/apiLobby?tkn=${encodeURIComponent(token)}`;
  }

  getGameURL(token: string, gameCode: string, language: number, _lobbyReturnUrl: string): string {
    // MEGAH5 game format: /CallGame/?language={lang}&gName={gameCode}&tkn={token}
    // NOTE: user= (accountId) must be injected via launch() which has the player record
    const base = this.cfg.h5_game_domain.replace(/\/$/, '');
    return `${base}/CallGame/?language=${language}&gName=${encodeURIComponent(gameCode)}&tkn=${encodeURIComponent(token)}`;
  }

  async launch(params: LaunchParams): Promise<LaunchResult> {
    const playerRecord = await this.providerRepo.findPlayer(params.provider_id, params.user_id);
    if (!playerRecord) {
      throw new ProviderError(this.code, OPERATOR_ERROR.PLAYER_NOT_FOUND, 'Player not registered.');
    }

    const accountId = this.withPostfix(playerRecord.provider_account_id);
    const { actk } = await this.api.h5Login({
      accountId,
      currency:  playerRecord.currency ?? this.currency,
      nickname:  accountId,
      language:  params.language ?? MEGAH5_LANGUAGE.ZH,
      lobbyUrl:  params.lobby_return_url,
    });

    const lang = params.language ?? MEGAH5_LANGUAGE.ZH;
    let launchUrl: string;
    if (params.game_code) {
      const base = this.cfg.h5_game_domain.replace(/\/$/, '');
      launchUrl = `${base}/CallGame/?language=${lang}&user=${encodeURIComponent(accountId)}&gName=${encodeURIComponent(params.game_code)}&tkn=${encodeURIComponent(actk)}`;
    } else {
      launchUrl = this.getLobbyURL(actk, lang, params.lobby_return_url);
    }

    return { launch_url: launchUrl, session_token: actk, session_id: 0 };
  }

  // ── Game Catalog ─────────────────────────────────────────────────────────────

  async getGameList(_params?: GameListParams): Promise<GameListResult> {
    const games = await this.api.getGameList();
    return { games, total: games.length };
  }

  async syncGames(): Promise<GameSyncResult> {
    await this.api.getGameList();
    return {
      provider_code: this.code,
      inserted: 0, updated: 0, deactivated: 0,
      errors: [],
      synced_at: new Date().toISOString(),
    };
  }

  // ── Health Check ─────────────────────────────────────────────────────────────

  async healthCheck(): Promise<HealthCheckResult> {
    try {
      const { latencyMs } = await this.api.healthCheck();
      return this.healthOk(latencyMs);
    } catch (err) {
      return this.healthDown(err instanceof Error ? err.message : String(err));
    }
  }

  // ── Callback Token Validation ─────────────────────────────────────────────────

  validateCallbackToken(token: string): boolean {
    return token === this.creds.operator_token;
  }

  // ── Async Callback Handlers ───────────────────────────────────────────────────

  async handleAuthenticateCallback(
    rawBody: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    _ip: string | null,
  ): Promise<Record<string, unknown>> {
    const tokenErr = this.checkToken(headers);
    if (tokenErr) return tokenErr;

    try {
      const userId = this.extractUserIdFromAccountId(String(rawBody.userName ?? ''));
      const req = this.parser.parseAuthenticateRequest({
        ...rawBody,
        __resolved_user_id: userId != null ? String(userId) : undefined,
      });
      const res = await this.wallet.handleAuthenticate(req);
      return this.formatter.formatAuthenticate(res);
    } catch {
      return this.formatter.formatAuthenticate(this.systemErrorAuth());
    }
  }

  async handleGetBalanceCallback(
    rawBody: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    _ip: string | null,
  ): Promise<Record<string, unknown>> {
    const tokenErr = this.checkToken(headers);
    if (tokenErr) return tokenErr;

    try {
      const userId = await this.resolveUserId(rawBody);
      const req = this.parser.parseGetBalanceRequest({ ...rawBody, __resolved_user_id: userId });
      const res = await this.wallet.handleGetBalance(req);
      return this.formatter.formatGetBalance(res);
    } catch {
      return this.formatter.formatGetBalance({ balance: 0, currency: 'MYR', error_code: OPERATOR_ERROR.SYSTEM_ERROR });
    }
  }

  async handleBetCallback(
    rawBody: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    _ip: string | null,
  ): Promise<Record<string, unknown>> {
    const tokenErr = this.checkToken(headers);
    if (tokenErr) return tokenErr;

    try {
      const userId = await this.resolveUserId(rawBody);
      const req = this.parser.parseBetRequest({ ...rawBody, __resolved_user_id: userId });
      const res = await this.wallet.handleBet(req);
      return this.formatter.formatBet(res);
    } catch {
      return this.formatter.formatBet({ transaction_id: '', balance: 0, currency: 'MYR', error_code: OPERATOR_ERROR.SYSTEM_ERROR });
    }
  }

  async handleBetResultCallback(
    rawBody: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    _ip: string | null,
  ): Promise<Record<string, unknown>> {
    const tokenErr = this.checkToken(headers);
    if (tokenErr) return tokenErr;

    try {
      const userId = await this.resolveUserId(rawBody);
      const req = this.parser.parseBetResultRequest({ ...rawBody, __resolved_user_id: userId });
      const res = await this.wallet.handleBetResult(req);
      return this.formatter.formatBetResult(res);
    } catch {
      return this.formatter.formatBetResult({ transaction_id: '', balance: 0, currency: 'MYR', error_code: OPERATOR_ERROR.SYSTEM_ERROR });
    }
  }

  async handleRefundCallback(
    rawBody: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    _ip: string | null,
  ): Promise<Record<string, unknown>> {
    const tokenErr = this.checkToken(headers);
    if (tokenErr) return tokenErr;

    try {
      const userId = await this.resolveUserId(rawBody);
      const req = this.parser.parseRefundRequest({ ...rawBody, __resolved_user_id: userId });
      const res = await this.wallet.handleRefund(req);
      return this.formatter.formatRefund(res);
    } catch {
      return this.formatter.formatRefund({ transaction_id: '', balance: 0, currency: 'MYR', error_code: OPERATOR_ERROR.SYSTEM_ERROR });
    }
  }

  async handleJackpotWinCallback(
    rawBody: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    _ip: string | null,
  ): Promise<Record<string, unknown>> {
    const tokenErr = this.checkToken(headers);
    if (tokenErr) return tokenErr;

    try {
      const userId = await this.resolveUserId(rawBody);
      const req = this.parser.parseJackpotWinRequest({ ...rawBody, __resolved_user_id: userId });
      const res = await this.wallet.handleJackpotWin(req);
      return this.formatter.formatJackpotWin(res);
    } catch {
      return this.formatter.formatJackpotWin({ transaction_id: '', balance: 0, currency: 'MYR', error_code: OPERATOR_ERROR.SYSTEM_ERROR });
    }
  }

  async handleFundRequestCallback(
    rawBody: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    _ip: string | null,
  ): Promise<Record<string, unknown>> {
    const tokenErr = this.checkToken(headers);
    if (tokenErr) return tokenErr;

    try {
      const userId = await this.resolveUserId(rawBody);
      const req = this.parser.parseFundRequestRequest({ ...rawBody, __resolved_user_id: userId });
      const res = await this.wallet.handleFundRequest(req);
      return this.formatter.formatFundRequest(res);
    } catch {
      return this.formatter.formatFundRequest({ transaction_id: '', balance: 0, currency: 'MYR', error_code: OPERATOR_ERROR.SYSTEM_ERROR });
    }
  }

  async handleFundReturnCallback(
    rawBody: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    _ip: string | null,
  ): Promise<Record<string, unknown>> {
    const tokenErr = this.checkToken(headers);
    if (tokenErr) return tokenErr;

    try {
      const userId = await this.resolveUserId(rawBody);
      const req = this.parser.parseFundReturnRequest({ ...rawBody, __resolved_user_id: userId });
      const res = await this.wallet.handleFundReturn(req);
      return this.formatter.formatFundReturn(res);
    } catch {
      return this.formatter.formatFundReturn({ transaction_id: '', balance: 0, currency: 'MYR', error_code: OPERATOR_ERROR.SYSTEM_ERROR });
    }
  }

  async handleFundBetResultCallback(
    rawBody: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    _ip: string | null,
  ): Promise<Record<string, unknown>> {
    const tokenErr = this.checkToken(headers);
    if (tokenErr) return tokenErr;

    const res = this.formatter.formatFundBetResult({
      transaction_id: '', balance: 0, currency: 'MYR', error_code: 0,
    });
    return res;
  }

  // ── IGameProvider parse/format stubs (required by interface) ─────────────────

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
    return this.formatter.formatFundBetResult(res as unknown as Record<string, unknown>);
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private checkToken(
    headers: Record<string, string | string[] | undefined>,
  ): Record<string, unknown> | null {
    const authHeader = headers['authorization'] ?? headers['x-operator-token'] ?? '';
    const token = typeof authHeader === 'string'
      ? authHeader.replace(/^Bearer\s+/i, '')
      : '';
    if (token !== this.creds.operator_token) {
      return { error: OPERATOR_ERROR.AUTH_FAILED };
    }
    return null;
  }

  /** Append postfix_id (e.g. "@opulux") if not already present. */
  private withPostfix(id: string): string {
    if (this.cfg.postfix_id && !id.includes('@')) {
      return id + this.cfg.postfix_id;
    }
    return id;
  }

  private extractUserIdFromAccountId(accountId: string): number | null {
    // accountId format: "u{userId}@{postfix}" → extract userId
    const match = /^u(\d+)(?:@|$)/.exec(accountId);
    return match ? Number(match[1]) : null;
  }

  private async resolveUserId(body: Record<string, unknown>): Promise<string | undefined> {
    const accountId = String(body.userName ?? body.playerID ?? '');
    const userId = this.extractUserIdFromAccountId(accountId);
    if (userId != null) return String(userId);

    // Fallback: look up gp_players by provider_player_id (only when providerId is known)
    const pid = body.playerID;
    if (pid != null && this.providerId > 0) {
      const { default: pool } = await import('@/lib/db');
      const { rows } = await pool.query<{ user_id: number }>(
        `SELECT user_id FROM gp_players WHERE provider_id=$1 AND provider_player_id=$2 LIMIT 1`,
        [this.providerId, String(pid)],
      );
      if (rows[0]) return String(rows[0].user_id);
    }
    return undefined;
  }

  private systemErrorAuth(): AuthenticateResponse {
    return { player_id: '', balance: 0, currency: 'MYR', error_code: OPERATOR_ERROR.SYSTEM_ERROR };
  }
}
