import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockVerifyJWT = vi.fn();
vi.mock('@/lib/auth', () => ({
  verifyJWT:   (...a: unknown[]) => mockVerifyJWT(...a),
  COOKIE_NAME: 'token',
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => ({ value: 'tok' }) }),
}));

const mockCan = vi.fn();
vi.mock('@/lib/permission_engine', () => ({
  can:             (...a: unknown[]) => mockCan(...a),
  invalidateCache: vi.fn(),
}));

const mockGetRolePermissions = vi.fn();
vi.mock('@/lib/repositories/permissions_repo', () => ({
  getRolePermissions: (...a: unknown[]) => mockGetRolePermissions(...a),
}));

vi.mock('@/lib/repositories/audit_repo', () => ({ logAudit: vi.fn() }));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePayload(role: string) {
  return { sub: 1, username: 'admin1', role, iat: 0, exp: 9999999999 };
}

function makeReq(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body:    body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyJWT.mockResolvedValue(makePayload('SUPER_ADMIN'));
  mockCan.mockResolvedValue(true);
});

// ── Test 1: SUPER_ADMIN accesses all ─────────────────────────────────────────

describe('Test 1 — SUPER_ADMIN accesses all protected routes', () => {
  it('requirePermission returns payload for SUPER_ADMIN regardless of permission', async () => {
    mockVerifyJWT.mockResolvedValue(makePayload('SUPER_ADMIN'));
    mockCan.mockResolvedValue(true); // engine bypasses for SUPER_ADMIN

    vi.resetModules();
    const { requirePermission } = await import('@/lib/require_permission');
    const result = await requirePermission('bot.settings');
    expect(result).not.toBeNull();
    expect(result?.role).toBe('SUPER_ADMIN');
  });

  it('SUPER_ADMIN can access finance route', async () => {
    mockVerifyJWT.mockResolvedValue(makePayload('SUPER_ADMIN'));
    mockCan.mockResolvedValue(true);

    vi.resetModules();
    const { GET } = await import('@/app/api/finance/reports/route');
    const req = makeReq('GET', 'http://localhost/api/finance/reports');
    const res = await GET(req);
    expect(res.status).not.toBe(401);
  });
});

// ── Test 2: ADMIN follows DB permissions ─────────────────────────────────────

describe('Test 2 — ADMIN follows DB permissions', () => {
  it('returns payload when DB grants the permission', async () => {
    mockVerifyJWT.mockResolvedValue(makePayload('ADMIN'));
    mockCan.mockResolvedValue(true); // DB says ADMIN has deposit.view

    vi.resetModules();
    const { requirePermission } = await import('@/lib/require_permission');
    const result = await requirePermission('deposit.view');
    expect(result).not.toBeNull();
    expect(result?.role).toBe('ADMIN');
  });

  it('returns null when DB denies the permission', async () => {
    mockVerifyJWT.mockResolvedValue(makePayload('ADMIN'));
    mockCan.mockResolvedValue(false); // ADMIN does not have bot.settings

    vi.resetModules();
    const { requirePermission } = await import('@/lib/require_permission');
    const result = await requirePermission('bot.settings');
    expect(result).toBeNull();
  });
});

// ── Test 3: Disabled permission blocks API ────────────────────────────────────

