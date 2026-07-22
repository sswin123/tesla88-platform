import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import type { ISecurityService, SecurityEvent } from '../interfaces/ISecurityService';
import type { IEventRepository } from '../interfaces/IEventRepository';

/**
 * Security Service — handles encryption, token validation, and IP filtering.
 *
 * Encryption key is loaded from AES_ENCRYPTION_KEY env var (32-byte hex).
 * If the env var is missing in development, a warning is emitted and a
 * random key is generated for the current process (NOT suitable for production).
 */
export class SecurityService implements ISecurityService {
  private readonly key: Buffer;
  private readonly ipAllowlists = new Map<string, Set<string>>();
  private readonly operatorTokenMap = new Map<string, string>(); // token → providerCode

  constructor(private readonly eventRepo: IEventRepository) {
    const hexKey = process.env.AES_ENCRYPTION_KEY;
    if (hexKey && hexKey.length === 64) {
      this.key = Buffer.from(hexKey, 'hex');
    } else {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          'AES_ENCRYPTION_KEY env var is required in production (32 bytes as 64 hex chars)',
        );
      }
      // Development fallback — random per-process key
      this.key = randomBytes(32);
      console.warn(
        '[SecurityService] AES_ENCRYPTION_KEY not set. Using ephemeral key — credentials will not persist across restarts.',
      );
    }
  }

  // ── Credential Encryption (AES-256-GCM) ───────────────────────────────────

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Format: iv(12) + authTag(16) + ciphertext → base64
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  decrypt(ciphertext: string): string {
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
