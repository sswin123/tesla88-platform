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

    // Diagnostic: log sent param NAMES only — never log authcode / sign / secretKey values
    const sentParamKeys = Object.keys(params).filter(k => !['authcode', 'sign', 'secretKey'].includes(k));
    console.log(`[YES918-DIAG] → action=${String(params['action'])} sentParams=[${sentParamKeys.join(',')}] time=${time}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let httpRes: Response;
    try {
      httpRes = await fetch(url, { method: 'GET', signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    const httpStatus  = httpRes.status;
    const contentType = httpRes.headers.get('content-type') ?? '(none)';

    // Read body as TEXT first so we can log it before parsing
    const rawBody    = await httpRes.text().catch(() => '');
    const bodyPreview = rawBody.slice(0, 2000);

    console.log(`[YES918-DIAG] ← HTTP ${httpStatus} | content-type: ${contentType} | body-length: ${rawBody.length}`);
    console.log(`[YES918-DIAG] ← raw-body: ${bodyPreview}`);

    if (!httpRes.ok) {
      throw new Error(`YES918 HTTP ${httpStatus}: ${bodyPreview.slice(0, 200)}`);
    }

    // Parse JSON from the already-consumed text body
    let data: T;
    try {
      const parsed: unknown = JSON.parse(rawBody);
      const parsedType = typeof parsed;
      console.log(`[YES918-DIAG] ← typeof parsed: ${parsedType}`);
      if (parsed !== null && parsedType === 'object' && !Array.isArray(parsed)) {
        console.log(`[YES918-DIAG] ← Object.keys: [${Object.keys(parsed as object).join(', ')}]`);
      } else if (parsedType === 'string') {
        console.log(`[YES918-DIAG] ← parsed is string value (length=${(parsed as string).length})`);
      } else if (parsedType === 'number') {
        console.log(`[YES918-DIAG] ← parsed is number: ${parsed}`);
      } else if (Array.isArray(parsed)) {
        console.log(`[YES918-DIAG] ← parsed is array (length=${(parsed as unknown[]).length})`);
      }
      data = parsed as T;
    } catch (e) {
      throw new Error(
        `YES918 JSON parse error for action=${String(params['action'])}: ${e instanceof Error ? e.message : String(e)}. Body: ${bodyPreview.slice(0, 200)}`,
      );
    }

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
    const raw = await this.get<RandomUserNameResponse>(
      { action: YES918_ACTION.RANDOM_USERNAME, userName: agentUsername },
      agentUsername,
    );

    // Diagnostic: log exact shape of the parsed response
    const rawType = typeof raw;
    console.log(`[YES918-DIAG] randomUserName parsed type: ${rawType}`);
    if (rawType === 'object' && raw !== null) {
      console.log(`[YES918-DIAG] randomUserName keys: [${Object.keys(raw).join(', ')}]`);
      console.log(`[YES918-DIAG] randomUserName .code=${raw.code} .success=${raw.success} .msg=${raw.msg} .userName=${raw.userName} .data=${raw.data}`);
    } else {
      // raw might be a plain string — YES918 may return the username directly
      console.log(`[YES918-DIAG] randomUserName raw value: ${String(raw).slice(0, 100)}`);
    }

    // Handle plain-string response: some YES918 versions return the username directly
    if (rawType === 'string') {
      const direct = (raw as unknown as string).trim();
      if (direct) {
        console.log(`[YES918-DIAG] randomUserName: treating plain-string response as username`);
        return direct;
      }
      throw new Error(`YES918 RandomUserName: plain-string response is empty.`);
    }

    if (!raw.success && raw.code !== YES918_ERROR.SUCCESS) {
      throw new Error(`YES918 RandomUserName failed: code=${raw.code} msg=${raw.msg}`);
    }

    // Response field may be 'userName' or 'data' depending on version
    const generated = raw.userName ?? raw.data ?? '';
    if (!generated) {
      throw new Error(`YES918 RandomUserName: no username in response. code=${raw.code} msg=${raw.msg}`);
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
