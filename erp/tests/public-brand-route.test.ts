import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));

import pool from '@/lib/db';
import { GET } from '@/app/api/public/brand/route';

const BRAND_ROW = {
  brand_name: 'Opulux',
  company_name: 'Opulux Sdn Bhd',
  tagline: null,
  logo_media_id: null,
  favicon_media_id: null,
  primary_color: '#1d4ed8',
  secondary_color: '#1e40af',
  theme_mode: 'light',
  website_domain: 'https://opulux.com',
  api_domain: null,
  support_whatsapp: '+60123456789',
  support_telegram: null,
  telegram_channel: '@opulux',
  facebook_url: null,
  seo_title: 'Opulux Online Casino',
  seo_description: 'Best online casino',
  seo_keywords: null,
};

beforeEach(() => vi.clearAllMocks());

// ── 测试 1：返回公开品牌字段 ─────────────────────────────────────────────

describe('GET /api/public/brand 返回公开字段', () => {
  it('返回 brand_name、colors、seo 等公开字段', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [BRAND_ROW] } as never);
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json() as typeof BRAND_ROW;
    expect(data.brand_name).toBe('Opulux');
    expect(data.primary_color).toBe('#1d4ed8');
    expect(data.seo_title).toBe('Opulux Online Casino');
    expect(data.support_whatsapp).toBe('+60123456789');
    expect(data.telegram_channel).toBe('@opulux');
  });
});

// ── 测试 2：不包含私有字段 ────────────────────────────────────────────────

describe('GET /api/public/brand 隐藏私有字段', () => {
  it('响应不含 id、updated_by、created_at、updated_at', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [BRAND_ROW] } as never);
    const res = await GET();
    const data = await res.json() as Record<string, unknown>;
    expect(data).not.toHaveProperty('id');
    expect(data).not.toHaveProperty('updated_by');
    expect(data).not.toHaveProperty('created_at');
    expect(data).not.toHaveProperty('updated_at');
  });
});

// ── 测试 3：DB 无行时返回 404 ─────────────────────────────────────────────

describe('GET /api/public/brand DB 无数据时', () => {
  it('返回 404', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await GET();
    expect(res.status).toBe(404);
  });
});

// ── 测试 4：DB 错误时返回 500 ─────────────────────────────────────────────

describe('GET /api/public/brand DB 故障时', () => {
  it('返回 500', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(new Error('DB offline'));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