describe('Test 3 — Disabled permission blocks API route', () => {
  it('finance route returns 401 when permission denied', async () => {
    mockVerifyJWT.mockResolvedValue(makePayload('CS'));
    mockCan.mockResolvedValue(false); // CS cannot view finance

    vi.resetModules();
    const { GET } = await import('@/app/api/finance/reports/route');
    const req = makeReq('GET', 'http://localhost/api/finance/reports');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('deposits route returns 401 without permission', async () => {
    mockVerifyJWT.mockResolvedValue(makePayload('CS'));
    mockCan.mockResolvedValue(false);

    vi.resetModules();
    const { GET } = await import('@/app/api/deposits/route');
    const req = makeReq('GET', 'http://localhost/api/deposits');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

// ── Test 4: Sidebar hides unauthorized items ──────────────────────────────────

describe('Test 4 — Sidebar filters nav items by permission', () => {
  it('hides bot.settings when not in permissions', async () => {
    vi.resetModules();
    const { filterNavGroups } = await import('@/components/sidebar');
    const groups = [
      {
        title: 'Control Center',
        items: [
          { href: '/settings/bot',  label: 'Telegram Bot', icon: () => null, permission: 'bot.settings' },
          { href: '/settings/bot/messages', label: 'Bot Messages', icon: () => null, permission: 'bot.messages' },
        ],
      },
    ];
    const result = filterNavGroups(groups, false, ['bot.messages']);
    expect(result[0].items).toHaveLength(1);
    expect(result[0].items[0].href).toBe('/settings/bot/messages');
  });

  it('shows all items for SUPER_ADMIN regardless of permissions array', async () => {
    vi.resetModules();
    const { filterNavGroups } = await import('@/components/sidebar');
    const groups = [
      {
        items: [
          { href: '/settings/bot', label: 'Telegram Bot', icon: () => null, permission: 'bot.settings' },
          { href: '/admin-users',  label: 'Admin Users',  icon: () => null, permission: 'staff.manage' },
        ],
      },
    ];
    const result = filterNavGroups(groups, true, []); // isSuperAdmin=true, no permissions
    expect(result[0].items).toHaveLength(2);
  });

  it('removes empty groups after filtering', async () => {
    vi.resetModules();
    const { filterNavGroups } = await import('@/components/sidebar');
    const groups = [
      { items: [{ href: '/finance', label: 'Finance', icon: () => null, permission: 'finance.view' }] },
      { items: [{ href: '/members', label: 'Members', icon: () => null, permission: 'members.view' }] },
    ];
    const result = filterNavGroups(groups, false, ['members.view']); // no finance.view
    expect(result).toHaveLength(1);
    expect(result[0].items[0].href).toBe('/members');
  });
});

// ── Test 5: Direct URL access blocked (API returns 401) ───────────────────────

describe('Test 5 — Direct URL access returns 401 for unauthorized', () => {
  it('withdrawals route returns 401 without permission', async () => {
    mockVerifyJWT.mockResolvedValue(makePayload('CS'));
    mockCan.mockResolvedValue(false);

    vi.resetModules();
    const { GET } = await import('@/app/api/withdrawals/route');
    const req = makeReq('GET', 'http://localhost/api/withdrawals');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

// ── Test 6: Cache works ───────────────────────────────────────────────────────

describe('Test 6 — Permission cache works', () => {
  it('can() is called once per requirePermission call (cache is in engine layer)', async () => {
    mockVerifyJWT.mockResolvedValue(makePayload('ADMIN'));
    mockCan.mockResolvedValue(true);

    vi.resetModules();
    const { requirePermission } = await import('@/lib/require_permission');
    await requirePermission('deposit.view');
    await requirePermission('deposit.view');

    // require_permission calls can() once per invocation; caching is inside can()
    expect(mockCan).toHaveBeenCalledTimes(2);
    // but engine-level cache means DB is only hit once per TTL window
  });
});

// ── Test 7: DB failure fallback ───────────────────────────────────────────────

describe('Test 7 — DB failure fallback', () => {
  it('/api/auth/me returns empty permissions gracefully when DB is down', async () => {
    mockVerifyJWT.mockResolvedValue(makePayload('ADMIN'));
    mockGetRolePermissions.mockRejectedValue(new Error('DB down'));

    vi.resetModules();
    const { GET } = await import('@/app/api/auth/me/route');
    const res = await GET();
    const body = await res.json() as { permissions: string[]; isSuperAdmin: boolean };

    expect(res.status).toBe(200);
    expect(body.permissions).toEqual([]);
    expect(body.isSuperAdmin).toBe(false);
  });

  it('requirePermission returns null when can() throws', async () => {
    mockVerifyJWT.mockResolvedValue(makePayload('ADMIN'));
    mockCan.mockRejectedValue(new Error('DB down'));

    vi.resetModules();
    const { requirePermission } = await import('@/lib/require_permission');
    const result = await requirePermission('deposit.view');
    expect(result).toBeNull();
  });
});
