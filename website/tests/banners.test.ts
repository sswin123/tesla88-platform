import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));

import pool from '@/lib/db';
import { GET as getBanners } from '@/app/api/public/banners/route';

beforeEach(() => vi.clearAllMocks());

const ACTIVE_BANNER = {
  id: 1,
  title: 'Welcome Bonus',
  description: 'Get 100% bonus',
  image_media_id: 5,
  mobile_image_media_id: null,
  link_url: '/register',
  button_text: '立即领取',
  display_order: 0,
};

const INACTIVE_BANNER = { ...ACTIVE_BANNER, id: 2, title: 'Inactive', is_active: false };

describe('GET /api/public/banners', () => {
  it('returns active banners array', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [ACTIVE_BANNER] } as never);
    const res = await getBanners();
    expect(res.status).toBe(200);
    const data = await res.json() as typeof ACTIVE_BANNER[];
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(1);
    expect(data[0].title).toBe('Welcome Bonus');
  });

  it('returns empty array when no active banners', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await getBanners();
    expect(res.status).toBe(200);
    const data = await res.json() as unknown[];
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(0);
  });

  it('returns 200 with empty array on DB error (graceful fallback)', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(new Error('DB connection failed'));
    const res = await getBanners();
    expect(res.status).toBe(200);
    const data = await res.json() as unknown[];
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(0);
  });

  it('returns correct fields for each banner', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [ACTIVE_BANNER] } as never);
    const res = await getBanners();
    const data = await res.json() as typeof ACTIVE_BANNER[];
    const b = data[0];
    expect(b).toHaveProperty('id');
    expect(b).toHaveProperty('title');
    expect(b).toHaveProperty('description');
    expect(b).toHaveProperty('image_media_id');
    expect(b).toHaveProperty('mobile_image_media_id');
    expect(b).toHaveProperty('link_url');
    expect(b).toHaveProperty('button_text');
    expect(b).toHaveProperty('display_order');
  });

  it('returns multiple banners ordered by display_order', async () => {
    const b1 = { ...ACTIVE_BANNER, id: 1, display_order: 0 };
    const b2 = { ...ACTIVE_BANNER, id: 2, title: 'Second Banner', display_order: 1 };
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [b1, b2] } as never);
    const res = await getBanners();
    const data = await res.json() as typeof ACTIVE_BANNER[];
    expect(data).toHaveLength(2);
    expect(data[0].display_order).toBeLessThanOrEqual(data[1].display_order);
  });

  it('SQL query filters by is_active and date range', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    await getBanners();
    const call = vi.mocked(pool.query).mock.calls[0];
    const sql = call[0] as string;
    expect(sql).toContain('is_active = TRUE');
    expect(sql).toContain('start_at');
    expect(sql).toContain('end_at');
    expect(sql).toContain('ORDER BY display_order ASC');
  });
});
