// erp/src/lib/providers/adapters/megaapp/MegaAppSigner.ts
import { createHash, randomUUID, randomBytes } from 'crypto';

export class MegaAppSigner {
  constructor(private readonly secretCode: string) {}

  md5(input: string): string {
    return createHash('md5').update(input, 'utf8').digest('hex');
  }

  // ── Digest helpers ────────────────────────────────────────────────────────

  /**
   * digest = MD5(random + sn + secretCode)
   *
   * Java equivalent:
   *   String src = random + sn + secretCode;
   *   String digest = MD5Util.MD5(src);
   */
  digestBasic(random: string, sn: string): string {
    const sourceStr = random + sn + this.secretCode;
    const digest    = this.md5(sourceStr);
    console.log('[MEGA SIGNER] digestBasic', JSON.stringify({
      method_using: 'digestBasic',
      java_formula: 'MD5(random + sn + secretCode)',
      random,
      sn,
      secretCode_len:      this.secretCode.length,
      secretCode_masked:   this._maskSecret(this.secretCode),
      source_template:     '{random}{sn}{secretCode}',
      source_visible_part: `${random}${sn}[SECRET:${this.secretCode.length}chars]`,
      source_total_len:    sourceStr.length,
      digest,
    }));
    return digest;
  }

  /**
   * digest = MD5(random + sn + loginId + secretCode)
   *
   * Java equivalent:
   *   String src = random + sn + loginId + secretCode;
   *   String digest = MD5Util.MD5(src);
   */
  digestWithLoginId(random: string, sn: string, loginId: string): string {
    const sourceStr = random + sn + loginId + this.secretCode;
    const digest    = this.md5(sourceStr);
    console.log('[MEGA SIGNER] digestWithLoginId', JSON.stringify({
      method_using: 'digestWithLoginId',
      java_formula: 'MD5(random + sn + loginId + secretCode)',
      random,
      sn,
      loginId,
      secretCode_len:      this.secretCode.length,
      secretCode_masked:   this._maskSecret(this.secretCode),
      source_template:     '{random}{sn}{loginId}{secretCode}',
      source_visible_part: `${random}${sn}${loginId}[SECRET:${this.secretCode.length}chars]`,
      source_total_len:    sourceStr.length,
      digest,
    }));
    return digest;
  }

  /**
   * digest = MD5(random + sn + loginId + amount + secretCode)
   *
   * Java equivalent:
   *   String src = random + sn + loginId + amount + secretCode;
   *   String digest = MD5Util.MD5(src);
   * Note: amount must be the exact same string passed in params (not reformatted).
   */
  digestWithAmount(random: string, sn: string, loginId: string, amount: string): string {
    const sourceStr = random + sn + loginId + amount + this.secretCode;
    const digest    = this.md5(sourceStr);
    console.log('[MEGA SIGNER] digestWithAmount', JSON.stringify({
      method_using: 'digestWithAmount',
      java_formula: 'MD5(random + sn + loginId + amount + secretCode)',
      random,
      sn,
      loginId,
      amount,
      secretCode_len:      this.secretCode.length,
      secretCode_masked:   this._maskSecret(this.secretCode),
      source_template:     '{random}{sn}{loginId}{amount}{secretCode}',
      source_visible_part: `${random}${sn}${loginId}${amount}[SECRET:${this.secretCode.length}chars]`,
      source_total_len:    sourceStr.length,
      digest,
    }));
    return digest;
  }

  /** Verify a digest received in a callback from MEGA. */
  verifyLoginDigest(random: string, sn: string, loginId: string, digest: string): boolean {
    const expected = this.digestWithLoginId(random, sn, loginId);
    return expected.toLowerCase() === digest.toLowerCase();
  }

  random(): string {
    return randomUUID().replace(/-/g, '');
  }

  /** Generate a random password: 2 uppercase + 4 digits + 2 lowercase, length configurable. */
  generatePassword(length = 10): string {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '0123456789';
    const all = upper + lower + digits;

    const pick = (charset: string) => charset[randomBytes(1)[0] % charset.length];

    const chars: string[] = [pick(upper), pick(upper), pick(lower), pick(lower), pick(digits), pick(digits)];
    for (let i = chars.length; i < length; i++) chars.push(pick(all));

    // Fisher-Yates shuffle
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomBytes(1)[0] % (i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
  }

  /** Generate a sessionId in MEGA format: {sn}{random hex 28 chars uppercase} */
  generateSessionId(sn: string): string {
    return sn + randomBytes(14).toString('hex').toUpperCase();
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /** Mask middle of a secret string; show first 2 + last 2 chars and total length. */
  private _maskSecret(s: string): string {
    if (s.length <= 4) return `[${s.length}chars:****]`;
    return `[${s.length}chars:${s.slice(0, 2)}${'*'.repeat(s.length - 4)}${s.slice(-2)}]`;
  }
}
