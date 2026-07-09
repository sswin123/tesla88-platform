import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rateLimit, getClientIp, _resetRateLimitStore } from '@/lib/rate-limit';

beforeEach(() => {
  _resetRateLimitStore();
  vi.useRealTimers();
});

/* ── Rate limiter unit tests ────────────────────────────────── */

describe('rateLimit()', () => {
  it('allows requests within limit', () => {
    for (let i = 0; i < 5; i++) {
      expect(rateLimit('key', 5, 60_000).ok).toBe(true);
    }
  });

  it('blocks after limit exceeded', () => {
    for (let i = 0; i < 5; i++) rateLimit('key', 5, 60_000);
    const r = rateLimit('key', 5, 60_000);
    expect(r.ok).toBe(false);
    expect(r.retryAfterSecs).toBeGreaterThan(0);
  });

  it('resets after window expires', () => {
    vi.useFakeTimers();
    for (let i = 0; i < 3; i++) rateLimit('k', 3, 1_000);
    expect(rateLimit('k', 3, 1_000).ok).toBe(false);
    vi.advanceTimersByTime(1_100);
    expect(rateLimit('k', 3, 1_000).ok).toBe(true);
  });

  it('isolates different keys', () => {
    for (let i = 0; i < 5; i++) rateLimit('a', 5, 60_000);
    expect(rateLimit('a', 5, 60_000).ok).toBe(false);
    expect(rateLimit('b', 5, 60_000).ok).toBe(true);
  });
});

describe('getClientIp()', () => {
  const h = (map: Record<string, string>) => ({ get: (k: string) => map[k] ?? null });

  it('reads x-forwarded-for', () => {
    expect(getClientIp({ headers: h({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }) }))
      .toBe('1.2.3.4');
  });

  it('falls back to x-real-ip', () => {
    expect(getClientIp({ headers: h({ 'x-real-ip': '9.9.9.9' }) })).toBe('9.9.9.9');
  });

  it('returns unknown with no headers', () => {
    expect(getClientIp({ headers: h({}) })).toBe('unknown');
  });
});

/* ── ERP login rate limit integration ──────────────────────── */

vi.mock('@/lib/auth', () => ({
  verifyJWT:        vi.fn().mockResolvedValue({ sub: 1, username: 'admin', role: 'SUPER_ADMIN', iat: 0, exp: 9999999999 }),
  comparePassword:  vi.fn().mockResolvedValue(false),
  signJWT:          vi.fn().mockResolvedValue('tok'),
  getAdminByUsername: vi.fn().mockResolvedValue(null),
  COOKIE_NAME:      'erp_session',
  COOKIE_MAX_AGE:   28800,
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => ({ value: 'tok' }) }),
}));

vi.mock('@/lib/repositories/audit_repo', () => ({ logAudit: vi.fn() }));

import { POST as erpLoginPost } from '@/app/api/auth/login/route';
import { NextRequest } from 'next/server';

function makeErpLoginReq(ip = '10.0.0.1') {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'wrong' }),
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
  });
}

describe('ERP login rate limit', () => {
  beforeEach(() => {
    _resetRateLimitStore();
    vi.clearAllMocks();
  });

  it('returns 429 after 5 attempts from same IP', async () => {
    const ip = '192.168.5.5';
    for (let i = 0; i < 5; i++) {
      await erpLoginPost(makeErpLoginReq(ip));
    }
    const res = await erpLoginPost(makeErpLoginReq(ip));
    expect(res.status).toBe(429);
    const data = await res.json() as { error: string };
    expect(data.error).toContain('Too many');
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });

  it('allows requests before limit is reached', async () => {
    const res = await erpLoginPost(makeErpLoginReq('1.2.3.4'));
    /* Returns 401 (invalid creds) not 429 */
    expect(res.status).not.toBe(429);
  });
});
