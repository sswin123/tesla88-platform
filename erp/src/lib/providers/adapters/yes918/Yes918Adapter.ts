import { randomBytes } from 'crypto';
import { BaseProviderAdapter, NotSupportedError, ProviderError } from '../base/BaseProviderAdapter';
import { PROVIDER_CAPABILITY } from '../../types/capability.types';
import { YES918_CODE, YES918_NAME } from './constants';
import { Yes918ApiClient } from './Yes918ApiClient';
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
  CreatePlayerParams, CreatePlayerResult,
  UpdatePlayerParams, LoginTokenParams,
  TopUpParams, TopUpResult,
  WithdrawParams, WithdrawResult,
} from '../../interfaces/IGameProvider';

// ── Credential / Config shapes ────────────────────────────────────────────────

export interface Yes918Credentials {
  /** AuthCode from YES918 API settings page. */
  authcode:   string;
  /** SecretKey from YES918 API settings page. */
  secret_key: string;
}

export interface Yes918Config {
  /** API base URL, default: https://api.yes918.com/ashx */
  api_base_url:    string;
  /** Agent's username on YES918 platform (used for RandomUserName). */
  agent_username:  string;
  /** Request timeout in ms (default 15000). */
  timeout_ms?:     number;
  /** Password length for auto-generated player passwords (default 10). */
  password_length?: number;
  /** Android APK download URL — supplied by YES918 official. */
  download_url_android?: string;
  /** iOS App Store / distribution URL — supplied by YES918 official. */
  download_url_ios?: string;
}

// ── ProviderAccountRow shape (matches DB table) ───────────────────────────────

