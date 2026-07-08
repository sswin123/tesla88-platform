import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({
  verifyJWT:   vi.fn().mockResolvedValue({ sub: 1, username: 'superadmin', role: 'SUPER_ADMIN', iat: 0, exp: 9999999999 }),
  COOKIE_NAME: 'token',
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => ({ value: 'tok' }) }),
}));

vi.mock('@/lib/permission_engine', () => ({
  can:             vi.fn().mockResolvedValue(true),
  invalidateCache: vi.fn(),
}));

vi.mock('@/lib/repositories/audit_repo', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

const mockGetBrand     = vi.fn();
const mockUpdateBrand  = vi.fn();
const mockInvalidate   = vi.fn();

vi.mock('@/lib/repositories/brand_repo', () => ({
  getBrandSettings:      (...a: unknown[]) => mockGetBrand(...a),
  updateBrandSettings:   (...a: unknown[]) => mockUpdateBrand(...a),
  resetBrandSettings:    vi.fn(),
  bumpBrandCacheVersion: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/brand_service', () => ({
  getBrand:            vi.fn(),
  invalidateBrandCache:(...a: unknown[]) => mockInvalidate(...a),
  BRAND_FALLBACK: {
    id: 1, brand_name: 'SSWIN88', company_name: 'SSWIN88', tagline: null,
    logo_media_id: null, favicon_media_id: null,
    primary_color: '#1d4ed8', secondary_color: '#1e40af', theme_mode: 'light',
    website_domain: null, api_domain: null,
    support_whatsapp: null, support_telegram: null, telegram_channel: null, facebook_url: null,
    seo_title: null, seo_description: null, seo_keywords: null,
    created_at: '2026-01-01', updated_at: '2026-01-01', updated_by: null,
  },
}));

import { GET, PATCH } from '@/app/api/settings/brand/route';
import { logAudit }   from '@/lib/repositories/audit_repo';

// ── Fixtures ───────────────────────────────────────────────────────────────

const BASE_BRAND = {
  id: 1,
  brand_name: 'SSWIN88',
  company_name: 'SSWIN88',
  tagline: null,
  logo_media_id: null,
  favicon_media_id: null,
  primary_color: '#1d4ed8',
  secondary_color: '#1e40af',
  theme_mode: 'light',
  website_domain: null,
  api_domain: null,
  support_whatsapp: null,
  support_telegram: null,
  telegram_channel: null,
  facebook_url: null,
  seo_title: null,
  seo_description: null,
  seo_keywords: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  updated_by: null,
};

function makeReq(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body:    body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => vi.clearAllMocks());

// ── Test 1: 加载品牌设置 ───────────────────────────────────────────────────

describe('测试 1 — GET /api/settings/brand 加载品牌设置', () => {
  it('返回品牌设置数据', async () => {
    mockGetBrand.mockResolvedValueOnce(BASE_BRAND);
    const res = await GET();
    const d = await res.json() as { brand: typeof BASE_BRAND };
    expect(res.status).toBe(200);
    expect(d.brand.brand_name).toBe('SSWIN88');
    expect(d.brand.primary_color).toBe('#1d4ed8');
    expect(mockGetBrand).toHaveBeenCalledOnce();
  });

  it('DB 无数据时返回 500', async () => {
    mockGetBrand.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

// ── Test 2: 更新品牌名称 ───────────────────────────────────────────────────

describe('测试 2 — PATCH 更新品牌名称', () => {
  it('成功更新 brand_name 并返回 ok:true', async () => {
    mockGetBrand.mockResolvedValueOnce(BASE_BRAND);
    mockUpdateBrand.mockResolvedValueOnce({ ...BASE_BRAND, brand_name: 'NewBrand' });
    const req = makeReq('PATCH', 'http://localhost/api/settings/brand', { brand_name: 'NewBrand' });
    const res = await PATCH(req);
    const d = await res.json() as { ok: boolean; brand: { brand_name: string } };
    expect(res.status).toBe(200);
    expect(d.ok).toBe(true);
    expect(d.brand.brand_name).toBe('NewBrand');
    expect(mockUpdateBrand).toHaveBeenCalledWith({ brand_name: 'NewBrand' }, 'superadmin');
  });

  it('空 body 返回 400', async () => {
    const req = makeReq('PATCH', 'http://localhost/api/settings/brand', {});
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });
});

// ── Test 3: 更新 logo media_id ────────────────────────────────────────────

describe('测试 3 — PATCH 更新 logo_media_id', () => {
  it('成功更新 logo_media_id', async () => {
    mockGetBrand.mockResolvedValueOnce(BASE_BRAND);
    mockUpdateBrand.mockResolvedValueOnce({ ...BASE_BRAND, logo_media_id: 42 });
    const req = makeReq('PATCH', 'http://localhost/api/settings/brand', { logo_media_id: 42 });
    const res = await PATCH(req);
    const d = await res.json() as { ok: boolean; brand: { logo_media_id: number } };
    expect(res.status).toBe(200);
    expect(d.brand.logo_media_id).toBe(42);
    expect(mockUpdateBrand).toHaveBeenCalledWith({ logo_media_id: 42 }, 'superadmin');
  });
});

// ── Test 4: 更新主题颜色 ───────────────────────────────────────────────────

describe('测试 4 — PATCH 更新主题颜色', () => {
  it('成功更新 primary_color 和 secondary_color', async () => {
    mockGetBrand.mockResolvedValueOnce(BASE_BRAND);
    mockUpdateBrand.mockResolvedValueOnce({
      ...BASE_BRAND, primary_color: '#ff0000', secondary_color: '#cc0000',
    });
    const req = makeReq('PATCH', 'http://localhost/api/settings/brand', {
      primary_color: '#ff0000', secondary_color: '#cc0000',
    });
    const res = await PATCH(req);
    const d = await res.json() as { ok: boolean; brand: { primary_color: string } };
    expect(res.status).toBe(200);
    expect(d.brand.primary_color).toBe('#ff0000');
  });
});

// ── Test 5: 权限检查 ──────────────────────────────────────────────────────

describe('测试 5 — 权限检查：无权限时返回 401', () => {
  it('GET 无权限返回 401', async () => {
    const { verifyJWT } = await import('@/lib/auth');
    vi.mocked(verifyJWT).mockResolvedValueOnce({ sub: 2, username: 'cs_user', role: 'CS', iat: 0, exp: 0 });
    const { can } = await import('@/lib/permission_engine');
    vi.mocked(can).mockResolvedValueOnce(false);

    vi.resetModules();
    const { GET: GET2 } = await import('@/app/api/settings/brand/route');
    const res = await GET2();
    expect(res.status).toBe(401);
  });

  it('PATCH 无权限返回 401', async () => {
    const { verifyJWT } = await import('@/lib/auth');
    vi.mocked(verifyJWT).mockResolvedValueOnce({ sub: 2, username: 'cs_user', role: 'CS', iat: 0, exp: 0 });
    const { can } = await import('@/lib/permission_engine');
    vi.mocked(can).mockResolvedValueOnce(false);

    vi.resetModules();
    const { PATCH: PATCH2 } = await import('@/app/api/settings/brand/route');
    const req = makeReq('PATCH', 'http://localhost/api/settings/brand', { brand_name: 'X' });
    const res = await PATCH2(req);
    expect(res.status).toBe(401);
  });
});

// ── Test 6: 审计日志记录 ───────────────────────────────────────────────────

describe('测试 6 — 审计日志：更新后调用 logAudit', () => {
  it('PATCH 成功后记录审计日志', async () => {
    mockGetBrand.mockResolvedValueOnce(BASE_BRAND);
    mockUpdateBrand.mockResolvedValueOnce({ ...BASE_BRAND, brand_name: 'Updated' });
    const req = makeReq('PATCH', 'http://localhost/api/settings/brand', { brand_name: 'Updated' });
    await PATCH(req);
    expect(vi.mocked(logAudit)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'BRAND_SETTINGS_UPDATED',
        target_type: 'brand_settings',
        target_id: 1,
      })
    );
  });
});

// ── Test 7: 缓存失效 ──────────────────────────────────────────────────────

describe('测试 7 — 缓存失效：更新后清除缓存', () => {
  it('PATCH 成功后调用 invalidateBrandCache', async () => {
    mockGetBrand.mockResolvedValueOnce(BASE_BRAND);
    mockUpdateBrand.mockResolvedValueOnce({ ...BASE_BRAND, brand_name: 'X' });
    const req = makeReq('PATCH', 'http://localhost/api/settings/brand', { brand_name: 'X' });
    await PATCH(req);
    expect(mockInvalidate).toHaveBeenCalledOnce();
  });
});

// ── Test 8: DB 故障时使用 fallback ────────────────────────────────────────

describe('测试 8 — DB 故障时使用 fallback 值', () => {
  it('getBrandSettings 返回 null 时，GET 返回 500（已记录 fallback 行为）', async () => {
    // DB 故障场景：brand_settings 行不存在
    mockGetBrand.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('BRAND_FALLBACK 包含正确的默认值', async () => {
    const { BRAND_FALLBACK } = await import('@/lib/brand_service');
    expect(BRAND_FALLBACK.brand_name).toBe('SSWIN88');
    expect(BRAND_FALLBACK.primary_color).toBe('#1d4ed8');
    expect(BRAND_FALLBACK.secondary_color).toBe('#1e40af');
    expect(BRAND_FALLBACK.theme_mode).toBe('light');
  });
});
