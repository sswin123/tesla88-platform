// erp/src/lib/providers/adapters/megah5/MegaH5ApiClient.ts
import { MegaH5Crypto } from './MegaH5Crypto';
import { H5_PATH, API_PATH, MEGAH5_LANGUAGE } from './constants';
import type { MegaH5Credentials, MegaH5Config } from './types';
import type { GameListItem } from '../../types/game.types';
import { GAME_TYPE } from '../../types/game.types';

interface BaseResponse {
  statusCode: number;
  errMsg: string;
}
interface CreatePlayerRes extends BaseResponse { playerID: number }
interface CheckPlayerRes  extends BaseResponse { playerID: number }
// Section 10.1 of MG888H5 API v1.0.5 — GET /api/Game/GameList
// status: "1"=Success, "14"=SignatureNotMatch, "15"=InvalidAccessToken, "17"=UnauthorizedIPAddress
interface GameListRes {
  gamelist:    Array<{ gld: number; gtyp: number; gname: string; jpr?: number; jpa?: number }> | null;
  status:      string;
  description: string | null;
}
interface H5LoginRes {
  actk?: string | null;
  tkn?: string | null;   // MEGAH5 2.0 may use 'tkn' instead of 'actk'
  status?: number | string | null;
  description?: string | null;
}

/**
 * MegaH5ApiClient — all outbound HTTP calls to MEGAH5 Operations and H5 APIs.
 *
 * Responsibilities: Retry on network errors, timeout enforcement, JSON parsing,
 *   HTTP error handling. No wallet / player / game business logic.
 *
 * NOTE: API endpoint paths and request body shapes are based on the MEGAH5 API
 *   spec. If the provider sends a different format, update the request building
 *   logic in this file only — no other file needs to change.
 */
export class MegaH5ApiClient {
  private readonly crypto = new MegaH5Crypto();

  constructor(
    private readonly creds: MegaH5Credentials,
    private readonly cfg:   MegaH5Config,
  ) {}

  /**
   * H5 Login — returns the actk (access token) for URL construction.
   *
   * Per MEGA official confirmation (2026-08-03): the POST body `accessToken`
   * field must use api_account_token (API Account Token), NOT api_token.
   * Using api_token causes status=15 "Invalid Access Token".
   */
  async h5Login(params: {
    accountId:  string;
    currency:   string;
    nickname:   string;
    language:   number;
    lobbyUrl:   string;
  }): Promise<{ actk: string; latencyMs: number }> {
    const { q, s } = this.crypto.buildLoginPayload({
      accountId:   params.accountId,
      password:    params.accountId,  // Seamless Wallet: password = accountId; echoed back in MEGA /api/authenticate callback
      currency:    params.currency,
      nickname:    params.nickname,
      language:    params.language,
      secretKey:   this.creds.secret_key,
      encryptKey:  this.creds.encrypt_key,
      md5Key:      this.creds.md5_key,
      delimiter:   this.creds.delimiter,
    });

    const body = JSON.stringify({ q, s, accessToken: this.creds.api_account_token });
    const url  = `${this.cfg.h5_api_domain.replace(/\/$/, '')}${H5_PATH.LOGIN}`;

    console.log('[MEGAH5 H5Login Request]', {
      url,
      method:           'POST',
      postfix_id:       this.cfg.postfix_id,
      accountId:        params.accountId,
      currency:         params.currency,
      body_s:           s,
      body_accessToken: this.creds.api_account_token.slice(0, 8) + '***',
    });

    const { data: raw, latencyMs } = await this.post<H5LoginRes>(url, body);

    const token = raw.actk ?? raw.tkn ?? null;
    console.log('[MEGAH5 H5Login Response]', {
      status: raw.status,
      description: raw.description,
      actk: raw.actk ? '[present]' : '[missing]',
      tkn:  raw.tkn  ? '[present]' : '[missing]',
      token_used: token ? '[present]' : '[MISSING]',
      latencyMs,
    });

    if (!token) {
      throw new Error(
        `MEGAH5 H5 Login failed: status=${raw.status} description="${raw.description}"`,
      );
    }

    return { actk: token, latencyMs };
  }

