import { API_PATH, H5_PATH, ORDER_STATUS } from './constants';
import type { Kiss918CircuitBreaker } from './Kiss918CircuitBreaker';
import type { GameListItem } from '../../types/game.types';
import { GAME_TYPE } from '../../types/game.types';
import type { CheckOrderResult } from '../../interfaces/IGameProvider';

export interface ApiClientConfig {
  apiBaseUrl: string;
  /** Separate DataFeed base URL (stgapidf.asiah5.com).  Falls back to apiBaseUrl. */
  datafeedBaseUrl?: string;
  h5ApiDomain: string;
  apiToken: string;
  timeoutMs: number;
  debug: boolean;
}

// ── Provider response shapes ───────────────────────────────────────────────────

interface BaseResponse {
  statusCode: number;
  errMsg: string;
}

// /api/createplayer uses a different response envelope than /operator/v2/*
interface CreatePlayerRes {
  playerID: number;
  error?: string | number;
  description?: string;
  // Legacy format fallback
  statusCode?: number;
  errMsg?: string;
}
interface CheckPlayerRes  extends BaseResponse { playerID: number }
interface GetBalanceRes   extends BaseResponse { balance: number }
interface TopUpRes        extends BaseResponse { orderID: string; balance: number }
interface WithdrawRes     extends BaseResponse { orderID: string; balance: number }
interface GetTimepointRes extends BaseResponse { timePoint: number }
interface CheckOrderRes   extends BaseResponse { transStatus: number }
interface GameListRes     extends BaseResponse {
  gameList: Array<{ gameID: number; gameName: string; gameType: number; status: number }>;
}
interface PlaySessionsRes extends BaseResponse {
  records: Array<Record<string, unknown>>;
  nextTimePoint: number;
}
interface FailedTransactionsRes extends BaseResponse {
  records: Array<Record<string, unknown>>;
  nextTimePoint: number;
}

/**
 * Kiss918ApiClient — all outbound HTTP calls to the 918KISS Integration API
 * and H5 API, wrapped in the circuit breaker.
 *
 * Every method:
 *  1. Routes through `circuit.exec()` for fail-fast protection.
 *  2. Logs request/response when debug mode is on (token is masked).
 *  3. Throws on non-zero `statusCode` so the adapter can decide how to handle.
 */
export class Kiss918ApiClient {
  constructor(
    private readonly cfg: ApiClientConfig,
    private readonly circuit: Kiss918CircuitBreaker,
  ) {}

  // ── Player Operations ──────────────────────────────────────────────────────

  async createPlayer(
    accountID: string,
    nickName: string,
    currency: string,
    language = 2,
  ): Promise<{ playerID: number }> {
    const res = await this.post<CreatePlayerRes>(API_PATH.CREATE_PLAYER, {
      accountID, nickName, currency, language,
    });
    // /api/createplayer returns { error, description } instead of { statusCode, errMsg }
    const errCode = res.statusCode ?? Number(res.error ?? 0);
    if (errCode !== 0) {
      throw new Error(`918KISS CreatePlayer error ${res.error ?? res.statusCode}: ${res.description ?? res.errMsg}`);
    }
    return { playerID: res.playerID };
  }

  async updatePlayer(playerID: number, nickName: string): Promise<void> {
    const res = await this.post<BaseResponse>(API_PATH.UPDATE_PLAYER, { playerID, nickName });
    this.assertOk(res);
  }

  async checkPlayer(userName: string): Promise<{ playerID: number }> {
    const res = await this.post<CheckPlayerRes>(API_PATH.CHECK_PLAYER, { userName });
    this.assertOk(res);
    return { playerID: res.playerID };
  }

  async getBalance(playerID: number, currency: string): Promise<{ balance: number }> {
    const res = await this.get<GetBalanceRes>(API_PATH.GET_BALANCE, {
      playerID: String(playerID), currency,
    });
    this.assertOk(res);
    return { balance: res.balance };
  }

  async topUp(
    playerID: number,
    amount: number,
    currency: string,
    referenceID: string,
  ): Promise<{ orderID: string; balance: number }> {
    const res = await this.post<TopUpRes>(API_PATH.TOP_UP, {
      playerID, amount, currency, referenceID,
    });
    this.assertOk(res);
    return { orderID: res.orderID, balance: res.balance };
  }

  async withdraw(
    playerID: number,
    amount: number,
    currency: string,
    referenceID: string,
  ): Promise<{ orderID: string; balance: number }> {
    const res = await this.post<WithdrawRes>(API_PATH.WITHDRAW, {
      playerID, amount, currency, referenceID,
    });
    this.assertOk(res);
    return { orderID: res.orderID, balance: res.balance };
  }

  async logout(playerID: number, currency: string): Promise<void> {
    const res = await this.post<BaseResponse>(API_PATH.LOGOUT, { playerID, currency });
    this.assertOk(res);
  }

  // ── Data Operations ────────────────────────────────────────────────────────

  async getTimepoint(dateTime: string): Promise<{ timePoint: number }> {
    const res = await this.get<GetTimepointRes>(API_PATH.GET_TIMEPOINT, { dateTime });
    this.assertOk(res);
    return { timePoint: res.timePoint };
  }

  async checkOrder(playerID: number, orderID: string): Promise<CheckOrderResult> {
    const res = await this.get<CheckOrderRes>(API_PATH.CHECK_ORDER, {
      playerID: String(playerID), orderID,
    });
    this.assertOk(res);
    return {
      order_id: orderID,
      status: this.mapOrderStatus(res.transStatus),
      amount: 0,
      currency: 'MYR',
    };
  }

