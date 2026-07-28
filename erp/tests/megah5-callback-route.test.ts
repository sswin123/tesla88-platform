import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock DB — use vi.fn() inline to avoid hoisting issues with outer variables
vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));

const mockGetAdapter = vi.fn();
vi.mock('@/lib/providers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/providers')>('@/lib/providers');
  return {
    ...actual,
    createGamingPlatform: () => ({
      brandManager: { getAdapter: mockGetAdapter },
    }),
  };
});

import pool from '@/lib/db';
import { POST } from '@/app/api/games/megah5/callback/[action]/route';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(action: string, body: object, headers?: Record<string, string>) {
  return new NextRequest(`http://localhost/api/games/megah5/callback/${action}`, {
    method: 'POST',
    body:   JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('POST /api/games/megah5/callback/[action]', () => {
  it('returns 200 JSON when adapter not available (maintenance mode)', async () => {
    // brand_providers lookup returns no active row → adapter not available
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);

    const res  = await POST(makeReq('authenticate', {}), { params: Promise.resolve({ action: 'authenticate' }) });
    const data = await res.json() as { error: number };
    expect(res.status).toBe(200);
    expect(data.error).toBe(8); // MAINTENANCE
  });

  it('returns 200 for unknown action', async () => {
    // Supply a mock adapter (action not in switch → returns error)
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ brand_code: 'TESLA88' }] } as never);
    mockGetAdapter.mockResolvedValueOnce({
      handleAuthenticateCallback: vi.fn().mockResolvedValue({ error: 0 }),
    });

    const res = await POST(makeReq('unknown_action', {}), { params: Promise.resolve({ action: 'unknown_action' }) });
    const data = await res.json() as { error: number };
    expect(res.status).toBe(200);
    expect(data.error).toBe(9); // SYSTEM_ERROR for unknown action
  });
});
