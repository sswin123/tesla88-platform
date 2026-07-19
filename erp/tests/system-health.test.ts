import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));
vi.mock('@/lib/require_permission', () => ({
  requirePermission: vi.fn().mockResolvedValue({ sub: 1, username: 'admin1', role: 'SUPER_ADMIN' }),
}));

import { GET } from '@/app/api/health/system/route';

describe('GET /api/health/system', () => {
  it('returns 200 with status ok', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe('ok');
  });

  it('does not expose database, version, services, or environment details', async () => {
    const res = await GET();
    const body = await res.json() as Record<string, unknown>;
    expect(body.database).toBeUndefined();
    expect(body.version).toBeUndefined();
    expect(body.services).toBeUndefined();
    expect(body.timestamp).toBeUndefined();
  });
});
