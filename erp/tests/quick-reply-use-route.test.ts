import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  verifyJWT: vi.fn().mockResolvedValue({ sub: 1, username: 'admin1', role: 'ADMIN' }),
  COOKIE_NAME: 'token',
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => ({ value: 'tok' }) }),
}));
vi.mock('@/lib/repositories/support_repo', () => ({
  incrementQuickReplyUsage: vi.fn(),
}));
vi.mock('@/lib/permission_engine', () => ({
  can:             vi.fn().mockResolvedValue(true),
  invalidateCache: vi.fn(),
}));

import { POST } from '@/app/api/livechat/quick-replies/[id]/use/route';
import { incrementQuickReplyUsage } from '@/lib/repositories/support_repo';

beforeEach(() => vi.clearAllMocks());

const makeParams = (id: string) =>
  ({ params: Promise.resolve({ id }) }) as { params: Promise<{ id: string }> };

describe('POST /api/livechat/quick-replies/:id/use', () => {
  it('increments usage with correct id and username', async () => {
    vi.mocked(incrementQuickReplyUsage).mockResolvedValueOnce(undefined);
    const res = await POST(
      new NextRequest('http://localhost/api/livechat/quick-replies/5/use', { method: 'POST' }),
      makeParams('5'),
    );
    expect(res.status).toBe(200);
    const d = await res.json() as { ok: boolean };
    expect(d.ok).toBe(true);
    expect(incrementQuickReplyUsage).toHaveBeenCalledWith(5, 'admin1');
  });

  it('returns 400 for invalid id', async () => {
    const res = await POST(
      new NextRequest('http://localhost/api/livechat/quick-replies/abc/use', { method: 'POST' }),
      makeParams('abc'),
    );
    expect(res.status).toBe(400);
    expect(incrementQuickReplyUsage).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    const { cookies } = await import('next/headers');
    vi.mocked(cookies).mockResolvedValueOnce({ get: () => undefined } as never);
    const res = await POST(
      new NextRequest('http://localhost/api/livechat/quick-replies/1/use', { method: 'POST' }),
      makeParams('1'),
    );
    expect(res.status).toBe(401);
  });
});
