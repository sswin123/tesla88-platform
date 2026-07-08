import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));

import pool from '@/lib/db';
import { getBrand, invalidateBrandCache, BRAND_FALLBACK } from '@/lib/brand';

const DB_ROW = {
  brand_name: 'TestBrand',
  company_name: 'TestBrand Sdn Bhd',
  tagline: 'Best casino',
  logo_media_id: 42,
  favicon_media_id: 7,
  primary_color: '#ff0000',
  secondary_color: '#cc0000',
  theme_mode: 'dark',
  website_domain: 'https://testbrand.com',
  api_domain: null,
  support_whatsapp: '+60111222333',
  support_telegram: null,
  telegram_channel: '@testbrand',
  facebook_url: null,
  seo_title: 'TestBrand Casino',
  seo_description: 'Play and win',
  seo_keywords: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  invalidateBrandCache(); // reset 60s cache between tests
});

// ── 测试 1：website 加载品牌数据 ─────────────────────────────────────────

describe('getBrand() 加载品牌数据', () => {
  it('从 DB 读取 brand_name、logo、SEO 字段', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [DB_ROW] } as never);
    const brand = await getBrand();
    expect(brand.brand_name).toBe('TestBrand');
    expect(brand.logo_media_id).toBe(42);
    expect(brand.seo_title).toBe('TestBrand Casino');
    expect(brand.primary_color).toBe('#ff0000');
  });

  it('60s 内多次调用只查一次 DB', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [DB_ROW] } as never);
    await getBrand();
    await getBrand();
    await getBrand();
    expect(vi.mocked(pool.query)).toHaveBeenCalledTimes(1);
  });
});

// ── 测试 2：fallback 正常工作 ─────────────────────────────────────────────

describe('getBrand() fallback', () => {
  it('DB 返回空行时使用 SSWIN88 默认值', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const brand = await getBrand();
    expect(brand.brand_name).toBe('SSWIN88');
    expect(brand.primary_color).toBe('#1d4ed8');
  });

  it('DB 抛出异常时返回 fallback 不崩溃', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(new Error('DB offline'));
    const brand = await getBrand();
    expect(brand.brand_name).toBe('SSWIN88');
    expect(brand).toEqual(BRAND_FALLBACK);
  });
});

// ── 测试 3：logo media_id 正确返回 ───────────────────────────────────────

describe('logo_media_id 字段', () => {
  it('有 logo 时返回数字 media id', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [DB_ROW] } as never);
    const brand = await getBrand();
    expect(brand.logo_media_id).toBe(42);
    expect(typeof brand.logo_media_id).toBe('number');
  });

  it('无 logo 时 logo_media_id 为 null', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ ...DB_ROW, logo_media_id: null }],
    } as never);
    const brand = await getBrand();
    expect(brand.logo_media_id).toBeNull();
  });
});

// ── 测试 4：SEO 字段更新 ─────────────────────────────────────────────────

describe('SEO 字段', () => {
  it('seo_title 和 seo_description 从 brand 读取', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [DB_ROW] } as never);
    const brand = await getBrand();
    expect(brand.seo_title).toBe('TestBrand Casino');
    expect(brand.seo_description).toBe('Play and win');
  });

  it('SEO 字段为空时返回 null', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ ...DB_ROW, seo_title: null, seo_description: null }],
    } as never);
    const brand = await getBrand();
    expect(brand.seo_title).toBeNull();
    expect(brand.seo_description).toBeNull();
  });
});

// ── 测试 5：CSS 颜色变量字段 ─────────────────────────────────────────────

describe('颜色变量字段', () => {
  it('primary_color 和 secondary_color 正确返回', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [DB_ROW] } as never);
    const brand = await getBrand();
    expect(brand.primary_color).toBe('#ff0000');
    expect(brand.secondary_color).toBe('#cc0000');
  });

  it('fallback 颜色值为 SSWIN88 默认蓝色', async () => {
    expect(BRAND_FALLBACK.primary_color).toBe('#1d4ed8');
    expect(BRAND_FALLBACK.secondary_color).toBe('#1e40af');
  });
});

// ── 测试 6：联系信息字段 ─────────────────────────────────────────────────

describe('联系信息字段', () => {
  it('support_whatsapp 和 telegram_channel 正确返回', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [DB_ROW] } as never);
    const brand = await getBrand();
    expect(brand.support_whatsapp).toBe('+60111222333');
    expect(brand.telegram_channel).toBe('@testbrand');
  });
});