interface ProviderAccountRow {
  id:                number;
  provider_code:     string;
  user_id:           number;
  provider_login_id: string;   // YES918 player username
  provider_password: string;   // YES918 player password
  provider_user_id:  number | null;
  extra:             Record<string, unknown>;
  created_at:        string;
  updated_at:        string;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class Yes918Adapter extends BaseProviderAdapter {
  readonly code       = YES918_CODE;
  readonly name       = YES918_NAME;
  readonly walletType = 'TRANSFER' as const;

  private readonly api: Yes918ApiClient;

  constructor(
    private readonly creds:  Yes918Credentials,
    private readonly cfg:    Yes918Config,
    _wallet:                 MasterWalletEngine,
    _eventLogger:            EventLogger,
    _providerRepo:           IProviderRepository,
  ) {
    super();
    this.api = new Yes918ApiClient({
      baseUrl:   cfg.api_base_url || 'https://api.yes918.com/ashx',
      authcode:  creds.authcode,
      secretKey: creds.secret_key,
      timeoutMs: cfg.timeout_ms,
    });
  }

  // ── Capabilities ──────────────────────────────────────────────────────────

  getCapabilities(): ProviderCapability[] {
    return [PROVIDER_CAPABILITY.TRANSFER_WALLET, PROVIDER_CAPABILITY.LOBBY];
  }

  // ── Player Lifecycle ──────────────────────────────────────────────────────

  /**
   * Create a YES918 player account and persist to provider_accounts.
   * Flow: RandomUserName → addUser → upsert DB row.
   */
  async createPlayer(params: CreatePlayerParams): Promise<CreatePlayerResult> {
    const internalUserId = this.extractUserId(params.account_id);
    if (internalUserId == null) {
      throw new ProviderError(this.code, 400, `Cannot extract user_id from account_id="${params.account_id}"`);
    }

    const yes918Username = await this.api.randomUserName(this.cfg.agent_username);
    const password       = this.generatePassword();

    await this.api.addUser({ userName: yes918Username, password });
    await this.upsertProviderAccount(internalUserId, yes918Username, password);

    return { provider_player_id: yes918Username, account_id: params.account_id };
  }

  async updatePlayer(_params: UpdatePlayerParams): Promise<void> {
    // YES918 editUser changes Name/Tel/Memo/password — not required at this stage.
  }

  async getPlayerID(accountID: string): Promise<string> {
    const userId = this.extractUserId(accountID);
    if (userId == null) throw new ProviderError(this.code, 400, `Cannot extract user_id from "${accountID}"`);

    const row = await this.findProviderAccount(userId);
    if (!row) throw new ProviderError(this.code, 404, 'YES918 provider account not found. Register player first.');
    return row.provider_login_id;
  }

  async logout(providerPlayerID: string, _currency: string): Promise<void> {
    await this.api.kick(providerPlayerID).catch(() => {
      // kick is best-effort — ignore errors
    });
  }

  // ── Game Launch ───────────────────────────────────────────────────────────

  async getLoginToken(params: LoginTokenParams): Promise<string> {
    return params.provider_player_id;
  }

  getLobbyURL(_token: string, _language: number, _lobbyReturnUrl: string): string {
    // YES918 is a native app — no web lobby URL
    return '';
  }

  getGameURL(_token: string, _gameCode: string, _language: number, _lobbyReturnUrl: string): string {
    return '';
  }

  /**
   * Launch: look up (or create) the player's YES918 credentials and return
   * them in session_token so the website can display login details.
   */
  async launch(params: LaunchParams): Promise<LaunchResult> {
    const userId = params.user_id;

    let row = await this.findProviderAccount(userId);

    if (!row) {
      // Auto-create player on first launch
      const yes918Username = await this.api.randomUserName(this.cfg.agent_username);
      const password       = this.generatePassword();

      await this.api.addUser({ userName: yes918Username, password });
      await this.upsertProviderAccount(userId, yes918Username, password);

      // Construct row in memory — no need to re-query
      const now = new Date().toISOString();
      row = {
        id: 0, provider_code: YES918_CODE, user_id: userId,
        provider_login_id: yes918Username, provider_password: password,
        provider_user_id: null, extra: {}, created_at: now, updated_at: now,
      };
    }

    return {
      launch_url:        '',
      provider_login_id: row.provider_login_id,
      session_token: JSON.stringify({
        provider_code:        YES918_CODE,
        login_id:             row.provider_login_id,
        password:             row.provider_password,
        download_url_android: this.cfg.download_url_android ?? null,
        download_url_ios:     this.cfg.download_url_ios     ?? null,
        apk_name:             '918KISS',
      }),
      session_id: 0,
    };
  }

  // ── Transfer Wallet ───────────────────────────────────────────────────────

  async topUp(params: TopUpParams): Promise<TopUpResult> {
    if (params.amount <= 0) {
      throw new ProviderError(this.code, 400, 'topUp amount must be positive');
    }
    const balance = await this.api.setServerScore({
      userName:  params.provider_player_id,
      scoreNum:  params.amount,
      orderId:   params.reference_id,
    });
    return { order_id: params.reference_id, balance };
  }

  async withdraw(params: WithdrawParams): Promise<WithdrawResult> {
    if (params.amount <= 0) {
      throw new ProviderError(this.code, 400, 'withdraw amount must be positive');
    }
    const balance = await this.api.setServerScore({
      userName:  params.provider_player_id,
      scoreNum:  -params.amount,   // negative = deduct
      orderId:   params.reference_id,
    });
    return { order_id: params.reference_id, balance };
  }

  async getBalance(providerPlayerID: string, _currency: string): Promise<number> {
    try {
      const info = await this.api.getUserInfo(providerPlayerID);
      return info?.balance ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Recover all funds from the player's YES918 account back to the operator.
   * Called by games/launch/route.ts before each Transfer In via duck-typed check:
   *   typeof adapter.autoWithdrawAll === 'function'
   *
   * Flow: getUserInfo → if balance > 0, setServerScore(negative) → return amount.
   * Returns 0 if the account has no balance or does not exist.
   * Re-throws on error=-7 (player in game) and all other unexpected errors.
   */
  async autoWithdrawAll(loginId: string): Promise<number> {
    const info = await this.api.getUserInfo(loginId);
    if (!info || info.balance <= 0) return 0;

    const balance = info.balance;
    const orderId = `YES918WD-AUTO-${loginId}-${Date.now()}`;

    try {
      await this.api.setServerScore({ userName: loginId, scoreNum: -balance, orderId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // error=-8: "insufficient balance" — race condition, balance already gone
      if (msg.includes('insufficient balance')) return 0;
      throw err;
    }

    return balance;
  }

  // ── Health Check ──────────────────────────────────────────────────────────

  async healthCheck(): Promise<HealthCheckResult> {
    if (!this.creds.authcode || !this.creds.secret_key || !this.cfg.agent_username) {
      return this.healthDown(
        'YES918 credentials incomplete (authcode / secret_key / agent_username required)',
      );
    }

    const start = Date.now();
    try {
      // Use today's date range for AgentTotalReport — verifies:
      //   1. API URL reachable
      //   2. authcode recognised
      //   3. signature (secretKey) valid
      const today = new Date().toISOString().slice(0, 10);
      const ok = await this.api.agentTotalReport(this.cfg.agent_username, today, today);
      if (!ok) {
        return this.healthDown('YES918 AgentTotalReport returned failure', Date.now() - start);
      }
      return this.healthOk(Date.now() - start);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return this.healthDown(`YES918 API: ${msg}`, Date.now() - start);
    }
  }

  // ── Callback Token ────────────────────────────────────────────────────────

  validateCallbackToken(_token: string): boolean {
    // YES918 is a transfer-wallet provider with no inbound callbacks.
    return true;
  }

  // ── Game Catalog (not supported) ──────────────────────────────────────────

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

  // ── Seamless stubs (Transfer Wallet — no seamless callbacks) ──────────────

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

  private generatePassword(): string {
    const len = Math.max(6, Math.min(17, this.cfg.password_length ?? 10));
    // Uppercase + lowercase + digits only (safe for YES918 PassWd ≤17)
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    return Array.from(randomBytes(len))
      .map(b => charset[b % charset.length])
      .join('');
  }

  private extractUserId(accountId: string): number | null {
    const match = /^u(\d+)(?:@|$)/.exec(accountId);
    return match ? Number(match[1]) : null;
  }

  private async findProviderAccount(userId: number): Promise<ProviderAccountRow | null> {
    const { default: pool } = await import('@/lib/db');
    const { rows } = await pool.query<ProviderAccountRow>(
      `SELECT * FROM provider_accounts WHERE provider_code = $1 AND user_id = $2 LIMIT 1`,
      [YES918_CODE, userId],
    );
    return rows[0] ?? null;
  }

  private async upsertProviderAccount(
    userId:   number,
    username: string,
    password: string,
  ): Promise<void> {
    const { default: pool } = await import('@/lib/db');
    await pool.query(
      `INSERT INTO provider_accounts
         (provider_code, user_id, provider_login_id, provider_password)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (provider_code, user_id) DO UPDATE
         SET provider_login_id = EXCLUDED.provider_login_id,
             provider_password = EXCLUDED.provider_password,
             updated_at        = NOW()`,
      [YES918_CODE, userId, username, password],
    );
  }
}
