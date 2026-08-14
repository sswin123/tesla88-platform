import { BaseProviderAdapter, NotSupportedError, ProviderError } from '../base/BaseProviderAdapter';
import { PROVIDER_CAPABILITY } from '../../types/capability.types';
import { PUSSY888APP_CODE, PUSSY888APP_NAME } from './constants';
import { Pussy888ApiClient } from './Pussy888ApiClient';
import type { Pussy888Credentials, Pussy888Config, ProviderAccountRow } from './types';
import type { IProviderRepository } from '../../interfaces/IProviderRepository';
import type { MasterWalletEngine } from '../../core/MasterWalletEngine';
import type { EventLogger } from '../../core/EventLogger';
import type { ProviderCapability } from '../../types/capability.types';
import type { GameListResult, GameSyncResult, LaunchParams, LaunchResult } from '../../types/game.types';
import type { HealthCheckResult } from '../../types/health.types';
import type {
  AuthenticateRequest, AuthenticateResponse,
  BetRequest, BetResponse,
  BetResultRequest, BetResultResponse,
  GetBalanceRequest, GetBalanceResponse,
  RefundRequest, RefundResponse,
} from '../../types/wallet.types';
import type {
  CreatePlayerParams, CreatePlayerResult, UpdatePlayerParams,
  LoginTokenParams, TopUpParams, TopUpResult, WithdrawParams, WithdrawResult,
} from '../../interfaces/IGameProvider';

export class Pussy888Adapter extends BaseProviderAdapter {
  readonly code       = PUSSY888APP_CODE;
  readonly name       = PUSSY888APP_NAME;
  readonly walletType = 'TRANSFER' as const;

  private readonly api: Pussy888ApiClient;

  constructor(
    private readonly creds:  Pussy888Credentials,
    private readonly cfg:    Pussy888Config,
    _wallet:                 MasterWalletEngine,
    _eventLogger:            EventLogger,
    _providerRepo:           IProviderRepository,
  ) {
    super();
    this.api = new Pussy888ApiClient(creds, cfg);
  }

  // ── Capabilities ──────────────────────────────────────────────────────────

  getCapabilities(): ProviderCapability[] {
    return [PROVIDER_CAPABILITY.TRANSFER_WALLET, PROVIDER_CAPABILITY.LOBBY];
  }

  // ── Player Lifecycle ──────────────────────────────────────────────────────

  /**
   * Creates a Pussy888 player account and persists credentials to provider_accounts.
   * userName format: {agent}u{userId} — unique, agent-scoped, no separator ambiguity.
   */
  async createPlayer(params: CreatePlayerParams): Promise<CreatePlayerResult> {
    const internalUserId = this.extractUserId(params.account_id);
    if (internalUserId == null) {
      throw new ProviderError(this.code, 400, `Cannot extract user_id from account_id="${params.account_id}"`);
    }

    const userName = this.buildUserName(internalUserId);
    await this.api.createUser(userName);
    await this.upsertProviderAccount(internalUserId, userName);

    return { provider_player_id: userName, account_id: params.account_id };
  }

  async updatePlayer(_params: UpdatePlayerParams): Promise<void> {
    // Pussy888 API does not expose a profile update endpoint.
  }

  async getPlayerID(accountID: string): Promise<string> {
    const userId = this.extractUserId(accountID);
    if (userId == null) throw new ProviderError(this.code, 400, `Cannot extract user_id from "${accountID}"`);

    const row = await this.findProviderAccount(userId);
    if (!row) throw new ProviderError(this.code, 404, 'Pussy888 provider account not found. Register player first.');
    return row.provider_login_id;
  }

  async logout(_providerPlayerID: string, _currency: string): Promise<void> {
    // Pussy888 API has no explicit logout endpoint.
  }

  // ── Game Launch ───────────────────────────────────────────────────────────

  async getLoginToken(params: LoginTokenParams): Promise<string> {
    return params.provider_player_id;
  }

  getLobbyURL(_token: string, _language: number, _lobbyReturnUrl: string): string {
    // Pussy888 is a native app — no web lobby URL.
    return '';
  }

  getGameURL(_token: string, _gameCode: string, _language: number, _lobbyReturnUrl: string): string {
    return '';
  }

  /**
   * Look up (or auto-create) the player's Pussy888 account.
   * Returns session_token with login credentials for the website to display.
   */
  async launch(params: LaunchParams): Promise<LaunchResult> {
    const userId = params.user_id;

    let row = await this.findProviderAccount(userId);

    if (!row) {
      const userName = this.buildUserName(userId);
      await this.api.createUser(userName);
      await this.upsertProviderAccount(userId, userName);

      const now = new Date().toISOString();
      row = {
        id: 0, provider_code: PUSSY888APP_CODE, user_id: userId,
        provider_login_id: userName, provider_password: '',
        provider_user_id: null, extra: {}, created_at: now, updated_at: now,
      };
    }

    return {
      launch_url:        '',
      provider_login_id: row.provider_login_id,
      session_token: JSON.stringify({
        provider_code:        PUSSY888APP_CODE,
        login_id:             row.provider_login_id,
        download_url_android: this.cfg.download_url_android ?? null,
        download_url_ios:     this.cfg.download_url_ios     ?? null,
        apk_name:             'Pussy888',
      }),
      session_id: 0,
    };
  }

  // ── Transfer Wallet ───────────────────────────────────────────────────────

  /** Transfer IN: deposit from operator wallet → Pussy888 player wallet. */
  async topUp(params: TopUpParams): Promise<TopUpResult> {
    if (params.amount <= 0) {
      throw new ProviderError(this.code, 400, 'topUp amount must be positive');
    }
    const balance = await this.api.deposit(params.provider_player_id, params.amount);
    return { order_id: params.reference_id, balance };
  }

