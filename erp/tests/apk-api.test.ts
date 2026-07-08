import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn(), connect: vi.fn() } }));
vi.mock('@/lib/auth', () => ({
  verifyJWT:   vi.fn().mockResolvedValue({ sub: 1, username: 'admin', role: 'ADMIN', iat: 0, exp: 9999999999 }),
  COOKIE_NAME: 'token',
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => ({ value: 'tok' }) }),
}));
vi.mock('@/lib/permission_engine', () => ({
  can:             vi.fn().mockResolvedValue(true),
  invalidateCache: vi.fn(),
}));

import pool from '@/lib/db';
import { GET, POST } from '@/app/api/apk/route';
import { PATCH, DELETE } from '@/app/api/apk/[id]/route';

beforeEach(() => vi.clearAllMocks());

function makeReq(method: string, body?: unknown) {
  return new Request('http://localhost/api/apk', {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'Content-Type': 'application/json' } : {},
  });
}

function makeIdReq(method: string, id: string, body?: unknown) {
  return new Request(`http://localhost/api/apk/${id}`, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'Content-Type': 'application/json' } : {},
  });
}

describe('GET /api/apk', () => {
  it('returns list of APK versions', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 1, version_name: '1.0.0', version_code: 1, is_current: true, download_count: 0, created_at: new Date().toISOString() }],
    } as never);
    const res = await GET(makeReq('GET') as never);
    expect(res.status).toBe(200);
    const data = await res.json() as unknown[];
    expect(Array.isArray(data)).toBe(true);
  });
});

describe('POST /api/apk', () => {
  it('returns 400 when version_name missing', async () => {
    const res = await POST(makeReq('POST', { version_code: 1, min_android: '6.0' }) as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 when version_code missing', async () => {
    const res = await POST(makeReq('POST', { version_name: '1.0.0', min_android: '6.0' }) as never);
    expect(res.status).toBe(400);
  });

  it('creates APK version and returns 201', async () => {
    const mockClient = { query: vi.fn(), release: vi.fn() };
    vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as never);
    mockClient.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ id: 1, version_name: '1.0.0' }] })
      .mockResolvedValueOnce(undefined);
    const res = await POST(makeReq('POST', { version_name: '1.0.0', version_code: 1, min_android: '6.0', is_current: true }) as never);
    expect(res.status).toBe(201);
  });
});

describe('PATCH /api/apk/[id]', () => {
  it('returns 400 when nothing to update', async () => {
    const mockClient = { query: vi.fn(), release: vi.fn() };
    vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as never);
    mockClient.query.mockResolvedValueOnce(undefined); // BEGIN
    const res = await PATCH(makeIdReq('PATCH', '1', {}) as never, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(400);
  });

  it('returns 404 when APK not found', async () => {
    const mockClient = { query: vi.fn(), release: vi.fn() };
    vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as never);
    mockClient.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(undefined);
    const res = await PATCH(makeIdReq('PATCH', '99', { is_current: true }) as never, { params: Promise.resolve({ id: '99' }) });
    expect(res.status).toBe(404);
  });

  it('updates is_current and returns 200', async () => {
    const mockClient = { query: vi.fn(), release: vi.fn() };
    vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as never);
    mockClient.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ id: 1, is_current: true }] })
      .mockResolvedValueOnce(undefined);
    const res = await PATCH(makeIdReq('PATCH', '1', { is_current: true }) as never, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/apk/[id]', () => {
  it('returns 404 when APK not found', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await DELETE(makeIdReq('DELETE', '99') as never, { params: Promise.resolve({ id: '99' }) });
    expect(res.status).toBe(404);
  });

  it('returns 409 when deleting current version', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 1, is_current: true }] } as never);
    const res = await DELETE(makeIdReq('DELETE', '1') as never, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(409);
  });

  it('deletes APK and returns 200', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 2, is_current: false }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    const res = await DELETE(makeIdReq('DELETE', '2') as never, { params: Promise.resolve({ id: '2' }) });
    expect(res.status).toBe(200);
  });
});
