import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@/lib/auth', () => ({ verifyJWT: vi.fn(), COOKIE_NAME: 'erp_session' }));
vi.mock('@/lib/repositories/staff_monitor_repo', () => ({
  setOffline:  vi.fn(),
  logActivity: vi.fn(),
}));
vi.mock('@/lib/repositories/staff_attendance_repo', () => ({
  getOpenSessionId: vi.fn(),
  closeSession: vi.fn(),
}));

import { cookies } from 'next/headers';
import { verifyJWT } from '@/lib/auth';
import { setOffline, logActivity } from '@/lib/repositories/staff_monitor_repo';
import { getOpenSessionId, closeSession } from '@/lib/repositories/staff_attendance_repo';
import { POST } from '@/app/api/auth/logout/route';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getOpenSessionId).mockResolvedValue(10);
  vi.mocked(closeSession).mockResolvedValue(undefined);
});

function mockSession(sub = 5) {
  vi.mocked(cookies).mockResolvedValue({ get: () => ({ value: 'tok' }), delete: vi.fn() } as never);
  vi.mocked(verifyJWT).mockResolvedValue({ sub, username: 'cs1', role: 'CS', iat: 0, exp: 9999999999 } as never);
}

describe('POST /api/auth/logout — Attendance Logout Lifecycle (Task 9)', () => {
  it('Test A/C: closes the OPEN Attendance session with checkout_source=LOGOUT and a real logout_at instant', async () => {
    mockSession(5);
    const res = await POST();
    expect(res.status).toBe(200);
    expect(getOpenSessionId).toHaveBeenCalledWith(5);
    expect(closeSession).toHaveBeenCalledWith(10, 'LOGOUT', expect.any(String));
  });

  it('Test E: no OPEN session — no-op, Logout still succeeds normally', async () => {
    mockSession(5);
    vi.mocked(getOpenSessionId).mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(200);
    expect(closeSession).not.toHaveBeenCalled();
  });

  it('Test F: attendance failure (getOpenSessionId throws) does not block Logout', async () => {
    mockSession(5);
    vi.mocked(getOpenSessionId).mockRejectedValueOnce(new Error('db offline'));
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body).toEqual({ ok: true });
  });

  it('Test F2: attendance failure (closeSession throws) does not block Logout', async () => {
    mockSession(5);
    vi.mocked(closeSession).mockRejectedValueOnce(new Error('db offline'));
    const res = await POST();
    expect(res.status).toBe(200);
  });

  it('does nothing Attendance-related when there is no session cookie', async () => {
    vi.mocked(cookies).mockResolvedValue({ get: () => undefined, delete: vi.fn() } as never);
    await POST();
    expect(getOpenSessionId).not.toHaveBeenCalled();
    expect(closeSession).not.toHaveBeenCalled();
  });

  it('Test G: existing setOffline/logActivity behavior is preserved unchanged alongside the new Attendance close', async () => {
    mockSession(5);
    await POST();
    expect(setOffline).toHaveBeenCalledWith(5);
    expect(logActivity).toHaveBeenCalledWith(5, 'LOGOUT', 'staff', 'logout');
  });

  it('Test G2: response contract is unchanged — status 200, body {ok:true}, cookie cleared', async () => {
    mockSession(5);
    const deleteMock = vi.fn();
    vi.mocked(cookies).mockResolvedValue({ get: () => ({ value: 'tok' }), delete: deleteMock } as never);
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body).toEqual({ ok: true });
  });

  it('a setOffline/logActivity failure does not prevent the Attendance session close (independent try/catch blocks)', async () => {
    mockSession(5);
    vi.mocked(setOffline).mockRejectedValueOnce(new Error('monitor db offline'));
    const res = await POST();
    expect(res.status).toBe(200);
    expect(closeSession).toHaveBeenCalledWith(10, 'LOGOUT', expect.any(String));
  });
});