  /** Transfer OUT: withdraw from Pussy888 player wallet → operator wallet. */
  async withdraw(params: WithdrawParams): Promise<WithdrawResult> {
    if (params.amount <= 0) {
      throw new ProviderError(this.code, 400, 'withdraw amount must be positive');
    }
    const balance = await this.api.withdraw(params.provider_player_id, params.amount);
    return { order_id: params.reference_id, balance };
  }

  /** Withdraw ALL balance from the player's Pussy888 account. Returns amount transferred out. */
  async autoWithdrawAll(loginId: string): Promise<number> {
    return this.api.withdrawAll(loginId);
  }

  async withdrawAll(loginId: string): Promise<number> {
    return this.autoWithdrawAll(loginId);
  }

  async getBalance(providerPlayerID: string, _currency: string): Promise<number> {
    try {
      return await this.api.getUserBalance(providerPlayerID);
    } catch {
      return 0;
    }
  }

  // ── Health Check ──────────────────────────────────────────────────────────

  async healthCheck(): Promise<HealthCheckResult> {
    if (!this.creds.authcode || !this.creds.secret_key || !this.creds.agent) {
      return this.healthDown(
        'Pussy888 credentials incomplete (authcode / secret_key / agent required)',
      );
    }

    const start = Date.now();
    try {
      // Use getUserInfo with a non-existent test username to verify API connectivity
      // and credential validity. A "user not found" error still confirms auth is OK.
      const testUser = `${this.creds.agent}healthcheck`;
      await this.api.getUserBalance(testUser);
      return this.healthOk(Date.now() - start);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // If the error is "user not found" (errCode 1006 or similar) — API is reachable and creds are valid.
      if (msg.includes('1006') || msg.includes('not exist') || msg.includes('UserName')) {
        return this.healthOk(Date.now() - start);
      }
      return this.healthDown(`Pussy888 API: ${msg}`);
    }
  }

  // ── Callback token validation ─────────────────────────────────────────────

  validateCallbackToken(_token: string): boolean {
    // Pussy888 TRANSFER wallet has no game callbacks.
    return true;
  }

  // ── Game Catalog ──────────────────────────────────────────────────────────

  async getGameList(): Promise<GameListResult> {
    return { games: [], total: 0 };
  }

  async syncGames(): Promise<GameSyncResult> {
    return {
      provider_code: this.code,
      inserted: 0, updated: 0, deactivated: 0,
      errors: [],
      synced_at: new Date().toISOString(),
    };
  }

  // ── Seamless stubs (Transfer Wallet — no callbacks) ───────────────────────

  parseAuthenticateRequest(_b: Record<string, unknown>): AuthenticateRequest {
    throw new NotSupportedError(this.code, 'parseAuthenticateRequest');
  }
  parseGetBalanceRequest(_b: Record<string, unknown>): GetBalanceRequest {
    throw new NotSupportedError(this.code, 'parseGetBalanceRequest');
  }
  parseBetRequest(_b: Record<string, unknown>): BetRequest {
    throw new NotSupportedError(this.code, 'parseBetRequest');
  }
  parseBetResultRequest(_b: Record<string, unknown>): BetResultRequest {
    throw new NotSupportedError(this.code, 'parseBetResultRequest');
  }
  parseRefundRequest(_b: Record<string, unknown>): RefundRequest {
    throw new NotSupportedError(this.code, 'parseRefundRequest');
  }
  formatAuthenticateResponse(_r: AuthenticateResponse): Record<string, unknown> {
    throw new NotSupportedError(this.code, 'formatAuthenticateResponse');
  }
  formatGetBalanceResponse(_r: GetBalanceResponse): Record<string, unknown> {
    throw new NotSupportedError(this.code, 'formatGetBalanceResponse');
  }
  formatBetResponse(_r: BetResponse): Record<string, unknown> {
    throw new NotSupportedError(this.code, 'formatBetResponse');
  }
  formatBetResultResponse(_r: BetResultResponse): Record<string, unknown> {
    throw new NotSupportedError(this.code, 'formatBetResultResponse');
  }
  formatRefundResponse(_r: RefundResponse): Record<string, unknown> {
    throw new NotSupportedError(this.code, 'formatRefundResponse');
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Build the Pussy888 userName for a given internal userId.
   * Format: {agent}u{userId} — e.g. "PSYA333u42"
   * Uniqueness is guaranteed by userId; agent prefix scopes to this operator.
   */
  private buildUserName(userId: number): string {
    return `${this.creds.agent}u${userId}`;
  }

  private extractUserId(accountId: string): number | null {
    const match = /^u(\d+)(?:@|$)/.exec(accountId);
    return match ? Number(match[1]) : null;
  }

  private async findProviderAccount(userId: number): Promise<ProviderAccountRow | null> {
    const { default: pool } = await import('@/lib/db');
    const { rows } = await pool.query<ProviderAccountRow>(
      `SELECT * FROM provider_accounts WHERE provider_code = $1 AND user_id = $2 LIMIT 1`,
      [PUSSY888APP_CODE, userId],
    );
    return rows[0] ?? null;
  }

  private async upsertProviderAccount(userId: number, userName: string): Promise<void> {
    const { default: pool } = await import('@/lib/db');
    await pool.query(
      `INSERT INTO provider_accounts
         (provider_code, user_id, provider_login_id, provider_password)
       VALUES ($1, $2, $3, '')
       ON CONFLICT (provider_code, user_id) DO UPDATE
         SET provider_login_id = EXCLUDED.provider_login_id,
             updated_at        = NOW()`,
      [PUSSY888APP_CODE, userId, userName],
    );
  }
}
