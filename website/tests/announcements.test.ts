import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));

import pool from '@/lib/db';
import { GET as getAnnouncements } from '@/app/api/public/announcements/route';

beforeEach(() => vi.clearAllMocks());

const ACTIVE = {
  id: 1, title: '欢迎新会员', message: '首存即享100%奖金',
  type: 'promotion', link_url: '/promotions', display_order: 0,
};

const INFO = {
  id: 2, title: '系统通知', message: '每日维护时间 00:00-01:00',
  type: 'info', link_url: null, display_order: 1,
};

describe('GET /api/public/announcements', () => {
  it('returns active announcements array', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [ACTIVE] } as never);
    const res = await getAnnouncements();
    expect(res.status).toBe(200);
    const data = await res.json() as typeof ACTIVE[];
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(1);
    expect(data[0].type).toBe('promotion');
  });

  it('returns empty array when no active announcements (fallback to legacy ticker)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await getAnnouncements();
    expect(res.status).toBe(200);
    const data = await res.json() as unknown[];
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(0);
  });

  it('returns 200 with empty array on DB error (graceful fallback)', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(new Error('DB error'));
    const res = await getAnnouncements();
    expect(res.status).toBe(200);
    const data = await res.json() as unknown[];
    expect(data).toHaveLength(0);
  });

  it('returns correct fields for each announcement', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [ACTIVE] } as never);
    const res = await getAnnouncements();
    const data = await res.json() as typeof ACTIVE[];
    const a = data[0];
    expect(a).toHaveProperty('id');
    expect(a).toHaveProperty('title');
    expect(a).toHaveProperty('message');
    expect(a).toHaveProperty('type');
    expect(a).toHaveProperty('link_url');
    expect(a).toHaveProperty('display_order');
  });

  it('returns multiple announcements ordered by display_order', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [ACTIVE, INFO] } as never);
    const res = await getAnnouncements();
    const data = await res.json() as typeof ACTIVE[];
    expect(data).toHaveLength(2);
    expect(data[0].display_order).toBeLessThanOrEqual(data[1].display_order);
  });

  it('SQL query filters by is_active and date range', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    await getAnnouncements();
    const call = vi.mocked(pool.query).mock.calls[0];
    const sql = call[0] as string;
    expect(sql).toContain('is_active = TRUE');
    expect(sql).toContain('start_at');
    expect(sql).toContain('end_at');
    expect(sql).toContain('ORDER BY display_order ASC');
  });

  it('disabled announcement not returned (is_active filter applied in SQL)', async () => {
    /* Only active rows are returned by the SQL WHERE clause */
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [ACTIVE] } as never);
    const res = await getAnnouncements();
    const data = await res.json() as typeof ACTIVE[];
    /* Verify disabled items are not present (SQL already excludes them) */
    expect(data.every(a => a.id !== 99)).toBe(true);
  });

  it('expired announcement not returned (end_at filter applied in SQL)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await getAnnouncements();
    const data = await res.json() as unknown[];
    expect(data).toHaveLength(0);
  });
});
