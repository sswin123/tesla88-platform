import { createHash } from 'crypto';
import { YES918_ACTION, YES918_ERROR } from './constants';

// ── Response types ────────────────────────────────────────────────────────────

export interface Yes918BaseResponse {
  code:    number;
  msg:     string;
  success: boolean;
}

export interface RandomUserNameResponse extends Yes918BaseResponse {
  userName?: string;  // generated username for new player
  data?:     string;  // some versions use 'data' field
}

export interface AddUserResponse extends Yes918BaseResponse {
  type?: number;
}

export interface SetServerScoreResponse extends Yes918BaseResponse {
  acc?:   string;
  money?: string;  // player balance after transfer (as string, e.g. "4930.12")
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
  type?: number;  // 1=disabled, 2=enabled
}

// ── Client ────────────────────────────────────────────────────────────────────

export class Yes918ApiClient {
  private readonly baseUrl: string;
  private readonly authcode: string;
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
   * YES918 signature:
   *   sign = UPPERCASE(MD5(LOWERCASE(authcode + userName + unixTime + secretKey)))
   *
   * @param userName  The userName parameter for this specific API call
   * @param time      Unix timestamp in seconds (10 digits)
   */
  private sign(userName: string, time: number): string {
    const raw = (this.authcode + userName + time + this.secretKey).toLowerCase();
    return createHash('md5').update(raw).digest('hex').toUpperCase();
  }

  /** Current Unix timestamp in seconds (10 digits). */
  private now(): number {
    return Math.floor(Date.now() / 1000);
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

    let res: Response;
    try {
      res = await fetch(url, { method: 'GET', signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`YES918 HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as T;

    // code=-2 always means invalid signature — surface immediately
    if (data.code === YES918_ERROR.SIGN_ERROR) {
      throw new Error(`YES918 signature error (code=-2). Check authcode and secret_key.`);
    }

    return data;
  }

  // ── API Methods ───────────────────────────────────────────────────────────

  /**
   * Generate a random username on the YES918 platform.
   * userName = agent's username (used in signature).
   * Returns the generated player username.
   */
  async randomUserName(agentUsername: string): Promise<string> {
    const res = await this.get<RandomUserNameResponse>(
      { action: YES918_ACTION.RANDOM_USERNAME, userName: agentUsername },
      agentUsername,
    );

    if (!res.success && res.code !== YES918_ERROR.SUCCESS) {
      throw new Error(`YES918 RandomUserName failed: code=${res.code} msg=${res.msg}`);
    }

    // Response field may be 'userName' or 'data' depending on version
    const generated = res.userName ?? res.data ?? '';
    if (!generated) {
      throw new Error(`YES918 RandomUserName: no username in response. code=${res.code} msg=${res.msg}`);
    }
    return generated;
  }

  /**
   * Register a new player account on the YES918 platform.
   * Note: sign uses the PLAYER's userName (not agent's).
   */
  async addUser(opts: {
    userName:  string;
    password:  string;
    name?:     string;
    tel?:      string;
    memo?:     string;
  }): Promise<void> {
    const res = await this.get<AddUserResponse>(
      {
        action: YES918_ACTION.ADD_USER,
        userName: opts.userName,
        PassWd:   opts.password,
        Name:     opts.name  ?? 'N/A',
        Tel:      opts.tel   ?? 'N/A',
        Memo:     opts.memo  ?? 'N/A',
      },
      opts.userName,
    );

    if (res.code !== YES918_ERROR.SUCCESS && !res.success) {
      if (res.code === -1 && res.msg?.includes('exist')) {
        // Account already exists — not a fatal error for us
        return;
      }
      throw new Error(`YES918 addUser failed: code=${res.code} msg=${res.msg}`);
    }
  }

  /**
   * Transfer balance to/from a player's YES918 account.
   *   scoreNum > 0 → top-up (add balance)
   *   scoreNum < 0 → withdraw (deduct balance)
   *
   * Returns the player's balance after the transfer.
   */
  async setServerScore(opts: {
    userName:  string;
    scoreNum:  number;
    orderId:   string;
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

    if (res.code === YES918_ERROR.IN_GAME) {
      throw new Error(`YES918 setServerScore: player is in game, cannot deduct balance (code=-7)`);
    }
    if (res.code === YES918_ERROR.INSUFFICIENT) {
      throw new Error(`YES918 setServerScore: insufficient balance (code=-8)`);
    }
    if (res.code === YES918_ERROR.ORDER_ERROR) {
      throw new Error(`YES918 setServerScore: order ID error or duplicate (code=-1) orderId=${opts.orderId}`);
    }
    if (res.code !== YES918_ERROR.SUCCESS && !res.success) {
      throw new Error(`YES918 setServerScore failed: code=${res.code} msg=${res.msg}`);
    }

    const balance = parseFloat(String(res.money ?? '0'));
    return isNaN(balance) ? 0 : balance;
  }

  /**
   * Get player info including balance.
   * Returns null if account not found (code=-9).
   */
  async getUserInfo(userName: string): Promise<{ balance: number; status: number } | null> {
    const res = await this.get<GetUserInfoResponse>(
      { action: YES918_ACTION.GET_USER_INFO, userName },
      userName,
    );

    if (res.code === YES918_ERROR.NOT_FOUND) return null;

    if (res.code !== YES918_ERROR.SUCCESS && !res.success) {
      throw new Error(`YES918 getUserInfo failed: code=${res.code} msg=${res.msg}`);
    }

    const rawBalance = res.money ?? res.score ?? '0';
    const balance = parseFloat(String(rawBalance));
    return {
      balance: isNaN(balance) ? 0 : balance,
      status:  res.status ?? 0,
    };
  }

  /**
   * Kick (force logout) a player from the YES918 platform.
   * sign uses authcode + time + secretKey (no userName in sign for kick).
   * Actually docs say sign=md5((authcode + time + secretKey).tolower) for kick.
   */
  async kick(userName: string): Promise<void> {
    // From docs: sign=md5((authcode + time + secretKey).tolower) — no userName
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

    let res: Response;
    try {
      res = await fetch(url, { method: 'GET', signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) throw new Error(`YES918 kick HTTP ${res.status}`);
    // Ignore body — kick is best-effort
  }

  /**
   * Enable/disable a player account (toggle).
   * type=1 = disable, type=2 = enable (returned in response, not sent)
   */
  async disable(userName: string): Promise<void> {
    await this.get<DisableResponse>(
      { action: YES918_ACTION.DISABLE, userName },
      userName,
    );
    // Best-effort — ignore result
  }

  /**
   * AgentTotalReport for a date range — used for health check.
   * Returns true if the API responded successfully.
   */
  async agentTotalReport(agentUsername: string, sDate: string, eDate: string): Promise<boolean> {
    const res = await this.get<AgentTotalReportResponse>(
      { action: YES918_ACTION.AGENT_TOTAL_REPORT, userName: agentUsername, sDate, eDate },
      agentUsername,
    );
    // code=0 or success=true = API is healthy
    return res.code === YES918_ERROR.SUCCESS || res.success === true;
  }
}
