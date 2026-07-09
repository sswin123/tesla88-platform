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

const mockGetAll  = vi.fn();
const mockGetById = vi.fn();
const mockCreate  = vi.fn();
const mockUpdate  = vi.fn();
const mockDelete  = vi.fn();

vi.mock('@/lib/repositories/game_provider_repo', () => ({
  getAllGameProviders:   (...a: unknown[]) => mockGetAll(...a),
  getGameProviderById:  (...a: unknown[]) => mockGetById(...a),
  createGameProvider:   (...a: unknown[]) => mockCreate(...a),
  updateGameProvider:   (...a: unknown[]) => mockUpdate(...a),
  deleteGameProvider:   (...a: unknown[]) => mockDelete(...a),
}));

import { GET as listProviders, POST as createProvider } from '@/app/api/website/game-providers/route';
import { GET as getProvider, PATCH as updateProvider, DELETE as deleteProvider } from '@/app/api/website/game-providers/[id]/route';

beforeEach(() => vi.clearAllMocks());

const PROVIDER = {
  id: 1, provider_code: 'mega888', provider_name: 'Mega888',
  category: 'slot', logo_media_id: 3, banner_media_id: null,
  is_hot: true, is_new: false, is_active: true, display_order: 0,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};

function makeReq(method: string, body?: unknown) {
  return new NextRequest('http://localhost/api/website/game-providers', {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'Content-Type': 'application/json' } : {},
  });
}

function makeIdReq(method: string, body?: unknown) {
  return new NextRequest('http://localhost/api/website/game-providers/1', {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'Content-Type': 'application/json' } : {},
  });
}

/* ── List ─────────────────────────────────────────────────────────────── */

describe('GET /api/website/game-providers', () => {
  it('returns provider list', async () => {
    mockGetAll.mockResolvedValueOnce([PROVIDER]);
    const res = await listProviders();
    expect(res.status).toBe(200);
    const data = await res.json() as typeof PROVIDER[];
    expect(data).toHaveLength(1);
    expect(data[0].provider_code).toBe('mega888');
    expect(data[0].category).toBe('slot');
  });

  it('returns 401 when unauthorized', async () => {
    vi.mocked((await import('@/lib/permission_engine')).can).mockResolvedValueOnce(false);
    const res = await listProviders();
    expect(res.status).toBe(401);
  });
});

/* ── Create ───────────────────────────────────────────────────────────── */

describe('POST /api/website/game-providers', () => {
  it('creates provider and returns 201', async () => {
    mockCreate.mockResolvedValueOnce(PROVIDER);
    const res = await createProvider(makeReq('POST', {
      provider_code: 'mega888', provider_name: 'Mega888', category: 'slot',
    }));
    expect(res.status).toBe(201);
    const data = await res.json() as typeof PROVIDER;
    expect(data.id).toBe(1);
    expect(data.provider_code).toBe('mega888');
  });

  it('returns 400 when provider_code missing', async () => {
    const res = await createProvider(makeReq('POST', { provider_name: 'Mega888' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when provider_name missing', async () => {
    const res = await createProvider(makeReq('POST', { provider_code: 'mega888' }));
    expect(res.status).toBe(400);
  });

  it('defaults category to slot when not provided', async () => {
    mockCreate.mockResolvedValueOnce({ ...PROVIDER, category: 'slot' });
    await createProvider(makeReq('POST', { provider_code: 'test', provider_name: 'Test' }));
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ category: 'slot' }));
  });

  it('returns 401 when unauthorized', async () => {
    vi.mocked((await import('@/lib/permission_engine')).can).mockResolvedValueOnce(false);
    const res = await createProvider(makeReq('POST', { provider_code: 'x', provider_name: 'X' }));
    expect(res.status).toBe(401);
  });
});

/* ── Update ───────────────────────────────────────────────────────────── */

describe('PATCH /api/website/game-providers/[id]', () => {
  it('updates provider', async () => {
    mockGetById.mockResolvedValueOnce(PROVIDER);
    mockUpdate.mockResolvedValueOnce({ ...PROVIDER, provider_name: 'Mega888 Updated' });
    const res = await updateProvider(
      makeIdReq('PATCH', { provider_name: 'Mega888 Updated' }),
      { params: Promise.resolve({ id: '1' }) }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as { provider_name: string };
    expect(data.provider_name).toBe('Mega888 Updated');
  });

  it('enables / disables provider', async () => {
    mockGetById.mockResolvedValueOnce(PROVIDER);
    mockUpdate.mockResolvedValueOnce({ ...PROVIDER, is_active: false });
    const res = await updateProvider(
      makeIdReq('PATCH', { is_active: false }),
      { params: Promise.resolve({ id: '1' }) }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as { is_active: boolean };
    expect(data.is_active).toBe(false);
  });

  it('toggles HOT flag', async () => {
    mockGetById.mockResolvedValueOnce(PROVIDER);
    mockUpdate.mockResolvedValueOnce({ ...PROVIDER, is_hot: false });
    const res = await updateProvider(
      makeIdReq('PATCH', { is_hot: false }),
      { params: Promise.resolve({ id: '1' }) }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as { is_hot: boolean };
    expect(data.is_hot).toBe(false);
  });

  it('updates display_order for reorder', async () => {
    mockGetById.mockResolvedValueOnce(PROVIDER);
    mockUpdate.mockResolvedValueOnce({ ...PROVIDER, display_order: 5 });
    const res = await updateProvider(
      makeIdReq('PATCH', { display_order: 5 }),
      { params: Promise.resolve({ id: '1' }) }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as { display_order: number };
    expect(data.display_order).toBe(5);
  });

  it('returns 404 when not found', async () => {
    mockGetById.mockResolvedValueOnce(null);
    const res = await updateProvider(
      makeIdReq('PATCH', { provider_name: 'X' }),
      { params: Promise.resolve({ id: '99' }) }
    );
    expect(res.status).toBe(404);
  });
});

/* ── Delete ───────────────────────────────────────────────────────────── */

describe('DELETE /api/website/game-providers/[id]', () => {
  it('deletes provider', async () => {
    mockGetById.mockResolvedValueOnce(PROVIDER);
    mockDelete.mockResolvedValueOnce(true);
    const res = await deleteProvider(
      makeIdReq('DELETE'),
      { params: Promise.resolve({ id: '1' }) }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean };
    expect(data.ok).toBe(true);
  });

  it('returns 404 when not found', async () => {
    mockGetById.mockResolvedValueOnce(null);
    const res = await deleteProvider(
      makeIdReq('DELETE'),
      { params: Promise.resolve({ id: '99' }) }
    );
    expect(res.status).toBe(404);
  });
});

/* ── Get single ───────────────────────────────────────────────────────── */

describe('GET /api/website/game-providers/[id]', () => {
  it('returns provider by id', async () => {
    mockGetById.mockResolvedValueOnce(PROVIDER);
    const res = await getProvider(
      makeIdReq('GET'),
      { params: Promise.resolve({ id: '1' }) }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as { provider_name: string };
    expect(data.provider_name).toBe('Mega888');
  });

  it('returns 404 when not found', async () => {
    mockGetById.mockResolvedValueOnce(null);
    const res = await getProvider(
      makeIdReq('GET'),
      { params: Promise.resolve({ id: '99' }) }
    );
    expect(res.status).toBe(404);
  });
});
