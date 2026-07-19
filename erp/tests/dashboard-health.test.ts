import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  default: { query: vi.fn() },
}));

vi.mock('@/lib/require_permission', () => ({
  requirePermission: vi.fn().mockResolvedValue({ sub: 1, username: 'admin1', role: 'SUPER_ADMIN' }),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import pool from '@/lib/db';
import { GET } from '@/app/api/dashboard/health/route';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BOT_RELAY_URL = 'http://relay:8090';
});

describe('GET /api/dashboard/health', () => {
  it('returns 200 with all health components', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ ok: 1 }] } as never)        // DB ping
      .mockResolvedValueOnce({ rows: [{ files: 42, bytes: 1024 }] } as never); // storage
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });       // relay

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data).toHaveProperty('database');
    expect(data).toHaveProperty('relay');
    expect(data).toHaveProperty('storage');
    expect(data).toHaveProperty('timestamp');
  });

  it('marks database as ok when ping succeeds', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ ok: 1 }] } as never)
      .mockResolvedValueOnce({ rows: [{ files: 0, bytes: 0 }] } as never);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const res = await GET();
    const data = await res.json() as { database: { ok: boolean; latency_ms: number } };
    expect(data.database.ok).toBe(true);
    expect(typeof data.database.latency_ms).toBe('number');
  });

  it('marks database as not ok when ping fails', async () => {
    vi.mocked(pool.query)
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce({ rows: [{ files: 0, bytes: 0 }] } as never);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const res = await GET();
    const data = await res.json() as { database: { ok: boolean } };
    expect(data.database.ok).toBe(false);
  });

  it('marks relay as ok when it returns 200', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ ok: 1 }] } as never)
      .mockResolvedValueOnce({ rows: [{ files: 0, bytes: 0 }] } as never);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const res = await GET();
    const data = await res.json() as { relay: { ok: boolean } };
    expect(data.relay.ok).toBe(true);
  });

  it('marks relay as ok when it returns 404 (relay UP, endpoint not implemented)', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ ok: 1 }] } as never)
      .mockResolvedValueOnce({ rows: [{ files: 0, bytes: 0 }] } as never);
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const res = await GET();
    const data = await res.json() as { relay: { ok: boolean } };
    expect(data.relay.ok).toBe(true);
  });

  it('marks relay as not ok on network error', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ ok: 1 }] } as never)
      .mockResolvedValueOnce({ rows: [{ files: 0, bytes: 0 }] } as never);
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const res = await GET();
    const data = await res.json() as { relay: { ok: boolean } };
    expect(data.relay.ok).toBe(false);
  });

  it('returns storage file count and bytes', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ ok: 1 }] } as never)
      .mockResolvedValueOnce({ rows: [{ files: 15, bytes: 204800 }] } as never);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const res = await GET();
    const data = await res.json() as { storage: { ok: boolean; total_files: number; total_bytes: number } };
    expect(data.storage.ok).toBe(true);
    expect(data.storage.total_files).toBe(15);
    expect(data.storage.total_bytes).toBe(204800);
  });
});
