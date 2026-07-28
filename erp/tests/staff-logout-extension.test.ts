import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@/lib/auth', () => ({ verifyJWT: vi.fn(), COOKIE_NAME: 'erp_session' }));
vi.mock('@/lib/repositories/staff_monitor_repo', () => ({
  setOffline:   vi.fn(),
  logActivity:  vi.fn(),
}));

import { cookies } from 'next/headers';
import { verifyJWT } from '@/lib/auth';
import { setOffline, logActivity } from '@/lib/repositories/staff_monitor_repo';
import { POST } from '@/app/api/auth/logout/route';

beforeEach(() => vi.clearAllMocks());

describe('POST /api/auth/logout', () => {
  it('marks the staff member offline and logs LOGOUT when a valid session exists', async () => {
    vi.mocked(cookies).mockResolvedValue({ get: () => ({ value: 'tok' }), delete: vi.fn() } as never);
    vi.mocked(verifyJWT).mockResolvedValue({ sub: 1, username: 'a', role: 'ADMIN', iat: 0, exp: 9999999999 } as never);
    const res = await POST();
    expect(res.status).toBe(200);
    expect(setOffline).toHaveBeenCalledWith(1);
    expect(logActivity).toHaveBeenCalledWith(1, 'LOGOUT', 'staff', 'logout');
  });

  it('still returns 200 and clears the cookie when there is no session', async () => {
    vi.mocked(cookies).mockResolvedValue({ get: () => undefined, delete: vi.fn() } as never);
    const res = await POST();
    expect(res.status).toBe(200);
    expect(setOffline).not.toHaveBeenCalled();
  });

  it('still returns 200 even if setOffline throws (logout must never be blocked)', async () => {
    vi.mocked(cookies).mockResolvedValue({ get: () => ({ value: 'tok' }), delete: vi.fn() } as never);
    vi.mocked(verifyJWT).mockResolvedValue({ sub: 1, username: 'a', role: 'ADMIN', iat: 0, exp: 9999999999 } as never);
    vi.mocked(setOffline).mockRejectedValue(new Error('db down'));
    const res = await POST();
    expect(res.status).toBe(200);
  });
});
