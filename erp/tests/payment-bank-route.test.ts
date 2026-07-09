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

const mockGetAll      = vi.fn();
const mockGetById     = vi.fn();
const mockCreate      = vi.fn();
const mockUpdate      = vi.fn();
const mockSetActive   = vi.fn();
const mockDelete      = vi.fn();

vi.mock('@/lib/repositories/bank_repo', () => ({
  getAllBanks:   (...a: unknown[]) => mockGetAll(...a),
  getBankById:   (...a: unknown[]) => mockGetById(...a),
  createBank:    (...a: unknown[]) => mockCreate(...a),
  updateBank:    (...a: unknown[]) => mockUpdate(...a),
  setBankActive: (...a: unknown[]) => mockSetActive(...a),
  deleteBank:    (...a: unknown[]) => mockDelete(...a),
}));

import { GET as listBanks, POST as createBank } from '@/app/api/website/payment-banks/route';
import { GET as getBank, PATCH as updateBank, DELETE as deleteBank } from '@/app/api/website/payment-banks/[id]/route';

beforeEach(() => vi.clearAllMocks());

const BANK = {
  id: 1, bank_name: 'Maybank', account_name: 'ACME Sdn Bhd',
  account_number: '1234567890', qr_image: null,
  qr_media_id: 7, instructions: '请备注用户名',
  is_active: true, display_order: 0,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};

function makeReq(method: string, body?: unknown) {
  return new NextRequest('http://localhost/api/website/payment-banks', {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'Content-Type': 'application/json' } : {},
  });
}

function makeIdReq(method: string, body?: unknown) {
  return new NextRequest('http://localhost/api/website/payment-banks/1', {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'Content-Type': 'application/json' } : {},
  });
}

/* ── List ─────────────────────────────────────────────────────────────── */

describe('GET /api/website/payment-banks', () => {
  it('returns bank list', async () => {
    mockGetAll.mockResolvedValueOnce([BANK]);
    const res = await listBanks();
    expect(res.status).toBe(200);
    const data = await res.json() as typeof BANK[];
    expect(data).toHaveLength(1);
    expect(data[0].bank_name).toBe('Maybank');
    expect(data[0].qr_media_id).toBe(7);
  });

  it('returns 401 when unauthorized', async () => {
    vi.mocked((await import('@/lib/permission_engine')).can).mockResolvedValueOnce(false);
    const res = await listBanks();
    expect(res.status).toBe(401);
  });
});

/* ── Create ───────────────────────────────────────────────────────────── */

describe('POST /api/website/payment-banks', () => {
  it('creates bank and returns 201', async () => {
    mockCreate.mockResolvedValueOnce(BANK);
    const res = await createBank(makeReq('POST', {
      bank_name: 'Maybank', account_name: 'ACME Sdn Bhd',
      account_number: '1234567890', qr_media_id: 7,
    }));
    expect(res.status).toBe(201);
    const data = await res.json() as typeof BANK;
    expect(data.bank_name).toBe('Maybank');
    expect(data.qr_media_id).toBe(7);
  });

  it('returns 400 when bank_name missing', async () => {
    const res = await createBank(makeReq('POST', {
      account_name: 'ACME', account_number: '123',
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when account_number missing', async () => {
    const res = await createBank(makeReq('POST', {
      bank_name: 'Maybank', account_name: 'ACME',
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when account_name missing', async () => {
    const res = await createBank(makeReq('POST', {
      bank_name: 'Maybank', account_number: '123',
    }));
    expect(res.status).toBe(400);
  });

  it('returns 401 when unauthorized', async () => {
    vi.mocked((await import('@/lib/permission_engine')).can).mockResolvedValueOnce(false);
    const res = await createBank(makeReq('POST', {
      bank_name: 'X', account_name: 'Y', account_number: 'Z',
    }));
    expect(res.status).toBe(401);
  });
});

/* ── Update ───────────────────────────────────────────────────────────── */

describe('PATCH /api/website/payment-banks/[id]', () => {
  it('updates bank fields', async () => {
    mockGetById.mockResolvedValueOnce(BANK);
    mockUpdate.mockResolvedValueOnce({ ...BANK, bank_name: 'CIMB' });
    const res = await updateBank(
      makeIdReq('PATCH', { bank_name: 'CIMB' }),
      { params: Promise.resolve({ id: '1' }) }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as { bank_name: string };
    expect(data.bank_name).toBe('CIMB');
  });

  it('disables bank via is_active: false', async () => {
    mockGetById.mockResolvedValueOnce(BANK);
    mockSetActive.mockResolvedValueOnce({ ...BANK, is_active: false });
    const res = await updateBank(
      makeIdReq('PATCH', { is_active: false }),
      { params: Promise.resolve({ id: '1' }) }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as { is_active: boolean };
    expect(data.is_active).toBe(false);
    expect(mockSetActive).toHaveBeenCalledWith(1, false);
  });

  it('updates qr_media_id', async () => {
    mockGetById.mockResolvedValueOnce(BANK);
    mockUpdate.mockResolvedValueOnce({ ...BANK, qr_media_id: 9 });
    const res = await updateBank(
      makeIdReq('PATCH', { qr_media_id: 9 }),
      { params: Promise.resolve({ id: '1' }) }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as { qr_media_id: number };
    expect(data.qr_media_id).toBe(9);
  });

  it('updates display_order for reorder', async () => {
    mockGetById.mockResolvedValueOnce(BANK);
    mockUpdate.mockResolvedValueOnce({ ...BANK, display_order: 3 });
    const res = await updateBank(
      makeIdReq('PATCH', { display_order: 3 }),
      { params: Promise.resolve({ id: '1' }) }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as { display_order: number };
    expect(data.display_order).toBe(3);
  });

  it('returns 404 when not found', async () => {
    mockGetById.mockResolvedValueOnce(null);
    const res = await updateBank(
      makeIdReq('PATCH', { bank_name: 'X' }),
      { params: Promise.resolve({ id: '99' }) }
    );
    expect(res.status).toBe(404);
  });
});

/* ── Delete ───────────────────────────────────────────────────────────── */

describe('DELETE /api/website/payment-banks/[id]', () => {
  it('deletes bank', async () => {
    mockGetById.mockResolvedValueOnce(BANK);
    mockDelete.mockResolvedValueOnce(true);
    const res = await deleteBank(
      makeIdReq('DELETE'),
      { params: Promise.resolve({ id: '1' }) }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean };
    expect(data.ok).toBe(true);
  });

  it('returns 404 when not found', async () => {
    mockGetById.mockResolvedValueOnce(null);
    const res = await deleteBank(
      makeIdReq('DELETE'),
      { params: Promise.resolve({ id: '99' }) }
    );
    expect(res.status).toBe(404);
  });
});

/* ── Get single ───────────────────────────────────────────────────────── */

describe('GET /api/website/payment-banks/[id]', () => {
  it('returns bank by id', async () => {
    mockGetById.mockResolvedValueOnce(BANK);
    const res = await getBank(
      makeIdReq('GET'),
      { params: Promise.resolve({ id: '1' }) }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as { bank_name: string; instructions: string };
    expect(data.bank_name).toBe('Maybank');
    expect(data.instructions).toBe('请备注用户名');
  });

  it('returns 404 when not found', async () => {
    mockGetById.mockResolvedValueOnce(null);
    const res = await getBank(
      makeIdReq('GET'),
      { params: Promise.resolve({ id: '99' }) }
    );
    expect(res.status).toBe(404);
  });
});
