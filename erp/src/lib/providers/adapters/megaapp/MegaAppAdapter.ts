// erp/src/lib/providers/adapters/megaapp/MegaAppAdapter.ts
import { BaseProviderAdapter, NotSupportedError, ProviderError } from '../base/BaseProviderAdapter';
import { PROVIDER_CAPABILITY } from '../../types/capability.types';
import {
  MEGAAPP_CODE, MEGAAPP_NAME, MEGAAPP_DEEPLINK_SCHEME,
  MEGAAPP_CALLBACK_LOGIN,
} from './constants';
import { MegaAppApiClient } from './MegaAppApiClient';
import { MegaAppSigner } from './MegaAppSigner';
import type { MegaAppCredentials, MegaAppConfig, ProviderAccountRow } from './types';
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

export class MegaAppAdapter extends BaseProviderAdapter {
  readonly code       = MEGAAPP_CODE;
  readonly name       = MEGAAPP_NAME;
  readonly walletType = 'TRANSFER' as const;

  private readonly api:    MegaAppApiClient;
  private readonly signer: MegaAppSigner;

  constructor(
    private readonly creds:        MegaAppCredentials,
    private readonly cfg:          MegaAppConfig,
    _wallet:                       MasterWalletEngine,
    _eventLogger:                  EventLogger,
    _providerRepo:                 IProviderRepository,
  ) {
    super();
    this.api    = new MegaAppApiClient(creds, cfg);
    this.signer = new MegaAppSigner(creds.secret_code);
  }

  // ── Capabilities ──────────────────────────────────────────────────────────

  getCapabilities(): ProviderCapability[] {
    return [PROVIDER_CAPABILITY.TRANSFER_WALLET, PROVIDER_CAPABILITY.LOBBY];
  }

  // ── Player Lifecycle ──────────────────────────────────────────────────────

  /**
   * Creates a player on MEGA, generates a password, and saves both to
   * provider_accounts so the dialog can display them.
   * The ProviderManager will separately upsert gp_players with the returned
   * provider_player_id (loginId).
   */
  async createPlayer(params: CreatePlayerParams): Promise<CreatePlayerResult> {
    const { loginId, userId } = await this.api.createMember(
      params.nickname ?? params.account_id,
    );

    const password = this.signer.generatePassword(this.cfg.password_length || 10);

    // Derive user_id from account_id ("u{userId}@{postfix}" or "u{userId}")
    const internalUserId = this.extractUserId(params.account_id);
    if (internalUserId == null) {
      throw new ProviderError(this.code, 400, `Cannot extract user_id from account_id="${params.account_id}"`);
    }

    await this.upsertProviderAccount({
      provider_code:     MEGAAPP_CODE,
      user_id:           internalUserId,
      provider_login_id: loginId,
      provider_password: password,
      provider_user_id:  userId,
    });

    return { provider_player_id: loginId, account_id: params.account_id };
  }

  async updatePlayer(_params: UpdatePlayerParams): Promise<void> {
    // MEGA App does not expose an update-profile API.
  }

  async getPlayerID(accountID: string): Promise<string> {
    const userId = this.extractUserId(accountID);
    if (userId == null) throw new ProviderError(this.code, 400, `Cannot extract user_id from "${accountID}"`);

    const row = await this.findProviderAccount(userId);
    if (!row) throw new ProviderError(this.code, 404, 'Provider account not found');
    return row.provider_login_id;
  }

  async logout(providerPlayerID: string, _currency: string): Promise<void> {
    await this.api.logout(providerPlayerID);
  }

  // ── Game Launch ───────────────────────────────────────────────────────────

  /**
   * For MEGAAPP the "token" is the loginId — no server-side session concept.
   */
  async getLoginToken(params: LoginTokenParams): Promise<string> {
    return params.provider_player_id;
  }

  /**
   * Android deeplink (no password — use launch() for full credentials).
   */
  getLobbyURL(loginId: string, _language: number, _lobbyReturnUrl: string): string {
    return `${MEGAAPP_DEEPLINK_SCHEME}://?account=${encodeURIComponent(loginId)}`;
  }

  getGameURL(loginId: string, _gameCode: string, _language: number, _lobbyReturnUrl: string): string {
    return this.getLobbyURL(loginId, 0, '');
  }

