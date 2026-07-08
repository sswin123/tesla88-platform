import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({
  verifyJWT:   vi.fn().mockResolvedValue({ sub: 1, username: 'superadmin', role: 'SUPER_ADMIN' }),
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

const mockListStaff            = vi.fn();
const mockGetStaffById         = vi.fn();
const mockCreateStaffMember    = vi.fn();
const mockUpdateStaffMember    = vi.fn();
const mockCountActiveSuperAdmins = vi.fn();

vi.mock('@/lib/repositories/admin_repo', () => ({
  listStaff:              (...a: unknown[]) => mockListStaff(...a),
  getStaffById:           (...a: unknown[]) => mockGetStaffById(...a),
  createStaffMember:      (...a: unknown[]) => mockCreateStaffMember(...a),
  updateStaffMember:      (...a: unknown[]) => mockUpdateStaffMember(...a),
  countActiveSuperAdmins: (...a: unknown[]) => mockCountActiveSuperAdmins(...a),
}));

import { GET, POST }  from '@/app/api/settings/staff/route';
import { PATCH }      from '@/app/api/settings/staff/[id]/route';

// ── Fixtures ───────────────────────────────────────────────────────────────

const BASE_STAFF = {
  id: 2,
  erp_username: 'john',
  display_name: 'John Doe',
  telegram_id: null,
  role: 'CS',
  is_active: true,
  last_login_at: null,
  added_by_username: 'superadmin',
  created_at: '2026-01-01',
};

function makeReq(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body:    body ? JSON.stringify(body) : undefined,
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => vi.clearAllMocks());

// ── Test 1: GET returns staff list ─────────────────────────────────────────

describe('Test 1 — GET /api/settings/staff returns staff list', () => {
  it('returns list of staff members', async () => {
    mockListStaff.mockResolvedValueOnce([BASE_STAFF]);
    const res = await GET();
    const d = await res.json() as { staff: unknown[] };
    expect(res.status).toBe(200);
    expect(d.staff).toHaveLength(1);
    expect(mockListStaff).toHaveBeenCalledOnce();
  });
});

// ── Test 2: POST creates staff with correct role ──────────────────────────

describe('Test 2 — POST /api/settings/staff creates staff', () => {
  it('creates a staff member and returns 201', async () => {
    mockCreateStaffMember.mockResolvedValueOnce(BASE_STAFF);
    const req = makeReq('POST', 'http://localhost/api/settings/staff', {
      erp_username: 'john',
      display_name: 'John Doe',
      password:     'secret123',
      role:         'CS',
    });
    const res = await POST(req);
    const d = await res.json() as { ok: boolean; member: { role: string } };
    expect(res.status).toBe(201);
    expect(d.ok).toBe(true);
    expect(mockCreateStaffMember).toHaveBeenCalledWith(expect.objectContaining({
      erp_username: 'john',
      role: 'CS',
    }));
  });

  it('returns 400 when username is missing', async () => {
    const req = makeReq('POST', 'http://localhost/api/settings/staff', {
      password: 'secret123',
      role: 'CS',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when password is too short', async () => {
    const req = makeReq('POST', 'http://localhost/api/settings/staff', {
      erp_username: 'john',
      password: '123',
      role: 'CS',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

// ── Test 3: POST rejects SUPER_ADMIN role ────────────────────────────────

describe('Test 3 — POST rejects SUPER_ADMIN role', () => {
  it('returns 400 when role is SUPER_ADMIN', async () => {
    const req = makeReq('POST', 'http://localhost/api/settings/staff', {
      erp_username: 'hacker',
      password:     'secret123',
      role:         'SUPER_ADMIN',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockCreateStaffMember).not.toHaveBeenCalled();
  });
});

// ── Test 4: PATCH changes role ───────────────────────────────────────────

describe('Test 4 — PATCH /api/settings/staff/[id] changes role', () => {
  it('updates role and returns ok:true', async () => {
    mockGetStaffById.mockResolvedValueOnce(BASE_STAFF);
    mockUpdateStaffMember.mockResolvedValueOnce({ ...BASE_STAFF, role: 'ADMIN' });
    const req = makeReq('PATCH', 'http://localhost/api/settings/staff/2', { role: 'ADMIN' });
    const res = await PATCH(req, ctx('2'));
    const d = await res.json() as { ok: boolean; member: { role: string } };
    expect(res.status).toBe(200);
    expect(d.ok).toBe(true);
    expect(mockUpdateStaffMember).toHaveBeenCalledWith(2, expect.objectContaining({ role: 'ADMIN' }));
  });

  it('returns 403 when trying to assign SUPER_ADMIN role', async () => {
    mockGetStaffById.mockResolvedValueOnce(BASE_STAFF);
    const req = makeReq('PATCH', 'http://localhost/api/settings/staff/2', { role: 'SUPER_ADMIN' });
    const res = await PATCH(req, ctx('2'));
    expect(res.status).toBe(403);
    expect(mockUpdateStaffMember).not.toHaveBeenCalled();
  });
});

// ── Test 5: PATCH disables staff ─────────────────────────────────────────

describe('Test 5 — PATCH disables staff member', () => {
  it('sets is_active to false and returns ok:true', async () => {
    mockGetStaffById.mockResolvedValueOnce(BASE_STAFF);
    mockUpdateStaffMember.mockResolvedValueOnce({ ...BASE_STAFF, is_active: false });
    const req = makeReq('PATCH', 'http://localhost/api/settings/staff/2', { is_active: false });
    const res = await PATCH(req, ctx('2'));
    const d = await res.json() as { ok: boolean };
    expect(res.status).toBe(200);
    expect(d.ok).toBe(true);
    expect(mockUpdateStaffMember).toHaveBeenCalledWith(2, expect.objectContaining({ is_active: false }));
  });
});

// ── Test 6: Cannot edit SUPER_ADMIN ──────────────────────────────────────

describe('Test 6 — PATCH returns 403 when target is SUPER_ADMIN', () => {
  it('returns 403 when trying to edit a SUPER_ADMIN account', async () => {
    mockGetStaffById.mockResolvedValueOnce({ ...BASE_STAFF, id: 1, role: 'SUPER_ADMIN' });
    const req = makeReq('PATCH', 'http://localhost/api/settings/staff/1', { role: 'ADMIN' });
    const res = await PATCH(req, ctx('1'));
    expect(res.status).toBe(403);
    expect(mockUpdateStaffMember).not.toHaveBeenCalled();
  });
});

// ── Test 7: Permission check blocks unauthorized access ───────────────────

describe('Test 7 — Permission check blocks unauthorized access', () => {
  it('GET returns 401 without staff.manage permission', async () => {
    const { verifyJWT } = await import('@/lib/auth');
    vi.mocked(verifyJWT).mockResolvedValueOnce({ sub: 3, username: 'cs_user', role: 'CS', iat: 0, exp: 0 });
    const { can } = await import('@/lib/permission_engine');
    vi.mocked(can).mockResolvedValueOnce(false);

    vi.resetModules();
    const { GET: GET2 } = await import('@/app/api/settings/staff/route');
    const res = await GET2();
    expect(res.status).toBe(401);
  });

  it('POST returns 401 without staff.manage permission', async () => {
    const { verifyJWT } = await import('@/lib/auth');
    vi.mocked(verifyJWT).mockResolvedValueOnce({ sub: 3, username: 'cs_user', role: 'CS', iat: 0, exp: 0 });
    const { can } = await import('@/lib/permission_engine');
    vi.mocked(can).mockResolvedValueOnce(false);

    vi.resetModules();
    const { POST: POST2 } = await import('@/app/api/settings/staff/route');
    const req = makeReq('POST', 'http://localhost/api/settings/staff', {
      erp_username: 'x', password: 'secret123', role: 'CS',
    });
    const res = await POST2(req);
    expect(res.status).toBe(401);
  });
});
