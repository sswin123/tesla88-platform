import { createCipheriv, createHash } from 'crypto';
import { H5_PATH } from './constants';

export interface H5LoginParams {
  accountId: string;
  currency: string;
  nickname: string;
  language: number;
  lobbyUrl: string;
  h5ApiDomain: string;
  md5Key: string;
  secretKey: string;
  encryptKey: string;
  delimiter: string;
  timeoutMs: number;
  debug: boolean;
}

export interface H5LoginResult {
  actk: string;
  latencyMs: number;
}

/**
 * Kiss918AuthService — DES-ECB encryption + MD5 signing for H5 Login.
 *
 * 918KISS H5 Login flow:
 *   1. Build QS string with player attributes.
 *   2. DES-ECB encrypt QS using EncryptKey (8 bytes) → base64 encoded `q`.
 *   3. epoch_seconds = current Unix timestamp.
 *   4. sign_input = MD5Key + SecretKey + epoch_seconds + q + Delimiter.
 *   5. s = MD5(sign_input).toUpperCase().
 *   6. POST to /api/Acc/Login with: userName, time, q, s.
 *   7. Extract `actk` from the JSON response.
 */
export class Kiss918AuthService {
  /**
   * DES-ECB encrypt plaintext with an 8-byte key.
   * Returns base64-encoded ciphertext.
   */
  desEncrypt(plaintext: string, key: string): string {
    // DES key must be exactly 8 bytes — pad or truncate
    const keyBuf = Buffer.from(key.padEnd(8, '\0').slice(0, 8), 'utf8');
    // ECB mode uses no IV (pass empty Buffer)
    const cipher = createCipheriv('des-ecb', keyBuf, Buffer.alloc(0));
    cipher.setAutoPadding(true);
    return Buffer.concat([
      cipher.update(Buffer.from(plaintext, 'utf8')),
      cipher.final(),
    ]).toString('base64');
  }

  md5Upper(input: string): string {
    return createHash('md5').update(input, 'utf8').digest('hex').toUpperCase();
  }

  /** Build the QS string that will be DES-encrypted for the H5 login request. */
  buildQS(
    accountId: string,
    currency: string,
    nickname: string,
    language: number,
    lobbyUrl: string,
  ): string {
    return (
      `userName=${accountId}` +
      `&currency=${currency}` +
      `&nickName=${encodeURIComponent(nickname)}` +
      `&language=${language}` +
      `&lobbyUrl=${encodeURIComponent(lobbyUrl)}`
    );
  }

  /**
   * Call the 918KISS H5 Login API and return the `actk` (Access Token).
   * The token is short-lived and scoped to the player's session.
   */
  async getLoginToken(params: H5LoginParams): Promise<H5LoginResult> {
    const qs  = this.buildQS(
      params.accountId,
      params.currency,
      params.nickname,
      params.language,
      params.lobbyUrl,
    );
    const q    = this.desEncrypt(qs, params.encryptKey);
    const time = Math.floor(Date.now() / 1000);
    const s    = this.md5Upper(
      `${params.md5Key}${params.secretKey}${time}${q}${params.delimiter}`,
    );

    const formBody = new URLSearchParams({
      userName: params.accountId,
      time: String(time),
      q,
      s,
    }).toString();

    const url = `${params.h5ApiDomain.replace(/\/$/, '')}${H5_PATH.LOGIN}`;

    if (params.debug) {
      console.debug('[Kiss918AuthService] H5 Login →', url, { userName: params.accountId, time, s });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), params.timeoutMs);

    const start = Date.now();
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`918KISS H5 Login HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const rawBody = await res.text();
    console.log('[Kiss918AuthService] H5 Login raw response:', rawBody.slice(0, 800));
    let data: { actk?: string; statusCode?: number; errMsg?: string };
    try { data = JSON.parse(rawBody); } catch { data = {}; }

    if (params.debug) {
      console.debug('[Kiss918AuthService] H5 Login ←', { data, latencyMs });
    }

    if (data.statusCode !== 0 || !data.actk) {
      throw new Error(
        `918KISS H5 Login failed: statusCode=${data.statusCode} errMsg="${data.errMsg}"`,
      );
    }

    return { actk: data.actk, latencyMs };
  }
}
