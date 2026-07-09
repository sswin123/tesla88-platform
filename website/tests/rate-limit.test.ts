import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rateLimit, getClientIp, _resetRateLimitStore } from '@/lib/rate-limit';

/* ── Unit tests for the rate limiter ───────────────────────── */

beforeEach(() => {
  _resetRateLimitStore();
  vi.useRealTimers();
});

describe('rateLimit()', () => {
  it('allows requests within the limit', () => {
    for (let i = 0; i < 5; i++) {
      expect(rateLimit('test-key', 5, 60_000).ok).toBe(true);
    }
  });

  it('blocks the 6th request after limit of 5', () => {
    for (let i = 0; i < 5; i++) rateLimit('key', 5, 60_000);
    const result = rateLimit('key', 5, 60_000);
    expect(result.ok).toBe(false);
    expect(result.retryAfterSecs).toBeGreaterThan(0);
  });

  it('returns retryAfterSecs close to window duration', () => {
    for (let i = 0; i < 3; i++) rateLimit('k', 3, 15 * 60_000);
    const { ok, retryAfterSecs } = rateLimit('k', 3, 15 * 60_000);
    expect(ok).toBe(false);
    expect(retryAfterSecs).toBeGreaterThan(14 * 60);
    expect(retryAfterSecs).toBeLessThanOrEqual(15 * 60);
  });

  it('resets after window expires', () => {
    vi.useFakeTimers();
    for (let i = 0; i < 5; i++) rateLimit('expire-key', 5, 1_000);
    expect(rateLimit('expire-key', 5, 1_000).ok).toBe(false);

    vi.advanceTimersByTime(2_000);
    expect(rateLimit('expire-key', 5, 1_000).ok).toBe(true);
  });

  it('isolates different keys independently', () => {
    for (let i = 0; i < 5; i++) rateLimit('key-a', 5, 60_000);
    expect(rateLimit('key-a', 5, 60_000).ok).toBe(false);
    expect(rateLimit('key-b', 5, 60_000).ok).toBe(true);
  });
});

describe('getClientIp()', () => {
  const makeHeaders = (map: Record<string, string>) => ({
    get: (name: string) => map[name] ?? null,
  });

  it('reads x-forwarded-for first IP', () => {
    expect(getClientIp({ headers: makeHeaders({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }) }))
      .toBe('1.2.3.4');
  });

  it('falls back to x-real-ip', () => {
    expect(getClientIp({ headers: makeHeaders({ 'x-real-ip': '9.9.9.9' }) }))
      .toBe('9.9.9.9');
  });

  it('returns unknown when no IP headers', () => {
    expect(getClientIp({ headers: makeHeaders({}) })).toBe('unknown');
  });
});

/* ── Integration: login route returns 429 ───────────────────── */

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));
vi.mock('@/lib/auth', () => ({
  comparePassword: vi.fn().mockResolvedValue(false),
  signMemberJWT:   vi.fn().mockResolvedValue('tok'),
  COOKIE_NAME:     'member_session',
  COOKIE_MAXAGE:   604800,
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => null }),
}));

import { POST as loginPost } from '@/app/api/auth/login/route';
import { POST as registerPost } from '@/app/api/auth/register/route';
import { NextRequest } from 'next/server';
import pool from '@/lib/db';

function makeLoginReq(ip = '10.0.0.1') {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ phone: '0123456789', password: 'wrong' }),
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
  });
}

describe('Website login rate limit', () => {
  beforeEach(() => {
    _resetRateLimitStore();
    vi.clearAllMocks();
  });

  it('returns 429 after 5 failed attempts from same IP', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);

    const ip = '192.168.1.100';
    for (let i = 0; i < 5; i++) {
      await loginPost(makeLoginReq(ip));
    }
    const res = await loginPost(makeLoginReq(ip));
    expect(res.status).toBe(429);
    const data = await res.json() as { error: string };
    expect(data.error).toContain('频繁');
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });

  it('allows login from different IPs', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);

    for (let i = 0; i < 5; i++) {
      await loginPost(makeLoginReq(`10.0.0.${i + 1}`));
    }
    /* Each IP only made 1 call — should all still be within limit */
    const res = await loginPost(makeLoginReq('10.0.0.10'));
    expect(res.status).not.toBe(429);
  });
});

describe('Website register rate limit', () => {
  beforeEach(() => {
    _resetRateLimitStore();
    vi.clearAllMocks();
  });

  it('returns 429 after 3 register attempts from same IP', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);

    const ip = '192.168.2.1';
    const makeReq = () => new NextRequest('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ phone: '0123456789', password: 'pass1234' }),
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    });

    for (let i = 0; i < 3; i++) await registerPost(makeReq());
    const res = await registerPost(makeReq());
    expect(res.status).toBe(429);
  });
});
