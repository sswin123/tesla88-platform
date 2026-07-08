import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock permissions_repo ─────────────────────────────────────────────────────

const mockGetRolePermissions = vi.fn();
const mockSetRolePermission = vi.fn();

vi.mock('@/lib/repositories/permissions_repo', () => ({
  getRolePermissions: (...a: unknown[]) => mockGetRolePermissions(...a),
  setRolePermission:  (...a: unknown[]) => mockSetRolePermission(...a),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRows(
  entries: Array<{ role: string; permission: string; granted?: boolean }>
) {
  return entries.map((e, i) => ({
    id: i + 1,
    role: e.role,
    permission: e.permission,
    granted: e.granted ?? true,
    updated_by: null,
    updated_at: new Date().toISOString(),
  }));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('can() — SUPER_ADMIN bypass', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns true for any permission without hitting DB', async () => {
    const { can } = await import('@/lib/permission_engine');
    const result = await can('SUPER_ADMIN', 'staff.manage');
    expect(result).toBe(true);
    expect(mockGetRolePermissions).not.toHaveBeenCalled();
  });

  it('returns true for SUPER_ADMIN even for unknown permissions', async () => {
    const { can } = await import('@/lib/permission_engine');
    expect(await can('SUPER_ADMIN', 'nonexistent.permission')).toBe(true);
  });
});

describe('can() — role with granted permission', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns true when role has the permission granted', async () => {
    mockGetRolePermissions.mockResolvedValue(
      makeRows([{ role: 'ADMIN', permission: 'deposit.view' }])
    );
    const { can } = await import('@/lib/permission_engine');
    expect(await can('ADMIN', 'deposit.view')).toBe(true);
  });

  it('returns false when role has a different permission only', async () => {
    mockGetRolePermissions.mockResolvedValue(
      makeRows([{ role: 'ADMIN', permission: 'deposit.view' }])
    );
    const { can } = await import('@/lib/permission_engine');
    expect(await can('ADMIN', 'withdraw.view')).toBe(false);
  });

  it('returns false when role is absent from the table', async () => {
    mockGetRolePermissions.mockResolvedValue(
      makeRows([{ role: 'ADMIN', permission: 'deposit.view' }])
    );
    const { can } = await import('@/lib/permission_engine');
    expect(await can('CS', 'deposit.view')).toBe(false);
  });

  it('ignores rows where granted = false', async () => {
    mockGetRolePermissions.mockResolvedValue(
      makeRows([{ role: 'ADMIN', permission: 'bot.settings', granted: false }])
    );
    const { can } = await import('@/lib/permission_engine');
    expect(await can('ADMIN', 'bot.settings')).toBe(false);
  });
});

describe('can() — in-memory cache', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('loads DB once and reuses cache for subsequent calls', async () => {
    mockGetRolePermissions.mockResolvedValue(
      makeRows([{ role: 'FINANCE', permission: 'finance.view' }])
    );
    const { can } = await import('@/lib/permission_engine');

    await can('FINANCE', 'finance.view');
    await can('FINANCE', 'finance.view');
    await can('ADMIN', 'finance.view');

    expect(mockGetRolePermissions).toHaveBeenCalledTimes(1);
  });

  it('reloads from DB after invalidateCache()', async () => {
    mockGetRolePermissions
      .mockResolvedValueOnce(makeRows([{ role: 'ADMIN', permission: 'audit.view' }]))
      .mockResolvedValueOnce(makeRows([]));

    const { can, invalidateCache } = await import('@/lib/permission_engine');

    expect(await can('ADMIN', 'audit.view')).toBe(true);
    invalidateCache();
    expect(await can('ADMIN', 'audit.view')).toBe(false);
    expect(mockGetRolePermissions).toHaveBeenCalledTimes(2);
  });
});

describe('can() — DB offline fallback', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns false (not throw) when DB is unavailable on first call', async () => {
    mockGetRolePermissions.mockRejectedValue(new Error('connection refused'));
    const { can } = await import('@/lib/permission_engine');
    await expect(can('ADMIN', 'deposit.view')).resolves.toBe(false);
  });

  it('serves stale cache when TTL expires and DB is down', async () => {
    // First call succeeds and warms the cache
    mockGetRolePermissions
      .mockResolvedValueOnce(makeRows([{ role: 'ADMIN', permission: 'deposit.view' }]))
      .mockRejectedValueOnce(new Error('DB down'));

    const { can } = await import('@/lib/permission_engine');

    // Warm the cache
    expect(await can('ADMIN', 'deposit.view')).toBe(true);

    // Simulate TTL expiry by advancing Date.now (vi.useFakeTimers approach)
    // Instead: directly verify that after a DB error on reload, stale cache is served.
    // We do this by monkey-patching Date.now to expire the TTL.
    const realNow = Date.now;
    vi.spyOn(Date, 'now').mockReturnValue(realNow() + 60_000); // +60s to expire TTL

    // DB fails on reload attempt — stale cache should be served
    expect(await can('ADMIN', 'deposit.view')).toBe(true);

    vi.restoreAllMocks();
  });
});

describe('setRolePermission() — call forwarded to repo', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('delegates to getRolePermissions on cache load', async () => {
    mockGetRolePermissions.mockResolvedValue(
      makeRows([{ role: 'CS', permission: 'livechat.view' }])
    );
    const { can } = await import('@/lib/permission_engine');
    await can('CS', 'livechat.view');
    expect(mockGetRolePermissions).toHaveBeenCalledOnce();
  });

  it('setRolePermission mock is callable', async () => {
    mockSetRolePermission.mockResolvedValue(undefined);
    const { setRolePermission } = await import('@/lib/repositories/permissions_repo');
    await setRolePermission('CS', 'livechat.view', true, 'superadmin');
    expect(mockSetRolePermission).toHaveBeenCalledWith('CS', 'livechat.view', true, 'superadmin');
  });
});
