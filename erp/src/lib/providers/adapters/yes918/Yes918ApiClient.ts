import { createHash } from 'crypto';
import { YES918_ACTION, YES918_ERROR } from './constants';

// ── Response types ────────────────────────────────────────────────────────────

/**
 * YES918 API base response.
 *
 * Confirmed from production (action=RandomUserName):
 *   Success → { error: 0, ...actionFields }   e.g. {"error":0,"playerid":"01467743411"}
 *   Auth failure (gateway) → { code: 203, success: false, msg: "invalid key." }
 *
 * All fields are optional — shape varies by action and outcome.
 * Use isSuccess() / statusCode() helpers to normalise across both formats.
 */
export interface Yes918BaseResponse {
  /** Primary status field in real API responses: 0 = success, non-zero = error. */
  error?:   number;
  /** Legacy / gateway error field: appears in auth failures before reaching YES918. */
  code?:    number;
  success?: boolean;
  msg?:     string;
}

export interface RandomUserNameResponse extends Yes918BaseResponse {
  /** Confirmed YES918 field: generated player login ID (e.g. "01467743411"). */
  playerid?: string;
  /** Kept for compatibility with alternate YES918 API versions. */
  userName?: string;
  data?:     string;
}

export interface AddUserResponse extends Yes918BaseResponse {
  type?: number;
}

export interface SetServerScoreResponse extends Yes918BaseResponse {
  acc?:   string;
  /** Player balance after transfer (as string, e.g. "4930.12"). */
  money?: string;
  type?:  number;
}

export interface GetUserInfoResponse extends Yes918BaseResponse {
  userName?:   string;
  money?:      string | number;
  score?:      string | number;
  status?:     number;
  type?:       number;
}

export interface AgentTotalReportResponse extends Yes918BaseResponse {
  data?: unknown;
}

export interface DisableResponse extends Yes918BaseResponse {
  type?: number;
}

// ── Client ────────────────────────────────────────────────────────────────────

export class Yes918ApiClient {
  private readonly baseUrl:   string;
  private readonly authcode:  string;
  private readonly secretKey: string;
  private readonly timeoutMs: number;

  constructor(opts: {
    baseUrl:    string;
    authcode:   string;
    secretKey:  string;
    timeoutMs?: number;
  }) {
    this.baseUrl   = opts.baseUrl.replace(/\/$/, '');
    this.authcode  = opts.authcode;
    this.secretKey = opts.secretKey;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
  }

  // ── Signature ─────────────────────────────────────────────────────────────

  /**
   * sign = UPPERCASE(MD5(LOWERCASE(authcode + userName + unixTime + secretKey)))
   */
  private sign(userName: string, time: number): string {
    const raw = (this.authcode + userName + time + this.secretKey).toLowerCase();
    return createHash('md5').update(raw).digest('hex').toUpperCase();
  }

  private now(): number {
    return Math.floor(Date.now() / 1000);
  }

  // ── Response helpers ──────────────────────────────────────────────────────

  /**
   * Normalise status across both response formats:
   *   Real API  → r.error  (0 = success)
   *   Gateway   → r.code   (0 = success) or r.success (true = success)
   */
  private isSuccess(r: Yes918BaseResponse): boolean {
    if (r.error   !== undefined) return r.error   === YES918_ERROR.SUCCESS;
    if (r.code    !== undefined) return r.code    === YES918_ERROR.SUCCESS;
    if (r.success !== undefined) return r.success === true;
    return false;
  }

  /** Returns the numeric status code whichever field carries it. */
  private statusCode(r: Yes918BaseResponse): number | undefined {
    return r.error ?? r.code;
  }

  // ── HTTP GET ──────────────────────────────────────────────────────────────

