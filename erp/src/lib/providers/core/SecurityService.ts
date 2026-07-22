import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import type { ISecurityService, SecurityEvent } from '../interfaces/ISecurityService';
import type { IEventRepository } from '../interfaces/IEventRepository';

/**
 * Security Service — handles encryption, token validation, and IP filtering.
 *
 * Encryption key is loaded from AES_ENCRYPTION_KEY env var (32-byte hex).
 *
 * KEY DESIGN DECISION: the constructor NEVER throws, even in production.
 * Throwing here breaks createGamingPlatform(), which in turn permanently
 * breaks getKiss918Adapter() because the singleton caches the null result.
 * The Seamless Wallet callback path does not call encrypt() or decrypt() at
 * all (credentials in gp_credentials are is_encrypted=false for staging),
 * so the missing-key error should surface only when those operations are
 * actually attempted — not at platform construction time.
 */
export class SecurityService implements ISecurityService {
  private readonly key: Buffer;
  // True only when AES_ENCRYPTION_KEY was present and correct length.
  // When false, encrypt() and decrypt() throw immediately.
  private readonly keyReady: boolean;
  private readonly ipAllowlists = new Map<string, Set<string>>();
  private readonly operatorTokenMap = new Map<string, string>(); // token → providerCode

  constructor(private readonly eventRepo: IEventRepository) {
    const hexKey = process.env.AES_ENCRYPTION_KEY;
    if (hexKey && hexKey.length === 64) {
      this.key = Buffer.from(hexKey, 'hex');
      this.keyReady = true;
    } else {
      // Use an ephemeral key so the object is always constructable.
      // encrypt() / decrypt() will throw if keyReady is false.
      this.key = randomBytes(32);
      this.keyReady = false;
      const msg =
        'AES_ENCRYPTION_KEY is not set or is not a 64-character hex string. ' +
        'Credential encrypt/decrypt operations will throw. ' +
        'Wallet callback handling is NOT affected (it does not use this key).';
      if (process.env.NODE_ENV === 'production') {
        console.error(`[SecurityService] ${msg}`);
      } else {
        console.warn(`[SecurityService] ${msg} Using ephemeral key for dev.`);
      }
    }
  }

  // ── Credential Encryption (AES-256-GCM) ───────────────────────────────────

  encrypt(plaintext: string): string {
    if (!this.keyReady) {
      throw new Error(
        'SecurityService.encrypt() called but AES_ENCRYPTION_KEY is not configured. ' +
        'Set AES_ENCRYPTION_KEY to a 64-character hex string (32 bytes).',
      );
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Format: iv(12) + authTag(16) + ciphertext → base64
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  decrypt(ciphertext: string): string {
    if (!this.keyReady) {
      throw new Error(
        'SecurityService.decrypt() called but AES_ENCRYPTION_KEY is not configured. ' +
        'Set AES_ENCRYPTION_KEY to a 64-character hex string (32 bytes).',
      );
    }
    const buf = Buffer.from(ciphertext, 'base64');
    const iv = buf.subarray(0, 12);
    const authTag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
  }

  // ── Operator Token Validation ─────────────────────────────────────────────

  /**
   * Register a known operator token ↔ provider mapping.
   * Called by ProviderManager during boot for each active provider.
   */
  registerOperatorToken(token: string, providerCode: string): void {
    this.operatorTokenMap.set(token, providerCode);
  }

  validateOperatorToken(token: string): string {
    const code = this.operatorTokenMap.get(token);
    if (!code) {
      throw new SecurityError(`Invalid operator token: ${token.slice(0, 8)}…`);
    }
    return code;
  }

  // ── IP Allowlisting ───────────────────────────────────────────────────────

  setAllowedIPs(providerCode: string, ips: string[]): void {
    this.ipAllowlists.set(
      providerCode,
      new Set(ips.map((ip) => ip.trim()).filter(Boolean)),
    );
  }

  isAllowedIP(providerCode: string, ip: string): boolean {
    const allowlist = this.ipAllowlists.get(providerCode);
    // Empty allowlist = allow all IPs
    if (!allowlist || allowlist.size === 0) return true;
    return allowlist.has(ip);
  }

  // ── Signature Verification ────────────────────────────────────────────────

  verifySignature(
    _providerCode: string,
    _payload: Record<string, unknown>,
    _signature: string,
  ): boolean {
    // Signature verification is provider-specific and is implemented
    // inside each adapter's validateCallbackToken() method.
    // This method is a hook for providers that share a common signing scheme.
    return true;
  }

  // ── Security Event Audit ──────────────────────────────────────────────────

  async logSecurityEvent(event: SecurityEvent): Promise<void> {
    await this.eventRepo.create({
      provider: event.provider,
      action: `SECURITY:${event.type}`,
      ip: event.ip,
      json_body: { details: event.details, timestamp: event.timestamp },
      verify_result: false,
    });
  }
}

export class SecurityError extends Error {
  readonly name = 'SecurityError';
  constructor(message: string) {
    super(message);
  }
}
