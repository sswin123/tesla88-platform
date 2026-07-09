interface RateWindow {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateWindow>();

/* Periodic cleanup — prevents unbounded memory growth in long-running process */
const _timer = setInterval(() => {
  const now = Date.now();
  for (const [k, w] of store) {
    if (w.resetAt < now) store.delete(k);
  }
}, 5 * 60_000);
/* Don't keep Node.js process alive just for cleanup */
if (typeof _timer === 'object' && _timer !== null && 'unref' in _timer) {
  (_timer as { unref(): void }).unref();
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; retryAfterSecs: number } {
  const now = Date.now();
  const w = store.get(key);

  if (!w || w.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSecs: 0 };
  }

  if (w.count >= limit) {
    return { ok: false, retryAfterSecs: Math.ceil((w.resetAt - now) / 1000) };
  }

  w.count++;
  return { ok: true, retryAfterSecs: 0 };
}

export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

/** For tests only — clears all rate limit state */
export function _resetRateLimitStore(): void {
  store.clear();
}
