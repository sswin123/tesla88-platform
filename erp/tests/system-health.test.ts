import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));
vi.mock('@/lib/require_permission', () => ({
  requirePermission: vi.fn().mockResolvedValue({ sub: 1, username: 'admin1', role: 'SUPER_ADMIN' }),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import pool from '@/lib/db';
import { GET } from '@/app/api/health/system/route';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 1 } as never);
  mockFetch.mockResolvedValue({ ok: true, status: 200 } as never);
});

describe('GET /api/health/system', () => {
  it('returns 200 with database, services, version, timestamp', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as {
      database: { ok: boolean; latency_ms: number };
      services: { erp: { ok: boolean }; website: { ok: boolean }; bot: { ok: boolean } };
      version: string;
      timestamp: string;
    };

    expect(body.database).toBeDefined();
    expect(typeof body.database.ok).toBe('boolean');
    expect(typeof body.database.latency_ms).toBe('number');
    expect(body.services.erp.ok).toBe(true);
    expect(body.services.website).toBeDefined();
    expect(body.services.bot).toBeDefined();
    expect(typeof body.version).toBe('string');
    expect(typeof body.timestamp).toBe('string');
  });

  it('returns database.ok=true when DB is healthy', async () => {
    const res = await GET();
    const body = await res.json() as { database: { ok: boolean } };
    expect(body.database.ok).toBe(true);
  });

  it('returns database.ok=false when DB throws', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(new Error('connection refused'));

    const res = await GET();
    const body = await res.json() as { database: { ok: boolean; error?: string } };
    expect(body.database.ok).toBe(false);
    expect(body.database.error).toContain('connection refused');
  });

  it('shows website offline when WEBSITE_URL is not configured', async () => {
    // WEBSITE_URL env var is not set in test environment — module reads '' as default
    const savedUrl = process.env.WEBSITE_URL;
    delete process.env.WEBSITE_URL;

    const res = await GET();
    const body = await res.json() as { services: { website: { ok: boolean; error?: string } } };
    expect(body.services.website.ok).toBe(false);
    expect(body.services.website.error).toContain('not configured');

    if (savedUrl !== undefined) process.env.WEBSITE_URL = savedUrl;
  });

  it('reports bot offline when relay fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const res = await GET();
    const body = await res.json() as { services: { bot: { ok: boolean } } };
    expect(body.services.bot.ok).toBe(false);
  });

  it('erp service is always ok with zero latency', async () => {
    const res = await GET();
    const body = await res.json() as { services: { erp: { ok: boolean; latency_ms: number } } };
    expect(body.services.erp.ok).toBe(true);
    expect(body.services.erp.latency_ms).toBe(0);
  });
});
