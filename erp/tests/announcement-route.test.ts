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

vi.mock('@/lib/repositories/website_announcement_repo', () => ({
  getAllWebsiteAnnouncements:    (...a: unknown[]) => mockGetAll(...a),
  getWebsiteAnnouncementById:   (...a: unknown[]) => mockGetById(...a),
  createWebsiteAnnouncement:    (...a: unknown[]) => mockCreate(...a),
  updateWebsiteAnnouncement:    (...a: unknown[]) => mockUpdate(...a),
  deleteWebsiteAnnouncement:    (...a: unknown[]) => mockDelete(...a),
}));

import { GET as listItems, POST as createItem } from '@/app/api/website/announcements/route';
import { GET as getItem, PATCH as updateItem, DELETE as deleteItem } from '@/app/api/website/announcements/[id]/route';

beforeEach(() => vi.clearAllMocks());

const ITEM = {
  id: 1, title: '欢迎新会员', message: '首存即享100%奖金', type: 'promotion',
  link_url: '/promotions', display_order: 0, is_active: true,
  start_at: null, end_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};

function makeReq(method: string, body?: unknown) {
  return new NextRequest('http://localhost/api/website/announcements', {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'Content-Type': 'application/json' } : {},
  });
}

function makeIdReq(method: string, body?: unknown) {
  return new NextRequest('http://localhost/api/website/announcements/1', {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'Content-Type': 'application/json' } : {},
  });
}

/* ── List ─────────────────────────────────────────────────────────────── */

describe('GET /api/website/announcements', () => {
  it('returns announcement list', async () => {
    mockGetAll.mockResolvedValueOnce([ITEM]);
    const res = await listItems();
    expect(res.status).toBe(200);
    const data = await res.json() as typeof ITEM[];
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(1);
    expect(data[0].type).toBe('promotion');
  });

  it('returns 401 when unauthorized', async () => {
    vi.mocked((await import('@/lib/permission_engine')).can).mockResolvedValueOnce(false);
    const res = await listItems();
    expect(res.status).toBe(401);
  });
});

/* ── Create ───────────────────────────────────────────────────────────── */

describe('POST /api/website/announcements', () => {
  it('creates announcement and returns 201', async () => {
    mockCreate.mockResolvedValueOnce(ITEM);
    const res = await createItem(makeReq('POST', {
      title: '欢迎新会员', message: '首存即享100%奖金', type: 'promotion',
    }));
    expect(res.status).toBe(201);
    const data = await res.json() as typeof ITEM;
    expect(data.id).toBe(1);
    expect(data.type).toBe('promotion');
  });

  it('returns 400 when title missing', async () => {
    const res = await createItem(makeReq('POST', { message: '消息内容' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when message missing', async () => {
    const res = await createItem(makeReq('POST', { title: '标题' }));
    expect(res.status).toBe(400);
  });

  it('defaults type to info when not provided', async () => {
    mockCreate.mockResolvedValueOnce({ ...ITEM, type: 'info' });
    const res = await createItem(makeReq('POST', { title: '通知', message: '内容' }));
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ type: 'info' }));
  });

  it('returns 401 when unauthorized', async () => {
    vi.mocked((await import('@/lib/permission_engine')).can).mockResolvedValueOnce(false);
    const res = await createItem(makeReq('POST', { title: 'T', message: 'M' }));
    expect(res.status).toBe(401);
  });
});

/* ── Update ───────────────────────────────────────────────────────────── */

describe('PATCH /api/website/announcements/[id]', () => {
  it('updates announcement', async () => {
    mockGetById.mockResolvedValueOnce(ITEM);
    mockUpdate.mockResolvedValueOnce({ ...ITEM, title: '更新标题' });
    const res = await updateItem(makeIdReq('PATCH', { title: '更新标题' }), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);
    const data = await res.json() as { title: string };
    expect(data.title).toBe('更新标题');
  });

  it('enable/disable announcement (toggle is_active)', async () => {
    mockGetById.mockResolvedValueOnce(ITEM);
    mockUpdate.mockResolvedValueOnce({ ...ITEM, is_active: false });
    const res = await updateItem(makeIdReq('PATCH', { is_active: false }), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);
    const data = await res.json() as { is_active: boolean };
    expect(data.is_active).toBe(false);
  });

  it('returns 404 when not found', async () => {
    mockGetById.mockResolvedValueOnce(null);
    const res = await updateItem(makeIdReq('PATCH', { title: 'X' }), { params: Promise.resolve({ id: '99' }) });
    expect(res.status).toBe(404);
  });

  it('updates display_order for reorder', async () => {
    mockGetById.mockResolvedValueOnce(ITEM);
    mockUpdate.mockResolvedValueOnce({ ...ITEM, display_order: 3 });
    const res = await updateItem(makeIdReq('PATCH', { display_order: 3 }), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);
    const data = await res.json() as { display_order: number };
    expect(data.display_order).toBe(3);
  });
});

/* ── Delete ───────────────────────────────────────────────────────────── */

describe('DELETE /api/website/announcements/[id]', () => {
  it('deletes announcement', async () => {
    mockGetById.mockResolvedValueOnce(ITEM);
    mockDelete.mockResolvedValueOnce(true);
    const res = await deleteItem(makeIdReq('DELETE'), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean };
    expect(data.ok).toBe(true);
  });

  it('returns 404 when not found', async () => {
    mockGetById.mockResolvedValueOnce(null);
    const res = await deleteItem(makeIdReq('DELETE'), { params: Promise.resolve({ id: '99' }) });
    expect(res.status).toBe(404);
  });
});

/* ── Get single ───────────────────────────────────────────────────────── */

describe('GET /api/website/announcements/[id]', () => {
  it('returns announcement by id', async () => {
    mockGetById.mockResolvedValueOnce(ITEM);
    const res = await getItem(makeIdReq('GET'), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);
    const data = await res.json() as { title: string };
    expect(data.title).toBe('欢迎新会员');
  });

  it('returns 404 when not found', async () => {
    mockGetById.mockResolvedValueOnce(null);
    const res = await getItem(makeIdReq('GET'), { params: Promise.resolve({ id: '99' }) });
    expect(res.status).toBe(404);
  });
});