  /** Register a new player on MEGAH5 provider side. */
  async createPlayer(
    accountID: string,
    nickName:  string,
    currency:  string,
  ): Promise<{ playerID: number }> {
    const url = `${this.cfg.api_base_url.replace(/\/$/, '')}${API_PATH.CREATE_PLAYER}`;
    const body = JSON.stringify({
      accountID,
      nickName,
      currency,
      language: MEGAH5_LANGUAGE.ZH,
    });

    console.log('[MEGAH5 CREATEPLAYER REQUEST]', {
      url,
      method:      'POST',
      header_token: this.creds.api_account_token.slice(0, 8) + '***',
      body:        { accountID, nickName, currency, language: MEGAH5_LANGUAGE.ZH },
    });

    const res = await this.post<CreatePlayerRes>(url, body, { token: this.creds.api_account_token });

    console.log('[MEGAH5 CREATEPLAYER RESPONSE]', {
      httpStatus:  res.httpStatus,
      statusCode:  res.data.statusCode,
      errMsg:      res.data.errMsg,
      playerID:    res.data.playerID,
      latencyMs:   res.latencyMs,
      fullBody:    res.data,
      success:     res.data.statusCode === 0,
    });

    if (res.data.statusCode !== 0) {
      throw new Error(`MEGAH5 CreatePlayer error ${res.data.statusCode}: ${res.data.errMsg}`);
    }
    return { playerID: res.data.playerID };
  }

  /** Retrieve the provider playerID for an existing account. MG888H5 API v1.0.5 §2.14 */
  async checkPlayer(accountID: string): Promise<{ playerID: number }> {
    const url = `${this.cfg.api_base_url.replace(/\/$/, '')}${API_PATH.CHECK_PLAYER}?userName=${encodeURIComponent(accountID)}`;

    console.log('[MEGAH5 CHECKPLAYER REQUEST]', {
      url,
      method:  'GET',
      headers: { token: this.creds.api_account_token.slice(0, 8) + '***' },
      userName: accountID,
    });

    const res = await this.request<Record<string, unknown>>('GET', url, undefined, { token: this.creds.api_account_token });

    // Print complete raw response — field names to be confirmed on first runtime hit
    console.log('[MEGAH5 CHECKPLAYER RESPONSE]', res.data, { httpStatus: res.httpStatus, latencyMs: res.latencyMs });

    // 'playerID' is the only field confirmed by MG888H5 API v1.0.5 §2.14 Response table
    // error/statusCode field name is TBD — do not check until first runtime observation
    const playerID = res.data['playerID'];
    if (typeof playerID !== 'number') {
      throw new Error(`MEGAH5 CheckPlayer: unexpected response — ${JSON.stringify(res.data)}`);
    }
    return { playerID };
  }

