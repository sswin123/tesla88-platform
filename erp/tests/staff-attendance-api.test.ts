import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/require_permission', () => ({ requirePermissionStrict: vi.fn() }));
vi.mock('@/lib/repositories/staff_attendance_repo', () => ({
  listAttendance: vi.fn(),
  getAttendanceDetail: vi.fn(),
}));

import { requirePermissionStrict } from '@/lib/require_permission';
import { listAttendance, getAttendanceDetail } from '@/lib/repositories/staff_attendance_repo';
import { GET as GET_LIST } from '@/app/api/staff/attendance/route';
import { GET as GET_ONE } from '@/app/api/staff/attendance/[id]/route';

beforeEach(() => vi.clearAllMocks());

function reqWithParams(qs = '') {
  return new Request(`http://localhost/api/staff/attendance${qs}`) as never;
}

const ROW = {
  id: 1, staff_id: 5, display_name: 'CS One', erp_username: 'cs1', department: 'Support', role: 'CS',
  attendance_date: '2026-08-10', login_time: '2026-08-10T01:00:00.000Z', logout_time: '2026-08-10T10:00:00.000Z',
  working_minutes: 540, late_minutes: 0, early_leave_minutes: 0, attendance_status: 'PRESENT', checkout_source: 'LOGOUT',
  scheduled_start_at: null, scheduled_end_at: null, schedule_source_type: null, schedule_source_id: null,
  late_grace_minutes: null, is_rest_day: false,
};

describe('GET /api/staff/attendance', () => {
  it('returns 401 when not logged in', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: false, status: 401 });
    const res = await GET_LIST(reqWithParams());
    expect(res.status).toBe(401);
  });

  it('returns 403 without staff.attendance.view', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: false, status: 403 });
    const res = await GET_LIST(reqWithParams());
    expect(res.status).toBe(403);
  });

  it('SUPER_ADMIN bypasses permission checks (requirePermissionStrict already handles this; route just needs to pass role through)', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 1, username: 'root', role: 'SUPER_ADMIN', iat: 0, exp: 0 } });
    vi.mocked(listAttendance).mockResolvedValue({ rows: [ROW], total: 1 });
    const res = await GET_LIST(reqWithParams());
    expect(res.status).toBe(200);
    expect(listAttendance).toHaveBeenCalledWith(expect.objectContaining({ viewerRole: 'SUPER_ADMIN' }));
  });

  it('200 with { data, total, page, limit }', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 1, username: 'cs1', role: 'CS', iat: 0, exp: 0 } });
    vi.mocked(listAttendance).mockResolvedValue({ rows: [ROW], total: 1 });
    const res = await GET_LIST(reqWithParams());
    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[]; total: number; page: number; limit: number };
    expect(body).toEqual({ data: [ROW], total: 1, page: 1, limit: 20 });
  });

  it('parses date_from/date_to/staff_id/department/status and passes viewerRole through', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 1, username: 'cs1', role: 'CS', iat: 0, exp: 0 } });
    vi.mocked(listAttendance).mockResolvedValue({ rows: [], total: 0 });
    await GET_LIST(reqWithParams('?date_from=2026-08-01&date_to=2026-08-31&staff_id=5&department=Support&status=LATE'));
    expect(listAttendance).toHaveBeenCalledWith({
      dateFrom: '2026-08-01', dateTo: '2026-08-31', staffId: 5, department: 'Support', status: 'LATE',
      viewerRole: 'CS', limit: 20, offset: 0,
    });
  });

  it('page=3 computes offset=40 with the fixed limit=20', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 1, username: 'cs1', role: 'CS', iat: 0, exp: 0 } });
    vi.mocked(listAttendance).mockResolvedValue({ rows: [], total: 0 });
    await GET_LIST(reqWithParams('?page=3'));
    expect(listAttendance).toHaveBeenCalledWith(expect.objectContaining({ limit: 20, offset: 40 }));
  });

  it('no date filter at all does not invent a date restriction', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 1, username: 'cs1', role: 'CS', iat: 0, exp: 0 } });
    vi.mocked(listAttendance).mockResolvedValue({ rows: [], total: 0 });
    await GET_LIST(reqWithParams());
    expect(listAttendance).toHaveBeenCalledWith(expect.objectContaining({ dateFrom: null, dateTo: null }));
  });

  it('returns 400 for a malformed date_from', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 1, username: 'cs1', role: 'CS', iat: 0, exp: 0 } });
    const res = await GET_LIST(reqWithParams('?date_from=2026/08/01'));
    expect(res.status).toBe(400);
    expect(listAttendance).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed date_to', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 1, username: 'cs1', role: 'CS', iat: 0, exp: 0 } });
    const res = await GET_LIST(reqWithParams('?date_to=not-a-date'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a non-numeric staff_id', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 1, username: 'cs1', role: 'CS', iat: 0, exp: 0 } });
    const res = await GET_LIST(reqWithParams('?staff_id=abc'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an unrecognized status (including ABSENT/REST_DAY, which are never persisted rows)', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 1, username: 'cs1', role: 'CS', iat: 0, exp: 0 } });
    const res = await GET_LIST(reqWithParams('?status=ABSENT'));
    expect(res.status).toBe(400);
    expect(listAttendance).not.toHaveBeenCalled();
  });

  it('accepts every real persisted status value', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 1, username: 'cs1', role: 'CS', iat: 0, exp: 0 } });
    vi.mocked(listAttendance).mockResolvedValue({ rows: [], total: 0 });
    for (const status of ['PRESENT', 'LATE', 'EARLY_LEAVE', 'LATE_AND_EARLY', 'INCOMPLETE', 'WORKED_ON_REST_DAY']) {
      const res = await GET_LIST(reqWithParams(`?status=${status}`));
      expect(res.status).toBe(200);
    }
  });

  it('empty result set still returns 200 with an empty array', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 1, username: 'cs1', role: 'CS', iat: 0, exp: 0 } });
    vi.mocked(listAttendance).mockResolvedValue({ rows: [], total: 0 });
    const res = await GET_LIST(reqWithParams());
    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[]; total: number };
    expect(body).toEqual({ data: [], total: 0, page: 1, limit: 20 });
  });
});

