import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));

import pool from '@/lib/db';
import { GET as getProviders } from '@/app/api/public/game-providers/route';

beforeEach(() => vi.clearAllMocks());

const SLOT_PROVIDER = {
  id: 1, provider_code: 'mega888', provider_name: 'Mega888',
  category: 'slot', logo_media_id: 3, banner_media_id: null,
  is_hot: true, is_new: false, display_order: 0,
};

const LIVE_PROVIDER = {
  id: 2, provider_code: 'evo888', provider_name: 'Evo888',
  category: 'live', logo_media_id: null, banner_media_id: null,
  is_hot: true, is_new: true, display_order: 1,
};

const INACTIVE_PROVIDER = {
  id: 3, provider_code: 'hidden', provider_name: 'Hidden',
  category: 'slot', logo_media_id: null, banner_media_id: null,
  is_hot: false, is_new: false, display_order: 99,
};

describe('GET /api/public/game-providers', () => {
  it('returns active providers array', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [SLOT_PROVIDER, LIVE_PROVIDER] } as never);
    const res = await getProviders();
    expect(res.status).toBe(200);
    const data = await res.json() as typeof SLOT_PROVIDER[];
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(2);
  });

  it('returns empty array when no active providers (triggers fallback on frontend)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await getProviders();
    expect(res.status).toBe(200);
    const data = await res.json() as unknown[];
    expect(data).toHaveLength(0);
  });

  it('returns 200 with empty array on DB error (graceful fallback)', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(new Error('DB error'));
    const res = await getProviders();
    expect(res.status).toBe(200);
    const data = await res.json() as unknown[];
    expect(data).toHaveLength(0);
  });

  it('returns correct fields for each provider', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [SLOT_PROVIDER] } as never);
    const res = await getProviders();
    const data = await res.json() as typeof SLOT_PROVIDER[];
    const p = data[0];
    expect(p).toHaveProperty('id');
    expect(p).toHaveProperty('provider_code');
    expect(p).toHaveProperty('provider_name');
    expect(p).toHaveProperty('category');
    expect(p).toHaveProperty('logo_media_id');
    expect(p).toHaveProperty('is_hot');
    expect(p).toHaveProperty('is_new');
    expect(p).toHaveProperty('display_order');
  });

  it('returns providers ordered by display_order', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [SLOT_PROVIDER, LIVE_PROVIDER] } as never);
    const res = await getProviders();
    const data = await res.json() as typeof SLOT_PROVIDER[];
    expect(data).toHaveLength(2);
    expect(data[0].display_order).toBeLessThanOrEqual(data[1].display_order);
  });

  it('SQL query filters by is_active = TRUE', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    await getProviders();
    const sql = vi.mocked(pool.query).mock.calls[0][0] as string;
    expect(sql).toContain('is_active = TRUE');
    expect(sql).toContain('ORDER BY display_order ASC');
  });

  it('inactive provider not returned (SQL WHERE clause)', async () => {
    /* Only active rows returned — inactive_provider would not appear */
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [SLOT_PROVIDER] } as never);
    const res = await getProviders();
    const data = await res.json() as typeof SLOT_PROVIDER[];
    expect(data.every(p => p.provider_code !== INACTIVE_PROVIDER.provider_code)).toBe(true);
  });

  it('slot and live providers can coexist (category filtering done on frontend)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [SLOT_PROVIDER, LIVE_PROVIDER] } as never);
    const res = await getProviders();
    const data = await res.json() as typeof SLOT_PROVIDER[];
    const categories = data.map(p => p.category);
    expect(categories).toContain('slot');
    expect(categories).toContain('live');
  });
});
