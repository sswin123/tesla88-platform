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

vi.mock('@/lib/repositories/audit_repo', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

const mockGetRolePermissions = vi.fn();
const mockSetRolePermission  = vi.fn();

vi.mock('@/lib/repositories/permissions_repo', () => ({
  getRolePermissions: (...a: unknown[]) => mockGetRolePermissions(...a),
  setRolePermission:  (...a: unknown[]) => mockSetRolePermission(...a),
}));

const mockCan             = vi.fn();
const mockInvalidateCache = vi.fn();

vi.mock('@/lib/permission_engine', () => ({
  can:             (...a: unknown[]) => mockCan(...a),
  invalidateCache: () => mockInvalidateCache(),
}));

import { GET, PATCH } from '@/app/api/settings/permissions/route';
import { PERMISSION_GROUPS, MANAGEABLE_ROLES } from '@/lib/permission-defs';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body:    body ? JSON.stringify(body) : undefined,
  });
}

const DB_ROWS = [
  { id: 1, role: 'ADMIN',   permission: 'dashboard.view', granted: true,  updated_by: null, updated_at: '' },
  { id: 2, role: 'ADMIN',   permission: 'members.view',   granted: true,  updated_by: null, updated_at: '' },
  { id: 3, role: 'FINANCE', permission: 'finance.view',   granted: true,  updated_by: null, updated_at: '' },
  { id: 4, role: 'ADMIN',   permission: 'bot.settings',   granted: false, updated_by: null, updated_at: '' },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockCan.mockResolvedValue(true);
});

// ── Test 1: Load permissions ───────────────────────────────────────────────

describe('Test 1 — GET /api/settings/permissions', () => {
  it('returns roles list and permission matrix', async () => {
    mockGetRolePermissions.mockResolvedValue(DB_ROWS);

    const req = makeReq('GET', 'http://localhost/api/settings/permissions');
    const res = await GET(req);
    const body = await res.json() as { roles: unknown[]; matrix: Record<string, string[]> };

    expect(res.status).toBe(200);
    expect(body.roles).toHaveLength(MANAGEABLE_ROLES.length);
    expect(body.matrix['ADMIN']).toContain('dashboard.view');
    expect(body.matrix['ADMIN']).toContain('members.view');
    expect(body.matrix['FINANCE']).toContain('finance.view');
    // granted=false rows must NOT appear
    expect(body.matrix['ADMIN'] ?? []).not.toContain('bot.settings');
  });
});

// ── Test 2: Update permission ─────────────────────────────────────────────

describe('Test 2 — PATCH /api/settings/permissions', () => {
  it('grants a permission and returns ok:true', async () => {
    mockSetRolePermission.mockResolvedValue(undefined);

    const req = makeReq('PATCH', 'http://localhost/api/settings/permissions', {
      role: 'FINANCE', permission: 'members.view', granted: true,
    });
    const res = await PATCH(req);
    const body = await res.json() as { ok: boolean };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockSetRolePermission).toHaveBeenCalledWith('FINANCE', 'members.view', true, 'superadmin');
  });

  it('revokes a permission', async () => {
    mockSetRolePermission.mockResolvedValue(undefined);

    const req = makeReq('PATCH', 'http://localhost/api/settings/permissions', {
      role: 'ADMIN', permission: 'media.view', granted: false,
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    expect(mockSetRolePermission).toHaveBeenCalledWith('ADMIN', 'media.view', false, 'superadmin');
  });
});

// ── Test 3: SUPER_ADMIN cannot be modified ────────────────────────────────

describe('Test 3 — SUPER_ADMIN role is protected', () => {
  it('returns 403 when trying to modify SUPER_ADMIN permissions', async () => {
    const req = makeReq('PATCH', 'http://localhost/api/settings/permissions', {
      role: 'SUPER_ADMIN', permission: 'staff.manage', granted: false,
    });
    const res = await PATCH(req);
    const body = await res.json() as { error: string };

    expect(res.status).toBe(403);
    expect(body.error).toContain('SUPER_ADMIN');
    expect(mockSetRolePermission).not.toHaveBeenCalled();
  });
});

// ── Test 4: Cache is invalidated after update ─────────────────────────────

describe('Test 4 — Cache invalidated after PATCH', () => {
  it('calls invalidateCache() after successful permission update', async () => {
    mockSetRolePermission.mockResolvedValue(undefined);

    const req = makeReq('PATCH', 'http://localhost/api/settings/permissions', {
      role: 'CS', permission: 'livechat.view', granted: true,
    });
    await PATCH(req);

    expect(mockInvalidateCache).toHaveBeenCalledOnce();
  });
});

// ── Test 5: Unauthorized access blocked ───────────────────────────────────

describe('Test 5 — Unauthorized access', () => {
  it('returns 401 when user has no staff.manage permission', async () => {
    mockCan.mockResolvedValue(false);

    const req = makeReq('GET', 'http://localhost/api/settings/permissions');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 on unauthenticated PATCH', async () => {
    const { verifyJWT } = await import('@/lib/auth');
    vi.mocked(verifyJWT).mockResolvedValueOnce(null);

    const req = makeReq('PATCH', 'http://localhost/api/settings/permissions', {
      role: 'ADMIN', permission: 'members.view', granted: true,
    });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
    expect(mockSetRolePermission).not.toHaveBeenCalled();
  });
});

// ── Test 6: Permission grouping structure ─────────────────────────────────

describe('Test 6 — UI permission grouping (unit test)', () => {
  it('PERMISSION_GROUPS covers expected modules', () => {
    const modules = PERMISSION_GROUPS.map((g) => g.module);
    expect(modules).toContain('Dashboard');
    expect(modules).toContain('Members');
    expect(modules).toContain('Finance');
    expect(modules).toContain('Deposits');
    expect(modules).toContain('Withdrawals');
    expect(modules).toContain('Live Chat');
    expect(modules).toContain('Marketing');
    expect(modules).toContain('Bot');
    expect(modules).toContain('System');
  });

  it('every group has at least one permission', () => {
    for (const group of PERMISSION_GROUPS) {
      expect(group.permissions.length).toBeGreaterThan(0);
    }
  });

  it('SUPER_ADMIN role is marked locked in MANAGEABLE_ROLES', () => {
    const sa = MANAGEABLE_ROLES.find((r) => r.id === 'SUPER_ADMIN');
    expect(sa?.locked).toBe(true);
  });

  it('no duplicate permission keys across all groups', () => {
    const keys = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });
});
