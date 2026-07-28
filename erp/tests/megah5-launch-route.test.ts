// erp/tests/megah5-launch-route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock DB — use vi.fn() inline to avoid hoisting issues with outer variables
vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));

// Mock BrandProviderManager
const mockGetAdapter = vi.fn();
const mockBrandManager = { getAdapter: mockGetAdapter };
vi.mock('@/lib/providers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/providers')>('@/lib/providers');
  return {
    ...actual,
    createGamingPlatform: () => ({ brandManager: mockBrandManager }),
  };
});

// Mock 918KISS legacy path
vi.mock('@/lib/gaming', () => ({
  getKiss918Adapter: vi.fn().mockResolvedValue(null),
}));

import pool from '@/lib/db';
import { POST } from '@/app/api/games/launch/route';

const SERVICE_SECRET = 'test-secret';
process.env.REVALIDATE_SECRET = SERVICE_SECRET;

function makeReq(body: object) {
  return new NextRequest('http://localhost/api/games/launch', {
    method: 'POST',
    body:   JSON.stringify(body),
    headers: {
      'Content-Type':     'application/json',
      'X-Service-Secret': SERVICE_SECRET,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/games/launch — MEGAH5', () => {
  it('returns 503 if no active brand-provider config', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 2, code: 'MEGAH5', display_name: 'Mega888H5', status: 'ACTIVE', website_launch_mode: 'LOBBY' }] } as never)
      .mockResolvedValueOnce({ rows: [{ id: 10, first_name: 'Tester', phone: null }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never); // no brand-provider row

    const res  = await POST(makeReq({ user_id: 10, provider_code: 'MEGAH5' }));
    const data = await res.json() as { error: string };
    expect(res.status).toBe(503);
    expect(data.error).toMatch(/no active brand configuration/i);
  });

  it('returns 404 for unknown provider code', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never); // provider not found
    const res = await POST(makeReq({ user_id: 1, provider_code: 'FAKE_PROVIDER' }));
    expect(res.status).toBe(404);
  });

  it('returns 403 without service secret', async () => {
    const req = new NextRequest('http://localhost/api/games/launch', {
      method: 'POST',
      body:   JSON.stringify({ user_id: 1, provider_code: 'MEGAH5' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});
