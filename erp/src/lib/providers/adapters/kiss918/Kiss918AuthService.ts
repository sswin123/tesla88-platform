import { createCipheriv, createHash } from 'crypto';
import { H5_PATH } from './constants';

export interface H5LoginParams {
  accountId: string;    // with postfix: u{userId}@{postfixId}
  currency: string;
  nickname: string;
  language: number;
  lobbyUrl: string;
  h5ApiDomain: string;
  md5Key: string;
  secretKey: string;
  encryptKey: string;
  delimiter: string;    // field separator in QS (may be empty string)
  accessToken: string;  // API Access Token sent in POST body
  password: string;     // player password sent in QS (918KISS passes back in Authenticate callback)
  timeoutMs: number;
  debug: boolean;
}

export interface H5LoginResult {
  actk: string;
  latencyMs: number;
}

/**
 * Kiss918AuthService — DES-CBC encryption + MD5 signing for H5 Login.
 *
 * Per 918KISS API v1.11 page 45-48:
 *   QS = "key={secretKey}{d}time={currTime}{d}userName={userName}{d}password={password}{d}currency={currency}{d}nickName={nickName}"
 *   q  = URLEncode(DES-CBC-encrypt(QS, encryptKey))   // CBC, IV = encryptKey
 *   s  = MD5(QS + md5Key + currTime + secretKey)      // lowercase hex
 *   POST body JSON: { "q": q, "s": s, "accessToken": accessToken }
 *   time format: "yyyyMMddHHmmss" UTC+0
 */
export class Kiss918AuthService {
  /**
   * DES-ECB encrypt (no IV). 918KISS uses ECB mode for q encryption.
   * Returns base64-encoded ciphertext.
   */
  desEncrypt(plaintext: string, key: string): string {
    const keyBuf = Buffer.from(key.padEnd(8, '\0').slice(0, 8), 'utf8');
    const cipher = createCipheriv('des-ecb', keyBuf, Buffer.alloc(0));
    cipher.setAutoPadding(true);
    return Buffer.concat([
      cipher.update(Buffer.from(plaintext, 'utf8')),
      cipher.final(),
    ]).toString('base64');
  }

  md5Hex(input: string): string {
    return createHash('md5').update(input, 'utf8').digest('hex');
  }

  private formatUtcDateTime(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return (
      String(d.getUTCFullYear()) +
      p(d.getUTCMonth() + 1) +
      p(d.getUTCDate()) +
      p(d.getUTCHours()) +
      p(d.getUTCMinutes()) +
      p(d.getUTCSeconds())
    );
  }

  async getLoginToken(params: H5LoginParams): Promise<H5LoginResult> {
    const currTime = this.formatUtcDateTime(new Date());
    const d = params.delimiter;

    // Build QS with Delimiter as field separator (NOT "&")
    const QS = [
      `key=${params.secretKey}`,
      `time=${currTime}`,
      `userName=${params.accountId}`,
      `password=${params.password}`,
      `currency=${params.currency}`,
      `nickName=${params.nickname}`,
    ].join(d);

    // q = URLEncode(DES-CBC-encrypt(QS))
    const q = encodeURIComponent(this.desEncrypt(QS, params.encryptKey));

    // s = MD5(QS + md5Key + currTime + secretKey)  — lowercase
    const s = this.md5Hex(QS + params.md5Key + currTime + params.secretKey);

    const body = JSON.stringify({ q, s, accessToken: params.accessToken });
    const url  = `${params.h5ApiDomain.replace(/\/$/, '')}${H5_PATH.LOGIN}`;

    if (params.debug) {
      console.debug('[Kiss918AuthService] H5 Login →', url, {
        currTime,
        QS,
        q: q.slice(0, 30) + '…',
        s,
        accessToken: params.accessToken.slice(0, 8) + '…',
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), params.timeoutMs);

    const start = Date.now();
    let res: Response;
    try {
      res = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal:  controller.signal,
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
    let data: {
      actk?: string | null;
      playerID?: number | null;
      status?: number | string | null;
      description?: string | null;
    };
    try { data = JSON.parse(rawBody); } catch { data = {}; }

    if (params.debug) {
      console.debug('[Kiss918AuthService] H5 Login ←', {
        status: data.status,
        hasActk: !!data.actk,
        description: data.description,
        latencyMs,
      });
    }

    if (!data.actk) {
      throw new Error(
        `918KISS H5 Login failed: status=${data.status} description="${data.description}"`,
      );
    }

    return { actk: data.actk, latencyMs };
  }
}
