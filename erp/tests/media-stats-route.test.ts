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
  getMediaStats: vi.fn().mockResolvedValue({
    total: 5,
    totalSize: 12345,
    byType: { IMAGE: 3, VIDEO: 2 },
  }),
  getRecentUploads: vi.fn().mockResolvedValue([{ id: 99 }]),
}));

vi.mock('@/lib/media', () => ({
  mediaService: {
    getStorageProvider: vi.fn().mockReturnValue({
      health: vi.fn().mockResolvedValue('ONLINE'),
    }),
  },
}));
vi.mock('@/lib/permission_engine', () => ({
  can:             vi.fn().mockResolvedValue(true),
  invalidateCache: vi.fn(),
}));

import { GET } from '@/app/api/media/stats/route';
import { getRecentUploads } from '@/lib/repositories/media_repo';

describe('GET /api/media/stats', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no cookie', async () => {
    const { cookies } = await import('next/headers');
    vi.mocked(cookies).mockResolvedValueOnce({ get: () => undefined } as never);
    const res = await GET(new NextRequest('http://localhost/api/media/stats'));
    expect(res.status).toBe(401);
  });

  it('returns stats with storage health', async () => {
    const res = await GET(new NextRequest('http://localhost/api/media/stats'));
    expect(res.status).toBe(200);
    const body = await res.json() as {
      totalFiles: number; totalSize: number;
      byType: Record<string, number>; storageHealth: string;
      recentUploads: unknown[];
    };
    expect(body.totalFiles).toBe(5);
    expect(body.totalSize).toBe(12345);
    expect(body.byType).toEqual({ IMAGE: 3, VIDEO: 2 });
    expect(body.storageHealth).toBe('ONLINE');
    expect(body.recentUploads).toHaveLength(1);
  });

  it('calls getRecentUploads with limit 6', async () => {
    await GET(new NextRequest('http://localhost/api/media/stats'));
    expect(vi.mocked(getRecentUploads)).toHaveBeenCalledWith(6);
  });

  it('returns OFFLINE when storage health throws', async () => {
    const { mediaService } = await import('@/lib/media');
    vi.mocked(mediaService.getStorageProvider).mockReturnValueOnce({
      health: vi.fn().mockRejectedValue(new Error('disk full')),
    } as never);
    const res = await GET(new NextRequest('http://localhost/api/media/stats'));
    const body = await res.json() as { storageHealth: string };
    expect(body.storageHealth).toBe('OFFLINE');
  });
});