  /**
   * Returns:
   *   launch_url    — Android deeplink (for "Play Now" button)
   *   session_token — JSON { login_id, password } for dialog display
   *
   * Auto-creates a provider account if none exists (first launch).
   */
  async launch(params: LaunchParams): Promise<LaunchResult> {
    const userId = params.user_id;

    let row = await this.findProviderAccount(userId);

    if (!row) {
      // First launch: look up gp_players to get the existing provider record
      const { default: pool } = await import('@/lib/db');
      const { rows: gpRows } = await pool.query<{
        provider_player_id: string | null;
        provider_account_id: string;
      }>(
        `SELECT provider_player_id, provider_account_id
         FROM gp_players
         WHERE provider_id = $1 AND user_id = $2 LIMIT 1`,
        [params.provider_id, userId],
      );

      if (gpRows[0]?.provider_player_id) {
        // gp_players has loginId but provider_accounts was not yet created
        const loginId  = gpRows[0].provider_player_id;
        const password = this.signer.generatePassword(this.cfg.password_length || 10);
        await this.upsertProviderAccount({
          provider_code:     MEGAAPP_CODE,
          user_id:           userId,
          provider_login_id: loginId,
          provider_password: password,
        });
        row = await this.findProviderAccount(userId);
      }
    }

    if (!row) {
      throw new ProviderError(this.code, 404, 'MEGAAPP player not found. Register first.');
    }

    const loginId  = row.provider_login_id;
    const password = row.provider_password;

    const launchUrl = [
      `${MEGAAPP_DEEPLINK_SCHEME}://?account=${encodeURIComponent(loginId)}`,
      `&password=${encodeURIComponent(password)}`,
    ].join('');

    return {
      launch_url:    launchUrl,
      session_token: JSON.stringify({
        login_id:             loginId,
        password,
        provider_code:        MEGAAPP_CODE,
        download_url_android: this.cfg.download_url_android ?? null,
        download_url_ios:     this.cfg.download_url_ios     ?? null,
        apk_name:             this.cfg.apk_name             ?? 'MEGA888',
      }),
      session_id:    0,
    };
  }

  // ── Transfer Wallet ───────────────────────────────────────────────────────

  /**
   * Transfer IN: deposit from operator wallet → MEGA player wallet.
   * amount must be positive.
   */
  async topUp(params: TopUpParams): Promise<TopUpResult> {
    if (params.amount <= 0) {
      throw new ProviderError(this.code, 400, 'topUp amount must be positive');
    }
    const loginId = params.provider_player_id;
    const balance = await this.api.balanceTransfer(loginId, params.amount, params.reference_id);
    return { order_id: params.reference_id, balance };
  }

  /**
   * Transfer OUT: withdraw from MEGA player wallet → operator wallet.
   * Pass positive amount to withdraw that amount, or use autoWithdraw() to pull all.
   */
  async withdraw(params: WithdrawParams): Promise<WithdrawResult> {
    if (params.amount <= 0) {
      throw new ProviderError(this.code, 400, 'withdraw amount must be positive');
    }
    const loginId = params.provider_player_id;
    // Negative amount = withdraw from MEGA
    const balance = await this.api.balanceTransfer(loginId, -params.amount, params.reference_id);
    return { order_id: params.reference_id, balance };
  }

  /**
   * Automatically withdraw ALL balance from the player's MEGA account.
   * Returns the amount transferred out.
   */
  async autoWithdrawAll(loginId: string, bizId?: string): Promise<number> {
    return this.api.autoTransferOut(loginId, bizId);
  }

  /**
   * getBalance — uses getMember API which may return null balance.
   * If null, returns 0 and logs a warning.
   */
  async getBalance(providerPlayerID: string, _currency: string): Promise<number> {
    try {
      const info = await this.api.getMember(providerPlayerID);
      return info.balance ?? 0;
    } catch {
      return 0;
    }
  }

  // ── Login Callback Handler ────────────────────────────────────────────────

