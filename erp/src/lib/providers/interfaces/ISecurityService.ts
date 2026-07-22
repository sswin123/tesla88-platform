/**
 * Security service contract.
 *
 * Handles token validation, IP filtering, AES encryption of credentials,
 * callback signature verification, and replay attack prevention.
 */
export interface ISecurityService {
  // ── Credential Encryption ─────────────────────────────────────────────────

  /** AES-256-GCM encrypt a plaintext credential value. */
  encrypt(plaintext: string): string;

  /** Decrypt an AES-256-GCM encrypted credential value. */
  decrypt(ciphertext: string): string;

  // ── Callback Token Validation ─────────────────────────────────────────────

  /**
   * Verify the operator access token supplied in an inbound callback header.
   * Returns the provider code if valid; throws SecurityError if invalid.
   */
  validateOperatorToken(token: string): string;

  // ── IP Allowlisting ───────────────────────────────────────────────────────

  /**
   * Check whether the given IP is in the allowlist for the provider.
   * An empty allowlist means all IPs are permitted.
   */
  isAllowedIP(providerCode: string, ip: string): boolean;

  /**
   * Update the in-memory IP allowlist for a provider.
   * Called by ProviderManager when provider config is reloaded.
   */
  setAllowedIPs(providerCode: string, ips: string[]): void;

  // ── Signature Verification ────────────────────────────────────────────────

  /**
   * Verify an MD5 HMAC signature attached to a callback payload.
   * The signing algorithm is provider-specific; the provider code selects it.
   */
  verifySignature(
    providerCode: string,
    payload: Record<string, unknown>,
    signature: string,
  ): boolean;

  // ── Audit ─────────────────────────────────────────────────────────────────

  /**
   * Log a security event (failed token, blocked IP, signature mismatch, etc.)
   * for the platform security audit trail.
   */
  logSecurityEvent(event: SecurityEvent): Promise<void>;
}

export interface SecurityEvent {
  type: 'INVALID_TOKEN' | 'BLOCKED_IP' | 'INVALID_SIGNATURE' | 'REPLAY_ATTACK' | 'RATE_LIMIT';
  provider: string;
  ip: string | null;
  details: string;
  timestamp: string;
}
