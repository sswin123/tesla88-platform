// erp/src/lib/providers/adapters/megaapp/MegaAppSigner.ts
import { createHash, randomUUID, randomBytes } from 'crypto';

export class MegaAppSigner {
  constructor(private readonly secretCode: string) {}

  md5(input: string): string {
    return createHash('md5').update(input, 'utf8').digest('hex');
  }

  /** digest = MD5(random + sn + secretCode) */
  digestBasic(random: string, sn: string): string {
    return this.md5(random + sn + this.secretCode);
  }

  /** digest = MD5(random + sn + loginId + secretCode) */
  digestWithLoginId(random: string, sn: string, loginId: string): string {
    return this.md5(random + sn + loginId + this.secretCode);
  }

  /** digest = MD5(random + sn + loginId + amount + secretCode) */
  digestWithAmount(random: string, sn: string, loginId: string, amount: string): string {
    return this.md5(random + sn + loginId + amount + this.secretCode);
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
}
