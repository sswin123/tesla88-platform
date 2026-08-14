import { createHash } from 'crypto';

export class Pussy888Signer {
  constructor(
    private readonly authcode:  string,
    private readonly secretKey: string,
  ) {}

  /**
   * Pussy888 API signature formula:
   *   sign = MD5((authcode + userName + time + secretKey).toLowerCase())
   *
   * All parts concatenated, then the entire string lowercased before MD5.
   *
   * @param userName - player username (e.g. PSYA333_u42)
   * @param time     - 13-digit millisecond timestamp
   */
  sign(userName: string, time: string): string {
    const source = (this.authcode + userName + time + this.secretKey).toLowerCase();
    return createHash('md5').update(source, 'utf8').digest('hex');
  }

  // ── addUser sign formula candidates (debug use only) ─────────────────────

  /** Formula B: MD5((authcode+userName+PassWd+time+secretKey).toLowerCase()) */
  signB(userName: string, password: string, time: string): string {
    const source = (this.authcode + userName + password + time + this.secretKey).toLowerCase();
    return createHash('md5').update(source, 'utf8').digest('hex');
  }

  /** Formula C: MD5((authcode+agent+userName+time+secretKey).toLowerCase()) */
  signC(agent: string, userName: string, time: string): string {
    const source = (this.authcode + agent + userName + time + this.secretKey).toLowerCase();
    return createHash('md5').update(source, 'utf8').digest('hex');
  }

  /** Formula D: MD5((authcode+agent+userName+PassWd+time+secretKey).toLowerCase()) */
  signD(agent: string, userName: string, password: string, time: string): string {
    const source = (this.authcode + agent + userName + password + time + this.secretKey).toLowerCase();
    return createHash('md5').update(source, 'utf8').digest('hex');
  }

  // ─────────────────────────────────────────────────────────────────────────

  /** Current 13-digit millisecond timestamp as a string. */
  timestamp(): string {
    return String(Date.now());
  }

  maskSecret(): string {
    const s = this.secretKey;
    if (s.length <= 4) return `[${s.length}chars:****]`;
    return `[${s.length}chars:${s.slice(0, 2)}${'*'.repeat(s.length - 4)}${s.slice(-2)}]`;
  }
}
