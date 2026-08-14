import type { Pussy888Credentials, Pussy888Config } from './types';
import { Pussy888Signer } from './Pussy888Signer';

// ── Response envelope ─────────────────────────────────────────────────────────

interface Pussy888Response<T> {
  isSuccess: boolean;
  errCode:   number;
  msg:       string;
  data:      T | null;
}

// ── Data shapes ───────────────────────────────────────────────────────────────

export interface UserInfoData {
  UserName:   string;
  ScoreNum:   number;
  // other fields exist but only balance is needed
  [key: string]: unknown;
}

export interface SetScoreData {
  UserName: string;
  ScoreNum: number;
  [key: string]: unknown;
}

// Response shape for /ashx/account/account.ashx (addUser, editUser, disable, …)
// Distinct from the getUserInfo/setScore envelope which uses isSuccess/errCode.
interface AddUserResponse {
  code:    number;   // 0=success, -1=already exists, -2=bad sign, -99=illegal
  msg:     string;
  success: boolean;
  type?:   number;
}

// ── Client ────────────────────────────────────────────────────────────────────

export class Pussy888ApiClient {
  private readonly signer: Pussy888Signer;
  private readonly baseUrl:  string;
  private readonly baseUrl2: string;

  constructor(
    private readonly creds: Pussy888Credentials,
    private readonly cfg:   Pussy888Config,
  ) {
    this.signer   = new Pussy888Signer(creds.authcode, creds.secret_key);
    this.baseUrl  = cfg.api_base_url.replace(/\/$/, '');
    this.baseUrl2 = cfg.api_base_url2.replace(/\/$/, '');

    console.log('[PUSSY888 API CLIENT] constructed', JSON.stringify({
      agent:             creds.agent,
      authcode_len:      creds.authcode.length,
      secret_key_masked: this.signer.maskSecret(),
      api_base_url:      cfg.api_base_url,
      api_base_url2:     cfg.api_base_url2,
    }));
  }

  // ── Member management ─────────────────────────────────────────────────────

  /**
   * Register a new player on Pussy888.
   * Official endpoint: AipUrl1/ashx/account/account.ashx?action=addUser
   * Caller must supply the password (resolved by the adapter via _resolvePassword()).
   * Throws with "already exists" in the message when code === -1 (non-fatal duplicate).
   */
  async addUser(userName: string, nickname: string, password: string): Promise<void> {
    const time    = this.signer.timestamp();
    const formula = this.cfg.sign_test_formula ?? 'A';

    const maskMid = (s: string, show = 4) =>
      s.length <= show * 2 ? s : `${s.slice(0, show)}${'*'.repeat(s.length - show * 2)}${s.slice(-show)}`;
    const ac = maskMid(this.creds.authcode);

    let sign: string;
    let formulaDesc: string;
    let sourcePreview: string;

    switch (formula) {
      case 'B':
        sign          = this.signer.signB(userName, password, time);
        formulaDesc   = 'MD5((authcode+userName+PassWd+time+secretKey).toLowerCase())';
        sourcePreview = `(${ac}+${userName}+[PassWd]+${time}+[secretKey]).toLowerCase()`;
        break;
      case 'C':
        sign          = this.signer.signC(this.creds.agent, userName, time);
        formulaDesc   = 'MD5((authcode+agent+userName+time+secretKey).toLowerCase())';
        sourcePreview = `(${ac}+${this.creds.agent}+${userName}+${time}+[secretKey]).toLowerCase()`;
        break;
      case 'D':
        sign          = this.signer.signD(this.creds.agent, userName, password, time);
        formulaDesc   = 'MD5((authcode+agent+userName+PassWd+time+secretKey).toLowerCase())';
        sourcePreview = `(${ac}+${this.creds.agent}+${userName}+[PassWd]+${time}+[secretKey]).toLowerCase()`;
        break;
      default: // 'A'
        sign          = this.signer.sign(userName, time);
        formulaDesc   = 'MD5((authcode+userName+time+secretKey).toLowerCase())';
        sourcePreview = `(${ac}+${userName}+${time}+[secretKey]).toLowerCase()`;
    }

    const params = new URLSearchParams({
      action:   'addUser',
      agent:    this.creds.agent,
      PassWd:   password,
      userName,
      Name:     nickname || userName,
      Tel:      'N/A',
      Memo:     'N/A',
      UserType: '1',
      time,
      authcode: this.creds.authcode,
      sign,
    });

    console.log('[PUSSY888 addUser] SIGN DEBUG:', JSON.stringify({
      formula,
      formulaDesc,
      sourcePreview,
      sign,
      agent:    this.creds.agent,
      userName,
      PassWd:   password.length > 0 ? `${password.slice(0, 2)}${'*'.repeat(Math.max(0, password.length - 2))}` : '(EMPTY)',
      time,
      authcode: ac,
    }));

    const res = await this.fetchAccountAshxWithFallback(params);

    if (res.code === -1) {
      throw new Error(`Pussy888 addUser: player already exists (code=-1): ${userName}`);
    }
    if (!res.success || res.code !== 0) {
      throw new Error(`Pussy888 addUser error code=${res.code}: ${res.msg}`);
    }

    console.log(`[PUSSY888 API] ✓ addUser ${userName} registered successfully`);
  }

