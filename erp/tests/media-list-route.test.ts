import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  verifyJWT: vi.fn().mockResolvedValue({ sub: 1, role: 'ADMIN' }),
  COOKIE_NAME: 'erp_token',
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => ({ value: 'tok' }) }),
}));

vi.mock('@/lib/repositories/media_repo', () => ({
  listMediaFiltered: vi.fn().mockResolvedValue({ records: [], total: 0 }),
}));

import { GET } from '@/app/api/media/route';
import { listMediaFiltered } from '@/lib/repositories/media_repo';

describe('GET /api/media', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no cookie', async () => {
    const { cookies } = await import('next/headers');
    vi.mocked(cookies).mockResolvedValueOnce({ get: () => undefined } as never);
    const res = await GET(new NextRequest('http://localhost/api/media'));
    expect(res.status).toBe(401);
  });

  it('returns paginated list with default params', async () => {
    vi.mocked(listMediaFiltered).mockResolvedValueOnce({
      records: [{ id: 1, displayName: 'photo.jpg' } as never],
      total: 1,
    });
    const res = await GET(new NextRequest('http://localhost/api/media'));
    expect(res.status).toBe(200);
    const body = await res.json() as { media: unknown[]; total: number; page: number; limit: number };
    expect(body.total).toBe(1);
    expect(body.media).toHaveLength(1);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
  });

  it('forwards search param', async () => {
    vi.mocked(listMediaFiltered).mockResolvedValueOnce({ records: [], total: 0 });
    await GET(new NextRequest('http://localhost/api/media?search=cat'));
    expect(vi.mocked(listMediaFiltered)).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'cat' })
    );
  });

  it('forwards type filter param', async () => {
    vi.mocked(listMediaFiltered).mockResolvedValueOnce({ records: [], total: 0 });
    await GET(new NextRequest('http://localhost/api/media?type=IMAGE'));
    expect(vi.mocked(listMediaFiltered)).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: 'IMAGE' })
    );
  });

  it('defaults sort to newest', async () => {
    vi.mocked(listMediaFiltered).mockResolvedValueOnce({ records: [], total: 0 });
    await GET(new NextRequest('http://localhost/api/media'));
    expect(vi.mocked(listMediaFiltered)).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'newest' })
    );
  });

  it('falls back to newest for unknown sort value', async () => {
    vi.mocked(listMediaFiltered).mockResolvedValueOnce({ records: [], total: 0 });
    await GET(new NextRequest('http://localhost/api/media?sort=hacked'));
    expect(vi.mocked(listMediaFiltered)).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'newest' })
    );
  });

  it('caps limit at 100', async () => {
    vi.mocked(listMediaFiltered).mockResolvedValueOnce({ records: [], total: 0 });
    await GET(new NextRequest('http://localhost/api/media?limit=9999'));
    expect(vi.mocked(listMediaFiltered)).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 })
    );
  });

  it('computes offset from page', async () => {
    vi.mocked(listMediaFiltered).mockResolvedValueOnce({ records: [], total: 0 });
    await GET(new NextRequest('http://localhost/api/media?page=3&limit=10'));
    expect(vi.mocked(listMediaFiltered)).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 20, limit: 10 })
    );
    // Guard: page number must not leak into the repo call
    const call = vi.mocked(listMediaFiltered).mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(call).not.toHaveProperty('page');
  });
});
