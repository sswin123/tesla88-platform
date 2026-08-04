// erp/src/lib/providers/adapters/megah5/MegaH5Crypto.ts
import { createCipheriv, createHash } from 'crypto';

export interface LoginPayloadParams {
  accountId:   string;
  password:    string;  // = accountId for Seamless Wallet; echoed back in MEGA /api/authenticate callback
  currency:    string;
  nickname:    string;
  language:    number;
  secretKey:   string;
  encryptKey:  string;
  md5Key:      string;
  delimiter:   string;
}

export interface LoginPayload {
  q: string;  // URL-encoded DES-CBC encrypted QS
  s: string;  // MD5 hex signature
}

/**
 * MegaH5Crypto — DES-CBC encryption + MD5 signing for H5 Login.
 *
 * Per MG888H5 API v1.0.5 Page 45 & 48:
 *   QS = "key={secretKey}|time={currTime}|userName={accountId}|password={password}|currency={currency}|nickName={nickName}"
 *   q  = URLEncode(DES-CBC-encrypt(QS, encryptKey))           — key = IV = first 8 bytes
 *   s  = MD5(QS + md5Key + currTime + secretKey)              — Formula A, lowercase hex
 *
 * Note: `accessToken` is NOT part of the QS or signature — it is placed directly
 * in the POST body by MegaH5ApiClient.h5Login() using api_account_token.
 */
export class MegaH5Crypto {
  /** MD5 of input string, returned as lowercase hex. */
  md5Hex(input: string): string {
    return createHash('md5').update(input, 'utf8').digest('hex');
  }

  /**
   * DES-CBC encrypt plaintext.
   * Key and IV both = first 8 bytes of key (padded/truncated).
   * Returns base64-encoded ciphertext.
   */
  desEncrypt(plaintext: string, key: string): string {
    const keyBuf = Buffer.from(key.padEnd(8, '\0').slice(0, 8), 'utf8');
    const cipher = createCipheriv('des-cbc', keyBuf, keyBuf);
    cipher.setAutoPadding(true);
    return Buffer.concat([
      cipher.update(Buffer.from(plaintext, 'utf8')),
      cipher.final(),
    ]).toString('base64');
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

  /**
   * Build the q (encrypted QS) and s (MD5 sign) for H5 Login POST body.
   * Delimiter is read from brand_provider_credentials['delimiter'].
   */
  buildLoginPayload(params: LoginPayloadParams): LoginPayload {
    const currTime = this.formatUtcDateTime(new Date());
    const d = params.delimiter || '|';

    // QS per MG888H5 API v1.0.5 Page 45 & 48
    const QS = [
      `key=${params.secretKey}`,
      `time=${currTime}`,
      `userName=${params.accountId}`,
      `password=${params.password}`,
      `currency=${params.currency}`,
      `nickName=${params.nickname}`,
    ].join(d);

    // Formula A per MG888H5 API v1.0.5 Page 48:
    // var s = BuildMD5(QS + md5Key + currTime + secretKey)
    const md5Input = QS + params.md5Key + currTime + params.secretKey;
    const s = this.md5Hex(md5Input);

    const q = encodeURIComponent(this.desEncrypt(QS, params.encryptKey));

    // [MEGAH5-SIG-DEBUG] Print full payload for manual verification against MG888H5 API v1.0.5
    console.log('[MEGAH5-SIG-DEBUG]', {
      QS,
      q,
      md5Input,
      s,
      secretKey:  params.secretKey,
      md5Key:     params.md5Key,
      encryptKey: params.encryptKey,
      delimiter:  d,
      currTime,
    });

    return { q, s };
  }
}