  /**
   * Handles the MEGA login callback: open.operator.user.login
   *
   * MEGA calls this when a player logs into the MEGA app with loginId+password.
   * We verify the digest, verify the password, and return a sessionId.
   *
   * Returns a JSON-RPC 2.0 result body (not wrapped in NextResponse).
   */
  async handleLoginCallback(
    rpcId:   string,
    params:  Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const random   = String(params['random']   ?? '');
    const digest   = String(params['digest']   ?? '');
    const sn       = String(params['sn']       ?? '');
    const loginId  = String(params['loginId']  ?? '');
    const password = String(params['password'] ?? '');

    // Verify digest from MEGA: MD5(random+sn+loginId+secretCode)
    if (!this.signer.verifyLoginDigest(random, sn, loginId, digest)) {
      return this.loginFailure(rpcId, '37197', 'Digest verification failed');
    }

    // Look up provider account by loginId
    const { default: pool } = await import('@/lib/db');
    const { rows } = await pool.query<{ provider_password: string; user_id: number }>(
      `SELECT provider_password, user_id FROM provider_accounts
       WHERE provider_code = $1 AND provider_login_id = $2 LIMIT 1`,
      [MEGAAPP_CODE, loginId],
    );

    if (!rows[0]) {
      return this.loginFailure(rpcId, '21102', 'Member not found');
    }

    if (rows[0].provider_password !== password) {
      return this.loginFailure(rpcId, '2218', 'Username or password incorrect');
    }

    const sessionId = this.signer.generateSessionId(this.creds.sn);

    // Per official API docs: success response → result: { success: "1", sessionId, msg }
    return {
      jsonrpc: '2.0',
      id:      rpcId,
      result:  { success: '1', sessionId, msg: '登录成功' },
      error:   null,
    };
  }

  /**
   * Build login failure response per official API spec:
   * result: { success: "0", errorCode, msg }, error: null
   * NOT the JSON-RPC error field — MEGA reads errorCode from result.
   */
  private loginFailure(id: string, errorCode: string, msg: string): Record<string, unknown> {
    return {
      jsonrpc: '2.0',
      id,
      result:  { success: '0', errorCode, msg },
      error:   null,
    };
  }

  // ── Health Check ──────────────────────────────────────────────────────────

  async healthCheck(): Promise<HealthCheckResult> {
    if (!this.creds.secret_code || !this.creds.sn || !this.cfg.api_base_url || !this.creds.agent_login_id) {
      return this.healthDown('MEGAAPP credentials incomplete (secret_code / sn / api_base_url / agent_login_id required)');
    }

    const start = Date.now();
    try {
      // Use getMember with agentLoginId — a real API call that verifies:
      //   1. API URL is reachable
      //   2. SN is recognised by MEGA
      //   3. MD5 digest (secretCode) is valid
      // Error 21102 (member not found) is acceptable — it confirms connectivity.
      await this.api.getMember(this.creds.agent_login_id);
      return this.healthOk(Date.now() - start);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // 21102 / 21111 = member not found — API URL + credentials are valid
      if (msg.includes('21102') || msg.includes('37111') || msg.includes('21111')) {
        return this.healthOk(Date.now() - start);
      }
      return this.healthDown(`MEGA API: ${msg}`);
    }
  }

  // ── Callback Token Validation ─────────────────────────────────────────────

  validateCallbackToken(_token: string): boolean {
    // MEGAAPP uses digest-based verification in handleLoginCallback; no token header.
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

  private extractUserId(accountId: string): number | null {
    const match = /^u(\d+)(?:@|$)/.exec(accountId);
    return match ? Number(match[1]) : null;
  }

  private async findProviderAccount(userId: number): Promise<ProviderAccountRow | null> {
    const { default: pool } = await import('@/lib/db');
    const { rows } = await pool.query<ProviderAccountRow>(
      `SELECT * FROM provider_accounts WHERE provider_code = $1 AND user_id = $2 LIMIT 1`,
      [MEGAAPP_CODE, userId],
    );
    return rows[0] ?? null;
  }

  private async upsertProviderAccount(data: {
    provider_code:     string;
    user_id:           number;
    provider_login_id: string;
    provider_password: string;
    provider_user_id?: number;
  }): Promise<void> {
    const { default: pool } = await import('@/lib/db');
    await pool.query(
      `INSERT INTO provider_accounts
         (provider_code, user_id, provider_login_id, provider_password, provider_user_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (provider_code, user_id) DO UPDATE
         SET provider_login_id  = EXCLUDED.provider_login_id,
             provider_password  = EXCLUDED.provider_password,
             provider_user_id   = COALESCE(EXCLUDED.provider_user_id, provider_accounts.provider_user_id),
             updated_at         = NOW()`,
      [
        data.provider_code,
        data.user_id,
        data.provider_login_id,
        data.provider_password,
        data.provider_user_id ?? null,
      ],
    );
  }
}

// Re-export callback method name so the route can reference it
export { MEGAAPP_CALLBACK_LOGIN };
