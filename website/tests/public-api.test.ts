import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));

import pool from '@/lib/db';
import { GET as getSettings }    from '@/app/api/public/settings/route';
import { GET as getPromotions }  from '@/app/api/public/promotions/route';
import { GET as getApk, POST as postApk } from '@/app/api/public/apk/route';

beforeEach(() => vi.clearAllMocks());

describe('GET /api/public/settings', () => {
  it('returns settings object', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        { key: 'site_brand_name', value: 'TestBrand' },
        { key: 'site_primary_color', value: '#FF0000' },
      ],
    } as never);
    const res = await getSettings();
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, string>;
    expect(data.site_brand_name).toBe('TestBrand');
  });
});

describe('GET /api/public/promotions', () => {
  it('returns array of active promotions', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 1, name: 'Welcome Bonus', bonus_value: '100', min_deposit: '50' }],
    } as never);
    const res = await getPromotions();
    expect(res.status).toBe(200);
    const data = await res.json() as unknown[];
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
  });

  it('returns empty array when no active promotions', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await getPromotions();
    const data = await res.json() as unknown[];
    expect(data).toHaveLength(0);
  });
});

describe('GET /api/public/apk', () => {
  it('returns null when no current APK', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await getApk();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toBeNull();
  });

  it('returns current APK info', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 1, version_name: '1.0.0', version_code: 1, is_current: true, download_count: 42 }],
    } as never);
    const res = await getApk();
    const data = await res.json() as { version_name: string; download_count: number };
    expect(data.version_name).toBe('1.0.0');
    expect(data.download_count).toBe(42);
  });
});

describe('POST /api/public/apk', () => {
  it('returns 400 when id missing', async () => {
    const req = new Request('http://localhost/', { method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json' } });
    const res = await postApk(req as never);
    expect(res.status).toBe(400);
  });

  it('returns 200 and increments count', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const req = new Request('http://localhost/', { method: 'POST', body: JSON.stringify({ id: 1 }), headers: { 'Content-Type': 'application/json' } });
    const res = await postApk(req as never);
    expect(res.status).toBe(200);
  });
});