  private async fetchAccountAshxWithFallback(params: URLSearchParams): Promise<AddUserResponse> {
    const tryFetch = async (base: string): Promise<AddUserResponse> => {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.cfg.timeout_ms);
      const start = Date.now();
      try {
        const res = await fetch(
          `${base}/ashx/account/account.ashx?${params.toString()}`,
          { method: 'GET', signal: ctrl.signal },
        );
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status} from ${base}`);
        const data = (await res.json()) as AddUserResponse;
        console.log(`[PUSSY888 API] ← addUser ${base} (${Date.now() - start}ms) code=${data.code} success=${data.success}`);
        return data;
      } catch (err) {
        clearTimeout(timer);
        throw err;
      }
    };

    try {
      return await tryFetch(this.baseUrl);
    } catch (primaryErr) {
      if (!this.baseUrl2) throw primaryErr;
      console.warn(`[PUSSY888 API] addUser primary failed, trying fallback: ${primaryErr instanceof Error ? primaryErr.message : primaryErr}`);
      return await tryFetch(this.baseUrl2);
    }
  }

  /**
   * Get player balance.
   * Endpoint: /getUserInfo.ashx → data.ScoreNum
   */
  async getUserBalance(userName: string): Promise<number> {
    const data = await this.get<UserInfoData>('getUserInfo.ashx', { userName });
    return typeof data?.ScoreNum === 'number' ? data.ScoreNum : 0;
  }

  /**
   * Deposit funds: positive scoreNum adds balance.
   * Endpoint: /setScore.ashx with scoreNum=+{amount}
   * Returns player balance after the operation.
   */
  async deposit(userName: string, amount: number): Promise<number> {
    if (amount <= 0) throw new Error('Pussy888 deposit amount must be positive');
    // API requires explicit "+" sign prefix for deposits
    const scoreNum = `+${this.formatAmount(amount)}`;
    const data = await this.get<SetScoreData>('setScore.ashx', { userName, scoreNum });
    return typeof data?.ScoreNum === 'number' ? data.ScoreNum : 0;
  }

  /**
   * Withdraw funds: negative scoreNum subtracts balance.
   * Endpoint: /setScore.ashx with scoreNum=-{amount}
   * Returns player balance after the operation.
   */
  async withdraw(userName: string, amount: number): Promise<number> {
    if (amount <= 0) throw new Error('Pussy888 withdraw amount must be positive');
    const scoreNum = `-${this.formatAmount(amount)}`;
    const data = await this.get<SetScoreData>('setScore.ashx', { userName, scoreNum });
    return typeof data?.ScoreNum === 'number' ? data.ScoreNum : 0;
  }

  /**
   * Withdraw ALL balance from player account.
   * Gets current balance, then withdraws the full amount.
   * Returns the amount withdrawn.
   */
  async withdrawAll(userName: string): Promise<number> {
    const balance = await this.getUserBalance(userName);
    if (balance <= 0) return 0;
    await this.withdraw(userName, balance);
    return balance;
  }

  // ── HTTP core ─────────────────────────────────────────────────────────────

  private async get<T>(endpoint: string, extraParams: Record<string, string>): Promise<T | null> {
    const time = this.signer.timestamp();
    const userName = extraParams['userName'] ?? '';
    const sign = this.signer.sign(userName, time);

    const params = new URLSearchParams({
      authcode: this.creds.authcode,
      time,
      sign,
      ...extraParams,
    });

    if (this.cfg.debug) {
      console.log(`[PUSSY888 API] → ${endpoint}`, JSON.stringify({
        ...extraParams,
        time,
        sign: `${sign.slice(0, 6)}...`,
        authcode_len: this.creds.authcode.length,
        sign_formula: `MD5((authcode+userName+time+secretKey).toLowerCase())`,
      }));
    } else {
      console.log(`[PUSSY888 API] → ${endpoint}`, JSON.stringify({ ...extraParams, time }));
    }

    const result = await this.fetchWithFallback<T>(endpoint, params);
    return result;
  }

  private async fetchWithFallback<T>(endpoint: string, params: URLSearchParams): Promise<T | null> {
    // Only fall through to fallback on network/HTTP errors, NOT on API-level errors
    // (isSuccess=false). API errors from the primary URL are authoritative.
    let envelope: Pussy888Response<T>;
    try {
      envelope = await this.fetchRaw<T>(`${this.baseUrl}/${endpoint}`, params);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[PUSSY888 API] primary URL failed, trying fallback: ${msg}`);
      envelope = await this.fetchRaw<T>(`${this.baseUrl2}/${endpoint}`, params);
    }

    if (!envelope.isSuccess) {
      console.error(`[PUSSY888 API] ✗ errCode=${envelope.errCode} msg="${envelope.msg}"`);
      throw new Error(`Pussy888 API error ${envelope.errCode}: ${envelope.msg}`);
    }
    return envelope.data;
  }

  /** Performs the HTTP GET and parses JSON. Throws only on network or HTTP-status errors. */
  private async fetchRaw<T>(url: string, params: URLSearchParams): Promise<Pussy888Response<T>> {
    const fullUrl = `${url}?${params.toString()}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeout_ms);
    const start = Date.now();

    let res: Response;
    try {
      res = await fetch(fullUrl, {
        method: 'GET',
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const ms  = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Pussy888 HTTP request to ${url} failed after ${ms}ms: ${msg}`);
    }
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Pussy888 HTTP ${res.status} from ${url}: ${text.slice(0, 200)}`);
    }

    const envelope = (await res.json()) as Pussy888Response<T>;
    const ms = Date.now() - start;

    if (this.cfg.debug) {
      console.log(`[PUSSY888 API] ← RESPONSE (${ms}ms):`, JSON.stringify(envelope));
    } else {
      console.log(`[PUSSY888 API] ✓ ${url} OK (${ms}ms)`);
    }

    return envelope;
  }

  /** Format amount for API: whole numbers as integer string, fractional as 2 decimals. */
  private formatAmount(amount: number): string {
    const isWhole = Number.isInteger(amount) || Math.abs(amount % 1) < 1e-10;
    return isWhole ? String(Math.round(amount)) : amount.toFixed(2);
  }
}
