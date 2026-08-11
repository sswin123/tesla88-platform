import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(() => ({ ok: true })),
  getClientIp: vi.fn(() => '1.2.3.4'),
}));
vi.mock('@/lib/auth', () => ({
  comparePassword: vi.fn(),
  signJWT: vi.fn().mockResolvedValue('signed.jwt.token'),
  getAdminByUsername: vi.fn(),
  COOKIE_NAME: 'erp_session',
  COOKIE_MAX_AGE: 28800,
}));
vi.mock('@/lib/attendance-timezone', () => ({
  getAttendanceTimezone: vi.fn().mockResolvedValue('Asia/Kuala_Lumpur'),
}));
vi.mock('@/lib/attendance-rules', () => ({
  resolveAttendanceDate: vi.fn(() => '2026-08-11'),
}));
vi.mock('@/lib/repositories/staff_attendance_repo', () => ({
  openSession: vi.fn().mockResolvedValue(1),
  finalizeStaleOpenSessions: vi.fn().mockResolvedValue(undefined),
}));

import { rateLimit } from '@/lib/rate-limit';
import { comparePassword, getAdminByUsername } from '@/lib/auth';
import { getAttendanceTimezone } from '@/lib/attendance-timezone';
import { resolveAttendanceDate } from '@/lib/attendance-rules';
import { openSession, finalizeStaleOpenSessions } from '@/lib/repositories/staff_attendance_repo';
import { POST } from '@/app/api/auth/login/route';

const ADMIN = { id: 5, erp_username: 'cs1', role: 'CS', is_active: true, erp_password_hash: 'x' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rateLimit).mockReturnValue({ ok: true } as never);
  vi.mocked(getAdminByUsername).mockResolvedValue(ADMIN as never);
  vi.mocked(comparePassword).mockResolvedValue(true);
  vi.mocked(getAttendanceTimezone).mockResolvedValue('Asia/Kuala_Lumpur');
  vi.mocked(resolveAttendanceDate).mockReturnValue('2026-08-11');
  vi.mocked(openSession).mockResolvedValue(1);
  vi.mocked(finalizeStaleOpenSessions).mockResolvedValue(undefined);
});

afterEach(() => vi.useRealTimers());

function makeReq(body: unknown, ua = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537') {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'user-agent': ua },
    body: JSON.stringify(body),
  }) as never;
}

describe('POST /api/auth/login — Attendance Login Lifecycle (Task 8)', () => {
  it('Test A: successful login opens a No-Schedule Attendance session (all schedule fields null/0)', async () => {
    const res = await POST(makeReq({ username: 'cs1', password: 'x' }));
    expect(res.status).toBe(200);
    expect(openSession).toHaveBeenCalledWith(
      expect.objectContaining({
        staffId: 5,
        attendanceDate: '2026-08-11',
        scheduledStartAt: null,
        scheduledEndAt: null,
        scheduleSourceType: null,
        scheduleSourceId: null,
        graceMinutes: 0,
      })
    );
  });

  it('Test A2: attendance date is resolved via getAttendanceTimezone() + resolveAttendanceDate() — never a second date mechanism', async () => {
    await POST(makeReq({ username: 'cs1', password: 'x' }));
    expect(getAttendanceTimezone).toHaveBeenCalled();
    expect(resolveAttendanceDate).toHaveBeenCalledWith(expect.any(String), 'Asia/Kuala_Lumpur');
  });

  it('Test A3: request metadata (ip/browser/device/os) is passed through to openSession, parsed from the real User-Agent', async () => {
    await POST(makeReq({ username: 'cs1', password: 'x' }, 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537'));
    expect(openSession).toHaveBeenCalledWith(
      expect.objectContaining({ ip: '1.2.3.4', browser: 'Chrome', device: 'Desktop', operatingSystem: 'Windows' })
    );
  });

  it('Test: finalizeStaleOpenSessions() runs before openSession() for the same staff', async () => {
    await POST(makeReq({ username: 'cs1', password: 'x' }));
    expect(finalizeStaleOpenSessions).toHaveBeenCalledWith(5);
    const finalizeOrder = vi.mocked(finalizeStaleOpenSessions).mock.invocationCallOrder[0];
    const openOrder = vi.mocked(openSession).mock.invocationCallOrder[0];
    expect(finalizeOrder).toBeLessThan(openOrder);
  });

  it('Test 2: failed login (wrong password) creates no Attendance session and does not finalize anything', async () => {
    vi.mocked(comparePassword).mockResolvedValue(false);
    const res = await POST(makeReq({ username: 'cs1', password: 'wrong' }));
    expect(res.status).toBe(401);
    expect(openSession).not.toHaveBeenCalled();
    expect(finalizeStaleOpenSessions).not.toHaveBeenCalled();
  });

  it('Test 2b: failed login (unknown user) creates no Attendance session', async () => {
    vi.mocked(getAdminByUsername).mockResolvedValue(null);
    const res = await POST(makeReq({ username: 'ghost', password: 'x' }));
    expect(res.status).toBe(401);
    expect(openSession).not.toHaveBeenCalled();
  });

  it('Test 2c: rate-limited login (429) creates no Attendance session', async () => {
    vi.mocked(rateLimit).mockReturnValue({ ok: false, retryAfterSecs: 900 } as never);
    const res = await POST(makeReq({ username: 'cs1', password: 'x' }));
    expect(res.status).toBe(429);
    expect(openSession).not.toHaveBeenCalled();
  });

  it('Test F: attendance DB failure (openSession throws) does not block a successful login', async () => {
    vi.mocked(openSession).mockRejectedValueOnce(new Error('attendance db offline'));
    const res = await POST(makeReq({ username: 'cs1', password: 'x' }));
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; role: string };
    expect(body).toEqual({ ok: true, role: 'CS' });
  });

  it('Test F2: attendance DB failure (finalizeStaleOpenSessions throws) does not block a successful login', async () => {
    vi.mocked(finalizeStaleOpenSessions).mockRejectedValueOnce(new Error('attendance db offline'));
    const res = await POST(makeReq({ username: 'cs1', password: 'x' }));
    expect(res.status).toBe(200);
  });

  it('Test 11: successful-login response contract is unchanged — body, status, cookie name/options', async () => {
    const res = await POST(makeReq({ username: 'cs1', password: 'x' }));
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; role: string };
    expect(body).toEqual({ ok: true, role: 'CS' });

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('erp_session=signed.jwt.token');
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Max-Age=28800/i);
    expect(setCookie).toMatch(/Path=\//i);
  });

  it('Test 11b: failed-login response contract is unchanged — no cookie set', async () => {
    vi.mocked(comparePassword).mockResolvedValue(false);
    const res = await POST(makeReq({ username: 'cs1', password: 'wrong' }));
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body).toEqual({ error: 'Invalid credentials' });
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('Test E: cross-midnight — attendance date follows the real getAttendanceTimezone()+resolveAttendanceDate() pipeline, not a second date mechanism', async () => {
    // Prove the route calls the real functions with the login instant, not a
    // JS Date-derived value computed independently in the route itself.
    let capturedInstant: string | undefined;
    vi.mocked(resolveAttendanceDate).mockImplementation((instant) => {
      capturedInstant = instant as string;
      return '2026-08-12'; // arbitrary distinguishable return
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-11T16:01:00.000Z')); // 00:01 KL on Aug 12
    await POST(makeReq({ username: 'cs1', password: 'x' }));
    expect(capturedInstant).toBe('2026-08-11T16:01:00.000Z');
    expect(openSession).toHaveBeenCalledWith(expect.objectContaining({ attendanceDate: '2026-08-12' }));
  });
});