  async getPlaySessions(
    playerID: number,
    timePoint: number,
  ): Promise<{ records: Array<Record<string, unknown>>; nextTimePoint: number }> {
    // DataFeed uses a separate base URL — fall back to apiBaseUrl if not configured.
    const res = await this.datafeedGet<PlaySessionsRes>(API_PATH.PLAY_SESSIONS, {
      playerID: String(playerID), timePoint: String(timePoint),
    });
    this.assertOk(res);
    return { records: res.records ?? [], nextTimePoint: res.nextTimePoint ?? timePoint };
  }

  async getFailedTransactions(
    timePoint: number,
  ): Promise<{ records: Array<Record<string, unknown>>; nextTimePoint: number }> {
    const res = await this.datafeedGet<FailedTransactionsRes>(API_PATH.FAILED_TRANSACTIONS, {
      timePoint: String(timePoint),
    });
    this.assertOk(res);
    return { records: res.records ?? [], nextTimePoint: res.nextTimePoint ?? timePoint };
  }

  /** Fetch the game catalog from the H5 API. */
  async getGameList(): Promise<GameListItem[]> {
    const url = `${this.cfg.h5ApiDomain.replace(/\/$/, '')}${H5_PATH.GAME_LIST}`;
    const res = await this.circuit.exec<GameListRes>(async () => {
      const r = await this.fetchWithTimeout(url, {
        method: 'GET',
        headers: this.headers(),
      });
      return r.json() as Promise<GameListRes>;
    });
    this.assertOk(res);

    return (res.gameList ?? []).map((g) => ({
      game_code: String(g.gameID),
      name: g.gameName,
      game_type: this.mapGameType(g.gameType),
      is_active: g.status === 1,
      metadata: { kiss918_game_id: g.gameID, kiss918_game_type: g.gameType },
    }));
  }

  // ── Internal HTTP helpers ──────────────────────────────────────────────────

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const url = `${this.cfg.apiBaseUrl.replace(/\/$/, '')}${path}`;
    if (this.cfg.debug) {
      console.debug('[Kiss918ApiClient] POST', url, body);
    }
    const res = await this.circuit.exec<T>(() =>
      this.fetchWithTimeout(url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
      }).then((r) => r.json() as Promise<T>),
    );
    if (this.cfg.debug) {
      console.debug('[Kiss918ApiClient] ← POST', path, res);
    }
    return res;
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const qs  = new URLSearchParams(params).toString();
    const url = `${this.cfg.apiBaseUrl.replace(/\/$/, '')}${path}?${qs}`;
    if (this.cfg.debug) {
      console.debug('[Kiss918ApiClient] GET', url);
    }
    const res = await this.circuit.exec<T>(() =>
      this.fetchWithTimeout(url, {
        method: 'GET',
        headers: this.headers(),
      }).then((r) => r.json() as Promise<T>),
    );
    if (this.cfg.debug) {
      console.debug('[Kiss918ApiClient] ← GET', path, res);
    }
    return res;
  }

  /** GET against the DataFeed base URL (separate from Operations API). */
  private async datafeedGet<T>(path: string, params: Record<string, string>): Promise<T> {
    const base = (this.cfg.datafeedBaseUrl ?? this.cfg.apiBaseUrl).replace(/\/$/, '');
    const qs   = new URLSearchParams(params).toString();
    const url  = `${base}${path}?${qs}`;
    if (this.cfg.debug) {
      console.debug('[Kiss918ApiClient] DATAFEED GET', url);
    }
    const res = await this.circuit.exec<T>(() =>
      this.fetchWithTimeout(url, {
        method: 'GET',
        headers: this.headers(),
      }).then((r) => r.json() as Promise<T>),
    );
    if (this.cfg.debug) {
      console.debug('[Kiss918ApiClient] ← DATAFEED GET', path, res);
    }
    return res;
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'token': this.cfg.apiToken,
    };
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
    try {
      const r = await fetch(url, { ...init, signal: controller.signal });
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        throw new Error(`HTTP ${r.status}: ${text.slice(0, 200)}`);
      }
      return r;
    } finally {
      clearTimeout(timer);
    }
  }

  private assertOk(res: BaseResponse): void {
    if (res.statusCode !== 0) {
      throw new Error(
        `918KISS API error: statusCode=${res.statusCode} errMsg="${res.errMsg}"`,
      );
    }
  }

  private mapOrderStatus(
    transStatus: number,
  ): 'CONFIRMED' | 'UNCONFIRMED' | 'CANCELLED' | 'PENDING' {
    switch (transStatus) {
      case ORDER_STATUS.CONFIRMED:   return 'CONFIRMED';
      case ORDER_STATUS.CANCELLED:
      case ORDER_STATUS.REMOVED:     return 'CANCELLED';
      case ORDER_STATUS.PENDING:     return 'PENDING';
      default:                       return 'UNCONFIRMED';
    }
  }

  private mapGameType(t: number): typeof GAME_TYPE[keyof typeof GAME_TYPE] {
    switch (t) {
      case 1:  return GAME_TYPE.SLOT;
      case 2:  return GAME_TYPE.ARCADE;
      case 3:  return GAME_TYPE.TABLE;
      case 4:  return GAME_TYPE.FISHING;
      default: return GAME_TYPE.OTHER;
    }
  }
}
