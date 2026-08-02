// erp/src/lib/providers/adapters/megah5/MegaH5Crypto.ts
import { createCipheriv, createHash } from 'crypto';

export interface LoginPayloadParams {
  accountId:   string;
  currency:    string;
  nickname:    string;
  language:    number;
  secretKey:   string;
  encryptKey:  string;
  md5Key:      string;
  accessToken: string;
  delimiter:   string;
}

export interface LoginPayload {
  q: string;  // URL-encoded DES-CBC encrypted QS
  s: string;  // MD5 hex signature
}

/**
 * MegaH5Crypto — DES-CBC encryption + MD5 signing for H5 Login.
 *
 * Per MEGAH5 H5 API (same algorithm as 918KISS API v1.11 page 45-48):
 *   QS = "key={secretKey}|time={currTime}|userName={accountId}|password={accountId}|currency={currency}|nickName={nickname}"
 *   q  = URLEncode(DES-CBC-encrypt(QS, encryptKey))   — key = IV = first 8 bytes
 *   s  = MD5(QS + md5Key + currTime + secretKey)      — lowercase hex
 *
 * Delimiter between fields is "|" (pipe). Verify against actual MEGAH5 API docs
 * if integration fails — 918KISS uses configurable delimiter, MEGAH5 may use pipe.
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

    // MEGAH5 is seamless wallet — no player passwords exist.
    // QS does NOT include a password field (unlike 918KISS transfer wallet).
    const QS = [
      `key=${params.secretKey}`,
      `time=${currTime}`,
      `userName=${params.accountId}`,
      `currency=${params.currency}`,
      `nickName=${params.nickname}`,
    ].join(d);

    // Formula A (918KISS v1.11 p45): MD5(QS + md5Key + currTime + secretKey)
    const rawSignStringA = QS + params.md5Key + currTime + params.secretKey;
    const sA = this.md5Hex(rawSignStringA);

    // Formula B (alternative — no suffix): MD5(QS + md5Key)
    const sB = this.md5Hex(QS + params.md5Key);

    const q = encodeURIComponent(this.desEncrypt(QS, params.encryptKey));

    // Mask secrets for log safety
    const maskedQS = QS
      .replace(new RegExp(params.secretKey, 'g'), '[SECRET_KEY]')
      .replace(new RegExp(params.md5Key, 'g'), '[MD5_KEY]');
    const maskedSigA = rawSignStringA
      .replace(new RegExp(params.secretKey, 'g'), '[SECRET_KEY]')
      .replace(new RegExp(params.md5Key, 'g'), '[MD5_KEY]');

    console.log('[MEGAH5 Signature Debug] ─────────────────────────');
    console.log('  Delimiter       :', d, ' charCodes:', [...d].map(c => c.charCodeAt(0)));
    console.log('  currTime (UTC)  :', currTime);
    console.log('  QS fields       : key | time | userName | password | currency | nickName');
    console.log('  QS (masked)     :', maskedQS);
    console.log('  ---');
    console.log('  Formula A: MD5(QS + md5Key + currTime + secretKey)');
    console.log('    rawSig (masked):', maskedSigA);
    console.log('    s (Formula A)  :', sA);
    console.log('  ---');
    console.log('  Formula B: MD5(QS + md5Key)');
    console.log('    s (Formula B)  :', sB);
    console.log('  ---');
    console.log('  Using Formula B → s =', sB);
    console.log('[MEGAH5 Signature Debug] ─────────────────────────');

    return { q, s: sB };
  }
}
