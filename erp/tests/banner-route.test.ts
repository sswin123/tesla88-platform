import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/* ── Mocks ──────────────────────────────────────────────────────────────── */

vi.mock('@/lib/auth', () => ({
  verifyJWT:   vi.fn().mockResolvedValue({ sub: 1, username: 'admin', role: 'SUPER_ADMIN', iat: 0, exp: 9999999999 }),
  COOKIE_NAME: 'token',
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => ({ value: 'tok' }) }),
}));

vi.mock('@/lib/permission_engine', () => ({
  can: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/repositories/audit_repo', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

const mockGetAll    = vi.fn();
const mockGetById   = vi.fn();
const mockCreate    = vi.fn();
const mockUpdate    = vi.fn();
const mockDelete    = vi.fn();

vi.mock('@/lib/repositories/banner_repo', () => ({
  getAllBanners:  (...a: unknown[]) => mockGetAll(...a),
  getBannerById: (...a: unknown[]) => mockGetById(...a),
  createBanner:  (...a: unknown[]) => mockCreate(...a),
  updateBanner:  (...a: unknown[]) => mockUpdate(...a),
  deleteBanner:  (...a: unknown[]) => mockDelete(...a),
}));

import { GET as listBanners, POST as createBanner } from '@/app/api/website/banners/route';
import { GET as getBanner, PATCH as updateBanner, DELETE as deleteBanner } from '@/app/api/website/banners/[id]/route';

beforeEach(() => vi.clearAllMocks());

const BANNER = {
  id: 1, title: 'Welcome Bonus', description: 'Get 100% bonus',
  image_media_id: 5, mobile_image_media_id: null,
  link_url: '/register', button_text: '立即领取',
  display_order: 0, is_active: true,
  start_at: null, end_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};

function makeReq(method: string, body?: unknown) {
  return new NextRequest('http://localhost/api/website/banners', {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'Content-Type': 'application/json' } : {},
  });
}

function makeIdReq(method: string, body?: unknown) {
  return new NextRequest('http://localhost/api/website/banners/1', {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'Content-Type': 'application/json' } : {},
  });
}

/* ── List banners ─────────────────────────────────────────────────────── */

describe('GET /api/website/banners', () => {
  it('returns banner list', async () => {
    mockGetAll.mockResolvedValueOnce([BANNER]);
    const res = await listBanners();
    expect(res.status).toBe(200);
    const data = await res.json() as { id: number }[];
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(1);
  });

  it('returns 401 when unauthorized', async () => {
    vi.mocked((await import('@/lib/permission_engine')).can).mockResolvedValueOnce(false);
    const res = await listBanners();
    expect(res.status).toBe(401);
  });
});

/* ── Create banner ────────────────────────────────────────────────────── */

describe('POST /api/website/banners', () => {
  it('creates banner and returns 201', async () => {
    mockCreate.mockResolvedValueOnce(BANNER);
    const res = await createBanner(makeReq('POST', { title: 'Welcome Bonus', is_active: true }));
    expect(res.status).toBe(201);
    const data = await res.json() as { id: number; title: string };
    expect(data.id).toBe(1);
    expect(data.title).toBe('Welcome Bonus');
  });

  it('returns 400 when title missing', async () => {
    const res = await createBanner(makeReq('POST', {}));
    expect(res.status).toBe(400);
  });

  it('returns 401 when unauthorized', async () => {
    vi.mocked((await import('@/lib/permission_engine')).can).mockResolvedValueOnce(false);
    const res = await createBanner(makeReq('POST', { title: 'Test' }));
    expect(res.status).toBe(401);
  });
});

/* ── Update banner ────────────────────────────────────────────────────── */

describe('PATCH /api/website/banners/[id]', () => {
  it('updates banner', async () => {
    mockGetById.mockResolvedValueOnce(BANNER);
    mockUpdate.mockResolvedValueOnce({ ...BANNER, title: 'Updated', is_active: false });
    const res = await updateBanner(makeIdReq('PATCH', { title: 'Updated', is_active: false }), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);
    const data = await res.json() as { title: string; is_active: boolean };
    expect(data.title).toBe('Updated');
    expect(data.is_active).toBe(false);
  });

  it('enable/disable banner (toggle is_active)', async () => {
    mockGetById.mockResolvedValueOnce(BANNER);
    mockUpdate.mockResolvedValueOnce({ ...BANNER, is_active: false });
    const res = await updateBanner(makeIdReq('PATCH', { is_active: false }), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);
    const data = await res.json() as { is_active: boolean };
    expect(data.is_active).toBe(false);
  });

  it('returns 404 when banner not found', async () => {
    mockGetById.mockResolvedValueOnce(null);
    const res = await updateBanner(makeIdReq('PATCH', { title: 'X' }), { params: Promise.resolve({ id: '99' }) });
    expect(res.status).toBe(404);
  });

  it('updates display_order for reorder', async () => {
    mockGetById.mockResolvedValueOnce(BANNER);
    mockUpdate.mockResolvedValueOnce({ ...BANNER, display_order: 2 });
    const res = await updateBanner(makeIdReq('PATCH', { display_order: 2 }), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);
    const data = await res.json() as { display_order: number };
    expect(data.display_order).toBe(2);
  });
});

/* ── Delete banner ────────────────────────────────────────────────────── */

describe('DELETE /api/website/banners/[id]', () => {
  it('deletes banner', async () => {
    mockGetById.mockResolvedValueOnce(BANNER);
    mockDelete.mockResolvedValueOnce(true);
    const res = await deleteBanner(makeIdReq('DELETE'), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean };
    expect(data.ok).toBe(true);
  });

  it('returns 404 when banner not found', async () => {
    mockGetById.mockResolvedValueOnce(null);
    const res = await deleteBanner(makeIdReq('DELETE'), { params: Promise.resolve({ id: '99' }) });
    expect(res.status).toBe(404);
  });
});

/* ── Get single banner ────────────────────────────────────────────────── */

describe('GET /api/website/banners/[id]', () => {
  it('returns banner by id', async () => {
    mockGetById.mockResolvedValueOnce(BANNER);
    const res = await getBanner(makeIdReq('GET'), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);
    const data = await res.json() as { title: string };
    expect(data.title).toBe('Welcome Bonus');
  });

  it('returns 404 when not found', async () => {
    mockGetById.mockResolvedValueOnce(null);
    const res = await getBanner(makeIdReq('GET'), { params: Promise.resolve({ id: '99' }) });
    expect(res.status).toBe(404);
  });
});
