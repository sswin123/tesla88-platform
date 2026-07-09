import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));

vi.mock('@/lib/auth', () => ({
  verifyJWT:   vi.fn().mockResolvedValue({ sub: 1, username: 'admin', role: 'SUPER_ADMIN', iat: 0, exp: 9999999999 }),
  COOKIE_NAME: 'erp_session',
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => ({ value: 'tok' }) }),
}));

import pool from '@/lib/db';
import { GET, DELETE, POST } from '@/app/api/system/error-logs/route';

beforeEach(() => vi.clearAllMocks());

function makeReq(body: unknown) {
  return new Request('http://localhost/', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('GET /api/system/error-logs', () => {
  it('returns 200 with error log array', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        { id: 1, service: 'erp', level: 'error', message: 'DB timeout', metadata: null, created_at: '2026-07-01T00:00:00Z' },
        { id: 2, service: 'bot', level: 'warn',  message: 'Slow response', metadata: { ms: 3000 }, created_at: '2026-07-01T01:00:00Z' },
      ],
    } as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json() as { id: number; service: string; level: string }[];
    expect(data).toHaveLength(2);
    expect(data[0].service).toBe('erp');
    expect(data[1].level).toBe('warn');
  });

  it('returns 401 when not SUPER_ADMIN', async () => {
    const { verifyJWT } = await import('@/lib/auth');
    vi.mocked(verifyJWT).mockResolvedValueOnce({ sub: 2, username: 'staff', role: 'ADMIN', iat: 0, exp: 9999 } as never);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns empty array when no logs', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json() as unknown[];
    expect(data).toHaveLength(0);
  });
});

describe('DELETE /api/system/error-logs', () => {
  it('returns 200 with deleted count', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rowCount: 42 } as never);
    const res = await DELETE();
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; deleted: number };
    expect(body.ok).toBe(true);
    expect(body.deleted).toBe(42);
  });

  it('returns 401 when not authenticated', async () => {
    const { verifyJWT } = await import('@/lib/auth');
    vi.mocked(verifyJWT).mockResolvedValueOnce(null as never);
    const res = await DELETE();
    expect(res.status).toBe(401);
  });
});

describe('POST /api/system/error-logs', () => {
  it('returns 200 when log is created', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
    const res = await POST(makeReq({ service: 'website', level: 'error', message: 'Payment timeout' }) as never);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('returns 400 when service is missing', async () => {
    const res = await POST(makeReq({ level: 'error', message: 'test' }) as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 when message is missing', async () => {
    const res = await POST(makeReq({ service: 'bot' }) as never);
    expect(res.status).toBe(400);
  });
});