function makeIdReq(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/staff/attendance/[id]', () => {
  it('returns 401 when not logged in', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: false, status: 401 });
    const res = await GET_ONE(new Request('http://localhost') as never, makeIdReq('1') as never);
    expect(res.status).toBe(401);
  });

  it('returns 403 when lacking permission', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: false, status: 403 });
    const res = await GET_ONE(new Request('http://localhost') as never, makeIdReq('1') as never);
    expect(res.status).toBe(403);
  });

  it('returns 400 for a non-numeric id', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 1, username: 'cs1', role: 'CS', iat: 0, exp: 0 } });
    const res = await GET_ONE(new Request('http://localhost') as never, makeIdReq('abc') as never);
    expect(res.status).toBe(400);
    expect(getAttendanceDetail).not.toHaveBeenCalled();
  });

  it('returns 404 when the row does not exist', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 1, username: 'cs1', role: 'CS', iat: 0, exp: 0 } });
    vi.mocked(getAttendanceDetail).mockResolvedValue(null);
    const res = await GET_ONE(new Request('http://localhost') as never, makeIdReq('999') as never);
    expect(res.status).toBe(404);
  });

  it('a normal Admin cannot retrieve a SUPER_ADMIN\'s attendance detail — repository returns null (same visibility rule), route surfaces it as 404', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 3, username: 'cs1', role: 'CS', iat: 0, exp: 0 } });
    vi.mocked(getAttendanceDetail).mockResolvedValue(null); // repo already filtered it out
    const res = await GET_ONE(new Request('http://localhost') as never, makeIdReq('9') as never);
    expect(res.status).toBe(404);
    expect(getAttendanceDetail).toHaveBeenCalledWith(9, 'CS');
  });

  it('a SUPER_ADMIN viewer can retrieve a SUPER_ADMIN\'s attendance detail', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 1, username: 'root', role: 'SUPER_ADMIN', iat: 0, exp: 0 } });
    vi.mocked(getAttendanceDetail).mockResolvedValue({ ...ROW, role: 'SUPER_ADMIN', sessions: [] });
    const res = await GET_ONE(new Request('http://localhost') as never, makeIdReq('9') as never);
    expect(res.status).toBe(200);
    expect(getAttendanceDetail).toHaveBeenCalledWith(9, 'SUPER_ADMIN');
  });

  it('200 with the attendance row and sessions[], snapshot fields returned exactly as the repository provided them (no recomputation)', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 1, username: 'cs1', role: 'CS', iat: 0, exp: 0 } });
    const detail = {
      ...ROW,
      scheduled_start_at: '2026-08-10T01:00:00.000Z', scheduled_end_at: '2026-08-10T10:00:00.000Z',
      schedule_source_type: 'TEMPLATE', schedule_source_id: 42, late_grace_minutes: 5, is_rest_day: false,
      sessions: [{ id: 10, login_at: '2026-08-10T01:00:00.000Z', logout_at: '2026-08-10T10:00:00.000Z', last_activity_at: '2026-08-10T10:00:00.000Z', checkout_source: 'LOGOUT', working_minutes: 540, ip_address: '1.2.3.4', browser: 'Chrome', device: 'Desktop', operating_system: 'macOS' }],
    };
    vi.mocked(getAttendanceDetail).mockResolvedValue(detail);
    const res = await GET_ONE(new Request('http://localhost') as never, makeIdReq('1') as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(detail);
  });
});
