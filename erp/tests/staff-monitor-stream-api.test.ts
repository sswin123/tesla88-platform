import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/require_permission', () => ({ requirePermissionStrict: vi.fn() }));
vi.mock('pg', () => ({ Client: vi.fn() }));

import { requirePermissionStrict } from '@/lib/require_permission';
import { Client } from 'pg';
import { GET } from '@/app/api/staff/monitor/stream/route';

beforeEach(() => vi.clearAllMocks());

function makeReq() {
  const controller = new AbortController();
  return new Request('http://localhost/api/staff/monitor/stream', { signal: controller.signal });
}

describe('GET /api/staff/monitor/stream', () => {
  it('returns 401 without establishing a DB connection when not logged in', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: false, status: 401 });
    const res = await GET(makeReq() as never);
    expect(res.status).toBe(401);
    expect(Client).not.toHaveBeenCalled();
  });

  it('returns 403 without establishing a DB connection when permission denied', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: false, status: 403 });
    const res = await GET(makeReq() as never);
    expect(res.status).toBe(403);
    expect(Client).not.toHaveBeenCalled();
  });
});