  private async get<T extends Yes918BaseResponse>(
    params: Record<string, string | number>,
    userName: string,
  ): Promise<T> {
    const time = this.now();
    const sign = this.sign(userName, time);

    const qs = new URLSearchParams({
      ...Object.fromEntries(
        Object.entries(params).map(([k, v]) => [k, String(v)]),
      ),
      authcode: this.authcode,
      time:     String(time),
      sign,
    });

    const url = `${this.baseUrl}?${qs.toString()}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let httpRes: Response;
    try {
      httpRes = await fetch(url, { method: 'GET', signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    // Read body as text first — preserves raw content for error messages
    const rawBody = await httpRes.text().catch(() => '');

    if (!httpRes.ok) {
      throw new Error(`YES918 HTTP ${httpRes.status} action=${String(params['action'])}: ${rawBody.slice(0, 200)}`);
    }

    let data: T;
    try {
      data = JSON.parse(rawBody) as T;
    } catch (e) {
      throw new Error(
        `YES918 JSON parse error action=${String(params['action'])}: ${e instanceof Error ? e.message : String(e)}. Body: ${rawBody.slice(0, 200)}`,
      );
    }

    // Detect signature error — check both field names for robustness
    if (this.statusCode(data) === YES918_ERROR.SIGN_ERROR) {
      throw new Error(`YES918 signature error (code=-2). Check authcode and secret_key.`);
    }

    return data;
  }

  // ── API Methods ───────────────────────────────────────────────────────────

  /**
   * Generate a random player login ID on the YES918 platform.
   *
   * Confirmed response: {"error":0,"playerid":"01467743411"}
   * Primary field: playerid. Fallbacks: userName, data (alternate API versions).
   */
  async randomUserName(agentUsername: string): Promise<string> {
    const res = await this.get<RandomUserNameResponse>(
      { action: YES918_ACTION.RANDOM_USERNAME, userName: agentUsername },
      agentUsername,
    );

    if (!this.isSuccess(res)) {
      throw new Error(
        `YES918 RandomUserName failed: error=${res.error} code=${res.code} msg=${res.msg}`,
      );
    }

    const generated = res.playerid ?? res.userName ?? res.data ?? '';
    if (!generated) {
      throw new Error(
        `YES918 RandomUserName: no player ID in response. error=${res.error} code=${res.code}`,
      );
    }
    return generated;
  }

  /**
   * Register a new player account on the YES918 platform.
   * sign uses the PLAYER's userName (not agent's).
   */
  async addUser(opts: {
    userName: string;
    password: string;
    name?:    string;
    tel?:     string;
    memo?:    string;
  }): Promise<void> {
    const res = await this.get<AddUserResponse>(
      {
        action:   YES918_ACTION.ADD_USER,
        userName: opts.userName,
        PassWd:   opts.password,
        Name:     opts.name ?? 'N/A',
        Tel:      opts.tel  ?? 'N/A',
        Memo:     opts.memo ?? 'N/A',
      },
      opts.userName,
    );

    if (!this.isSuccess(res)) {
      // Account already exists on YES918 — not fatal, continue with existing credentials
      if (this.statusCode(res) === YES918_ERROR.ORDER_ERROR && res.msg?.includes('exist')) return;
      throw new Error(`YES918 addUser failed: error=${res.error} code=${res.code} msg=${res.msg}`);
    }
  }

  /**
   * Transfer balance to/from a player's YES918 account.
   *   scoreNum > 0 → top-up
   *   scoreNum < 0 → withdraw
   *
   * Returns player balance after transfer.
   */
  async setServerScore(opts: {
    userName: string;
    scoreNum: number;
    orderId:  string;
  }): Promise<number> {
    const res = await this.get<SetServerScoreResponse>(
      {
        action:   YES918_ACTION.SET_SERVER_SCORE,
        userName: opts.userName,
        scoreNum: opts.scoreNum,
        orderid:  opts.orderId,
      },
      opts.userName,
    );

    const sc = this.statusCode(res);
    if (sc === YES918_ERROR.IN_GAME)      throw new Error(`YES918 setServerScore: player is in game (error=-7)`);
    if (sc === YES918_ERROR.INSUFFICIENT) throw new Error(`YES918 setServerScore: insufficient balance (error=-8)`);
    if (sc === YES918_ERROR.ORDER_ERROR)  throw new Error(`YES918 setServerScore: order ID error or duplicate (error=-1) orderId=${opts.orderId}`);
    if (!this.isSuccess(res))             throw new Error(`YES918 setServerScore failed: error=${res.error} code=${res.code} msg=${res.msg}`);

    const balance = parseFloat(String(res.money ?? '0'));
    return isNaN(balance) ? 0 : balance;
  }

  /**
   * Get player info including balance.
   * Returns null if account not found.
   */
  async getUserInfo(userName: string): Promise<{ balance: number; status: number } | null> {
    const res = await this.get<GetUserInfoResponse>(
      { action: YES918_ACTION.GET_USER_INFO, userName },
      userName,
    );

    if (this.statusCode(res) === YES918_ERROR.NOT_FOUND) return null;
    if (!this.isSuccess(res)) {
      throw new Error(`YES918 getUserInfo failed: error=${res.error} code=${res.code} msg=${res.msg}`);
    }

    const rawBalance = res.money ?? res.score ?? '0';
    const balance    = parseFloat(String(rawBalance));
    return {
      balance: isNaN(balance) ? 0 : balance,
      status:  res.status ?? 0,
    };
  }

  /**
   * Kick (force logout) a player.
   * sign formula for kick: UPPERCASE(MD5(LOWERCASE(authcode + time + secretKey))) — no userName.
   */
  async kick(userName: string): Promise<void> {
    const time = this.now();
    const raw  = (this.authcode + time + this.secretKey).toLowerCase();
    const sign = createHash('md5').update(raw).digest('hex').toUpperCase();

    const qs = new URLSearchParams({
      action:   YES918_ACTION.KICK,
      userName,
      authcode: this.authcode,
      time:     String(time),
      sign,
    });

    const url = `${this.baseUrl}?${qs.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let httpRes: Response;
    try {
      httpRes = await fetch(url, { method: 'GET', signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (!httpRes.ok) throw new Error(`YES918 kick HTTP ${httpRes.status}`);
    // kick is best-effort — ignore body
  }

  /**
   * Enable/disable a player account (toggle).
   */
  async disable(userName: string): Promise<void> {
    await this.get<DisableResponse>(
      { action: YES918_ACTION.DISABLE, userName },
      userName,
    );
    // best-effort — ignore result
  }

  /**
   * AgentTotalReport for a date range — used for health check.
   * Returns true if the API responded with a success status.
   */
  async agentTotalReport(agentUsername: string, sDate: string, eDate: string): Promise<boolean> {
    const res = await this.get<AgentTotalReportResponse>(
      { action: YES918_ACTION.AGENT_TOTAL_REPORT, userName: agentUsername, sDate, eDate },
      agentUsername,
    );
    return this.isSuccess(res);
  }
}
