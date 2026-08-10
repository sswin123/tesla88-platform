import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  verifyJWT:   vi.fn(),
  COOKIE_NAME: 'erp_session',
}));
vi.mock('@/lib/permission_engine', () => ({
  can: vi.fn(),
}));

import { cookies } from 'next/headers';
import { verifyJWT } from '@/lib/auth';
import { can } from '@/lib/permission_engine';
import { requirePermissionStrict } from '@/lib/require_permission';

beforeEach(() => vi.clearAllMocks());

describe('requirePermissionStrict', () => {
  it('returns 401 when there is no session cookie', async () => {
    vi.mocked(cookies).mockResolvedValue({ get: () => undefined } as never);
    const result = await requirePermissionStrict('staff.livemonitor.view');
    expect(result).toEqual({ ok: false, status: 401 });
  });

  it('returns 401 when the JWT fails to verify', async () => {
    vi.mocked(cookies).mockResolvedValue({ get: () => ({ value: 'bad-token' }) } as never);
    vi.mocked(verifyJWT).mockResolvedValue(null);
    const result = await requirePermissionStrict('staff.livemonitor.view');
    expect(result).toEqual({ ok: false, status: 401 });
  });

  it('returns 403 when logged in but permission is denied', async () => {
    vi.mocked(cookies).mockResolvedValue({ get: () => ({ value: 'tok' }) } as never);
    vi.mocked(verifyJWT).mockResolvedValue({ sub: 1, username: 'cs1', role: 'CS', iat: 0, exp: 9999999999 } as never);
    vi.mocked(can).mockResolvedValue(false);
    const result = await requirePermissionStrict('staff.livemonitor.view');
    expect(result).toEqual({ ok: false, status: 403 });
  });

  it('returns ok + payload when permission is granted', async () => {
    vi.mocked(cookies).mockResolvedValue({ get: () => ({ value: 'tok' }) } as never);
    vi.mocked(verifyJWT).mockResolvedValue({ sub: 1, username: 'admin1', role: 'ADMIN', iat: 0, exp: 9999999999 } as never);
    vi.mocked(can).mockResolvedValue(true);
    const result = await requirePermissionStrict('staff.livemonitor.view');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.sub).toBe(1);
  });

  it('returns 403 (fail-safe) when can() throws', async () => {
    vi.mocked(cookies).mockResolvedValue({ get: () => ({ value: 'tok' }) } as never);
    vi.mocked(verifyJWT).mockResolvedValue({ sub: 1, username: 'admin1', role: 'ADMIN', iat: 0, exp: 9999999999 } as never);
    vi.mocked(can).mockRejectedValue(new Error('db offline'));
    const result = await requirePermissionStrict('staff.livemonitor.view');
    expect(result).toEqual({ ok: false, status: 403 });
  });
});
