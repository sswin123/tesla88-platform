import type { IGameProvider } from '../../interfaces/IGameProvider';
import type {
  CreatePlayerParams,
  CreatePlayerResult,
  GameListParams,
  LoginTokenParams,
  TopUpParams,
  TopUpResult,
  UpdatePlayerParams,
  WithdrawParams,
  WithdrawResult,
} from '../../interfaces/IGameProvider';
import type { ProviderCapability } from '../../types/capability.types';
import type { GameListResult, GameSyncResult, LaunchParams, LaunchResult } from '../../types/game.types';
import type { HealthCheckResult } from '../../types/health.types';

/**
 * Base Provider Adapter — abstract base class for all concrete adapters.
 *
 * Provides:
 *  - Default stub implementations for optional interface methods that throw
 *    a NotSupportedError so the caller knows the adapter doesn't support
 *    the feature rather than silently doing nothing.
 *  - Common utility methods shared across adapters (HTTP request helper,
 *    latency measurement, error normalization).
 *
 * Concrete adapters (e.g. Kiss918Adapter) MUST override:
 *  - code, name, walletType
 *  - getCapabilities()
 *  - createPlayer(), updatePlayer(), getPlayerID(), logout()
 *  - getLoginToken(), getLobbyURL(), getGameURL(), launch()
 *  - parseXxx() and formatXxx() for every callback type they support
 *  - healthCheck()
 *  - validateCallbackToken()
 *
 * Optional overrides (only if provider supports them):
 *  - getGameList(), syncGames()
 *  - topUp(), withdraw(), getBalance()
 *  - getPlaySessions(), getFailedTransactions(), etc.
 */
export abstract class BaseProviderAdapter implements IGameProvider {
  abstract readonly code: string;
  abstract readonly name: string;
  abstract readonly walletType: 'SEAMLESS' | 'TRANSFER';

  abstract getCapabilities(): ProviderCapability[];
  abstract createPlayer(params: CreatePlayerParams): Promise<CreatePlayerResult>;
  abstract updatePlayer(params: UpdatePlayerParams): Promise<void>;
  abstract getPlayerID(accountID: string): Promise<string>;
  abstract logout(providerPlayerID: string, currency: string): Promise<void>;
  abstract getLoginToken(params: LoginTokenParams): Promise<string>;
  abstract getLobbyURL(token: string, language: number, lobbyReturnUrl: string): string;
  abstract getGameURL(token: string, gameCode: string, language: number, lobbyReturnUrl: string): string;
  abstract launch(params: LaunchParams): Promise<LaunchResult>;
  abstract healthCheck(): Promise<HealthCheckResult>;
  abstract validateCallbackToken(token: string): boolean;

  // ── Parse methods (required — adapters must translate provider payload) ────

  abstract parseAuthenticateRequest(body: Record<string, unknown>): ReturnType<IGameProvider['parseAuthenticateRequest']>;
  abstract parseGetBalanceRequest(body: Record<string, unknown>): ReturnType<IGameProvider['parseGetBalanceRequest']>;
  abstract parseBetRequest(body: Record<string, unknown>): ReturnType<IGameProvider['parseBetRequest']>;
  abstract parseBetResultRequest(body: Record<string, unknown>): ReturnType<IGameProvider['parseBetResultRequest']>;
  abstract parseRefundRequest(body: Record<string, unknown>): ReturnType<IGameProvider['parseRefundRequest']>;

  // ── Format methods (required) ─────────────────────────────────────────────

  abstract formatAuthenticateResponse(res: Parameters<IGameProvider['formatAuthenticateResponse']>[0]): Record<string, unknown>;
  abstract formatGetBalanceResponse(res: Parameters<IGameProvider['formatGetBalanceResponse']>[0]): Record<string, unknown>;
  abstract formatBetResponse(res: Parameters<IGameProvider['formatBetResponse']>[0]): Record<string, unknown>;
  abstract formatBetResultResponse(res: Parameters<IGameProvider['formatBetResultResponse']>[0]): Record<string, unknown>;
  abstract formatRefundResponse(res: Parameters<IGameProvider['formatRefundResponse']>[0]): Record<string, unknown>;

  // ── Optional: Game catalog (stub — throws if not overridden) ──────────────

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getGameList(_params?: GameListParams): Promise<GameListResult> {
    throw new NotSupportedError(this.code, 'getGameList');
  }

  async syncGames(): Promise<GameSyncResult> {
    throw new NotSupportedError(this.code, 'syncGames');
  }

  // ── Optional: Transfer Wallet (stub) ──────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async topUp(_params: TopUpParams): Promise<TopUpResult> {
    throw new NotSupportedError(this.code, 'topUp');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async withdraw(_params: WithdrawParams): Promise<WithdrawResult> {
    throw new NotSupportedError(this.code, 'withdraw');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getBalance(_providerPlayerID: string, _currency: string): Promise<number> {
    throw new NotSupportedError(this.code, 'getBalance');
  }

  // ── Common Utilities ───────────────────────────────────────────────────────

  /**
   * Perform an HTTP request to the provider API with timing.
   * Returns the parsed JSON response body and the latency in milliseconds.
   */
  protected async apiRequest<T = Record<string, unknown>>(
    url: string,
    options: RequestInit,
  ): Promise<{ data: T; latencyMs: number }> {
    const start = Date.now();
    const response = await fetch(url, options);
    const latencyMs = Date.now() - start;

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new ProviderApiError(
        this.code,
        response.status,
        `HTTP ${response.status}: ${text.slice(0, 200)}`,
      );
    }

    const data = (await response.json()) as T;
    return { data, latencyMs };
  }

  /**
   * Build a HealthCheckResult representing a successful ping.
   */
  protected healthOk(latencyMs: number): HealthCheckResult {
    return {
      provider: this.code,
      status: 'HEALTHY',
      latency_ms: latencyMs,
      error_message: null,
      checked_at: new Date().toISOString(),
    };
  }

  /**
   * Build a HealthCheckResult representing a failed ping.
   */
  protected healthDown(error: string, latencyMs?: number): HealthCheckResult {
    return {
      provider: this.code,
      status: 'DOWN',
      latency_ms: latencyMs ?? null,
      error_message: error,
      checked_at: new Date().toISOString(),
    };
  }

  /**
   * Safely extract a string from an unknown field, returning defaultVal if absent.
   */
  protected str(obj: Record<string, unknown>, key: string, defaultVal = ''): string {
    const v = obj[key];
    return v != null ? String(v) : defaultVal;
  }

  /**
   * Safely extract a number from an unknown field, returning defaultVal if absent.
   */
  protected num(obj: Record<string, unknown>, key: string, defaultVal = 0): number {
    const v = obj[key];
    if (v == null) return defaultVal;
    const n = Number(v);
    return isNaN(n) ? defaultVal : n;
  }
}

// ── Error Classes ──────────────────────────────────────────────────────────────

export class NotSupportedError extends Error {
  readonly name = 'NotSupportedError';
  constructor(providerCode: string, method: string) {
    super(`Provider "${providerCode}" does not support ${method}(). Check capabilities before calling.`);
  }
}

export class ProviderApiError extends Error {
  readonly name = 'ProviderApiError';
  constructor(
    public readonly providerCode: string,
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export class ProviderError extends Error {
  readonly name = 'ProviderError';
  constructor(
    public readonly providerCode: string,
    public readonly errorCode: number,
    message: string,
  ) {
    super(message);
  }
}