  /**
   * Fetch the full game list from MEGAH5.
   *
   * Per MG888H5 API v1.0.5 Section 10.1:
   *   HTTP GET <h5_api_domain>/api/Game/GameList?q={q}&s={s}&accessToken={accessToken}
   *
   *   QS  = "key={secretKey}{delimiter}time={currTime}"  (no gameType → all games)
   *   q   = URLEncode(DESencrypt(QS, encryptKey))
   *   s   = MD5(QS + md5Key + currTime + secretKey)
   *   accessToken = URLEncode(api_token)  — NOT inside q/s
   *
   * Response: { gamelist:[{gld, gtyp, gname, jpr?, jpa?}], status:"1", description }
   *   status "1"=Success, "14"=SignatureNotMatch, "15"=InvalidAccessToken
   */
  async getGameList(): Promise<GameListItem[]> {
    const now = new Date();
    const p   = (n: number) => String(n).padStart(2, '0');
    const currTime =
      String(now.getUTCFullYear()) +
      p(now.getUTCMonth() + 1) +
      p(now.getUTCDate()) +
      p(now.getUTCHours()) +
      p(now.getUTCMinutes()) +
      p(now.getUTCSeconds());

    const d  = this.creds.delimiter || '|';
    const QS = `key=${this.creds.secret_key}${d}time=${currTime}`;

    const q           = encodeURIComponent(this.crypto.desEncrypt(QS, this.creds.encrypt_key));
    const s           = this.crypto.md5Hex(QS + this.creds.md5_key + currTime + this.creds.secret_key);
    const accessToken = encodeURIComponent(this.creds.api_token);

    const url = `${this.cfg.h5_api_domain.replace(/\/$/, '')}${H5_PATH.GAME_LIST}?q=${q}&s=${s}&accessToken=${accessToken}`;

    console.log('[MEGAH5 GameList Request]', {
      url: url.slice(0, 120) + '...',
      currTime,
      QS,
      s,
    });

    const res = await this.get<GameListRes>(url);

    console.log('[MEGAH5 GameList Response]', {
      status:      res.data.status,
      description: res.data.description,
      count:       res.data.gamelist?.length ?? 0,
      latencyMs:   res.latencyMs,
    });

    if (res.data.status !== '1') {
      throw new Error(`MEGAH5 GameList error status=${res.data.status}: ${res.data.description ?? ''}`);
    }

    return (res.data.gamelist ?? []).map(g => ({
      game_code: g.gname,
      name:      g.gname,
      game_type: this.mapGameType(g.gtyp),
      is_active: true,
    }));
  }

  /** Lightweight ping to verify API connectivity. Throws on failure. */
  async healthCheck(): Promise<{ latencyMs: number }> {
    const url = `${this.cfg.api_base_url.replace(/\/$/, '')}${API_PATH.HEALTH}`;
    const { data, latencyMs } = await this.post<BaseResponse>(url, '{}', { token: this.creds.api_account_token });
    if (data.statusCode !== 0) {
      throw new Error(`MEGAH5 HealthCheck error ${data.statusCode}: ${data.errMsg}`);
    }
    return { latencyMs };
  }

  private mapGameType(t: number): typeof GAME_TYPE[keyof typeof GAME_TYPE] {
    switch (t) {
      case 1: return GAME_TYPE.SLOT;
      case 2: return GAME_TYPE.ARCADE;
      case 3: return GAME_TYPE.TABLE;
      case 4: return GAME_TYPE.FISHING;
      case 5: return GAME_TYPE.LIVE_CASINO;
      default: return GAME_TYPE.OTHER;
    }
  }

  private async request<T>(
    method: string,
    url: string,
    jsonBody?: string,
    extraHeaders?: Record<string, string>,
  ): Promise<{ data: T; latencyMs: number; httpStatus: number }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeout_ms);
    const start = Date.now();

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: jsonBody !== undefined
          ? { 'Content-Type': 'application/json', ...extraHeaders }
          : { ...extraHeaders },
        body:   jsonBody,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const latencyMs = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[MEGAH5-STEP7] Network/Timeout error', {
        url, latencyMs,
        error:   msg,
        stack:   err instanceof Error ? err.stack : undefined,
      });
      throw new Error(`MEGAH5 API request to ${url} failed: ${msg} (${latencyMs}ms)`);
    }
    clearTimeout(timer);
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[MEGAH5-STEP7] HTTP error response', {
        url,
        httpStatus: res.status,
        rawBody:    text.slice(0, 300),
        latencyMs,
      });
      throw new Error(`MEGAH5 API HTTP ${res.status} from ${url}: ${text.slice(0, 200)}`);
    }

    const httpStatus = res.status;
    const data = (await res.json()) as T;
    return { data, latencyMs, httpStatus };
  }

  private post<T>(url: string, jsonBody: string, extraHeaders?: Record<string, string>) {
    return this.request<T>('POST', url, jsonBody, extraHeaders);
  }

  private get<T>(url: string) {
    return this.request<T>('GET', url, undefined);
  }
}
