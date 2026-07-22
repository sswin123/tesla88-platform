/** Circuit breaker for 918KISS outbound API calls. */

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before the circuit opens (default 5). */
  threshold?: number;
  /** Milliseconds to wait in OPEN state before attempting recovery (default 30 000). */
  cooldownMs?: number;
}

/**
 * Kiss918CircuitBreaker — in-memory circuit breaker protecting all outbound
 * 918KISS Operations API and H5 API calls.
 *
 * State transitions:
 *   CLOSED  → (≥threshold failures) → OPEN
 *   OPEN    → (after cooldown)       → HALF_OPEN
 *   HALF_OPEN → (success)            → CLOSED
 *   HALF_OPEN → (failure)            → OPEN
 */
export class Kiss918CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private openedAt: number | null = null;

  private readonly threshold: number;
  private readonly cooldownMs: number;

  constructor(opts: CircuitBreakerOptions = {}) {
    this.threshold  = opts.threshold  ?? 5;
    this.cooldownMs = opts.cooldownMs ?? 30_000;
  }

  /**
   * Execute `fn` through the circuit breaker.
   * Throws `CircuitOpenError` immediately when the circuit is OPEN and the
   * cooldown has not yet elapsed.
   */
  async exec<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - (this.openedAt ?? 0);
      if (elapsed >= this.cooldownMs) {
        this.state = 'HALF_OPEN';
        console.info('[Kiss918CircuitBreaker] Transitioning OPEN → HALF_OPEN for recovery probe.');
      } else {
        throw new CircuitOpenError(Math.ceil((this.cooldownMs - elapsed) / 1000));
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getFailureCount(): number {
    return this.failureCount;
  }

  /** Manually reset (e.g. after maintenance). */
  reset(): void {
    this.state        = 'CLOSED';
    this.failureCount = 0;
    this.openedAt     = null;
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      console.info('[Kiss918CircuitBreaker] Recovery probe succeeded — circuit CLOSED.');
    }
    this.state        = 'CLOSED';
    this.failureCount = 0;
    this.openedAt     = null;
  }

  private onFailure(): void {
    this.failureCount++;
    if (this.state === 'HALF_OPEN' || this.failureCount >= this.threshold) {
      this.state    = 'OPEN';
      this.openedAt = Date.now();
      console.warn(
        `[Kiss918CircuitBreaker] Circuit OPENED after ${this.failureCount} consecutive failures.`,
      );
    }
  }
}

export class CircuitOpenError extends Error {
  readonly name = 'CircuitOpenError';
  constructor(remainingSeconds: number) {
    super(
      `918KISS circuit breaker is OPEN — provider API unavailable. ` +
      `Retry in ${remainingSeconds}s.`,
    );
  }
}
