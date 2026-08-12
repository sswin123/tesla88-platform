import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/require_permission', () => ({ requirePermissionStrict: vi.fn() }));
vi.mock('@/lib/repositories/staff_attendance_repo', () => ({ getAttendanceStatistics: vi.fn() }));

import { requirePermissionStrict } from '@/lib/require_permission';
import { getAttendanceStatistics } from '@/lib/repositories/staff_attendance_repo';
import { GET } from '@/app/api/staff/attendance/statistics/route';

beforeEach(() => vi.clearAllMocks());

function req(qs: string) {
  return new Request(`http://localhost/api/staff/attendance/statistics${qs}`) as never;
}

describe('GET /api/staff/attendance/statistics', () => {
  it('401/403 pass through requirePermissionStrict unchanged', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: false, status: 401 });
    expect((await GET(req('?date_from=2026-08-01&date_to=2026-08-31'))).status).toBe(401);
  });

  it('403 without staff.attendance.view', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: false, status: 403 });
    expect((await GET(req('?date_from=2026-08-01&date_to=2026-08-31'))).status).toBe(403);
  });

  it('400 when date_from or date_to is missing', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 1, username: 'a', role: 'SUPER_ADMIN', iat: 0, exp: 0 } });
    expect((await GET(req('?date_from=2026-08-01'))).status).toBe(400);
    expect((await GET(req('?date_to=2026-08-31'))).status).toBe(400);
  });

  it('400 for a malformed date_from', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 1, username: 'a', role: 'SUPER_ADMIN', iat: 0, exp: 0 } });
    const res = await GET(req('?date_from=2026/08/01&date_to=2026-08-31'));
    expect(res.status).toBe(400);
    expect(getAttendanceStatistics).not.toHaveBeenCalled();
  });

  it('400 for a reversed date range (date_from after date_to)', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 1, username: 'a', role: 'SUPER_ADMIN', iat: 0, exp: 0 } });
    const res = await GET(req('?date_from=2026-08-31&date_to=2026-08-01'));
    expect(res.status).toBe(400);
    expect(getAttendanceStatistics).not.toHaveBeenCalled();
  });

  it('400 for a non-numeric staff_id', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 1, username: 'a', role: 'SUPER_ADMIN', iat: 0, exp: 0 } });
    const res = await GET(req('?date_from=2026-08-01&date_to=2026-08-31&staff_id=abc'));
    expect(res.status).toBe(400);
  });

  it('[Case A: Single Staff Monthly] staff_id alone returns that staff scoped to the month range', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 1, username: 'a', role: 'SUPER_ADMIN', iat: 0, exp: 0 } });
    vi.mocked(getAttendanceStatistics).mockResolvedValue([
      { staffId: 5, department: 'CS', status: 'PRESENT', count: 18, totalWorkingMinutes: 9720, totalLateMinutes: 0, totalEarlyLeaveMinutes: 0 },
    ]);
    const res = await GET(req('?date_from=2026-08-01&date_to=2026-08-31&staff_id=5'));
    expect(getAttendanceStatistics).toHaveBeenCalledWith({ dateFrom: '2026-08-01', dateTo: '2026-08-31', staffId: 5, department: null, viewerRole: 'SUPER_ADMIN' });
    expect(res.status).toBe(200);
  });

  it('[Case B: All Staff Monthly] no staff_id and no department scopes the whole company', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 1, username: 'a', role: 'SUPER_ADMIN', iat: 0, exp: 0 } });
    vi.mocked(getAttendanceStatistics).mockResolvedValue([]);
    await GET(req('?date_from=2026-08-01&date_to=2026-08-31'));
    expect(getAttendanceStatistics).toHaveBeenCalledWith({ dateFrom: '2026-08-01', dateTo: '2026-08-31', staffId: null, department: null, viewerRole: 'SUPER_ADMIN' });
  });

  it('[Case C: Department Monthly] department alone (no staff_id) scopes to that department', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 1, username: 'a', role: 'SUPER_ADMIN', iat: 0, exp: 0 } });
    vi.mocked(getAttendanceStatistics).mockResolvedValue([]);
    await GET(req('?date_from=2026-08-01&date_to=2026-08-31&department=CS'));
    expect(getAttendanceStatistics).toHaveBeenCalledWith({ dateFrom: '2026-08-01', dateTo: '2026-08-31', staffId: null, department: 'CS', viewerRole: 'SUPER_ADMIN' });
  });

  it('[Case D: Date Range] an arbitrary (non-full-month) range is passed through untouched', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 1, username: 'a', role: 'SUPER_ADMIN', iat: 0, exp: 0 } });
    vi.mocked(getAttendanceStatistics).mockResolvedValue([]);
    await GET(req('?date_from=2026-08-05&date_to=2026-08-19'));
    expect(getAttendanceStatistics).toHaveBeenCalledWith({ dateFrom: '2026-08-05', dateTo: '2026-08-19', staffId: null, department: null, viewerRole: 'SUPER_ADMIN' });
  });

  it('[Case P/Q: SUPER_ADMIN visibility] the caller\'s role is passed through to the repository — visibility filtering itself lives in SQL (Task 14 pattern), not the route', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 3, username: 'cs1', role: 'CS', iat: 0, exp: 0 } });
    vi.mocked(getAttendanceStatistics).mockResolvedValue([]);
    await GET(req('?date_from=2026-08-01&date_to=2026-08-31'));
    expect(getAttendanceStatistics).toHaveBeenCalledWith(expect.objectContaining({ viewerRole: 'CS' }));
  });

  it('[Cases E–J: status buckets] aggregates rows into byStatus, covering ABSENT/REST_DAY/WORKED_ON_REST_DAY/LATE/EARLY_LEAVE/INCOMPLETE', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 1, username: 'a', role: 'SUPER_ADMIN', iat: 0, exp: 0 } });
    vi.mocked(getAttendanceStatistics).mockResolvedValue([
      { staffId: 5, department: 'CS', status: 'ABSENT', count: 2, totalWorkingMinutes: 0, totalLateMinutes: 0, totalEarlyLeaveMinutes: 0 },
      { staffId: 5, department: 'CS', status: 'REST_DAY', count: 8, totalWorkingMinutes: 0, totalLateMinutes: 0, totalEarlyLeaveMinutes: 0 },
      { staffId: 6, department: 'CS', status: 'WORKED_ON_REST_DAY', count: 1, totalWorkingMinutes: 480, totalLateMinutes: 0, totalEarlyLeaveMinutes: 0 },
      { staffId: 6, department: 'CS', status: 'LATE', count: 3, totalWorkingMinutes: 1440, totalLateMinutes: 30, totalEarlyLeaveMinutes: 0 },
      { staffId: 7, department: 'FINANCE', status: 'EARLY_LEAVE', count: 1, totalWorkingMinutes: 480, totalLateMinutes: 0, totalEarlyLeaveMinutes: 20 },
      { staffId: 7, department: 'FINANCE', status: 'INCOMPLETE', count: 1, totalWorkingMinutes: 120, totalLateMinutes: 0, totalEarlyLeaveMinutes: 0 },
    ]);
    const res = await GET(req('?date_from=2026-08-01&date_to=2026-08-31'));
    const body = await res.json() as { rows: unknown[]; byStatus: Record<string, number>; byDepartment: Record<string, Record<string, number>> };
    expect(body.byStatus).toEqual({ ABSENT: 2, REST_DAY: 8, WORKED_ON_REST_DAY: 1, LATE: 3, EARLY_LEAVE: 1, INCOMPLETE: 1 });
    expect(body.byDepartment.CS).toEqual({ ABSENT: 2, REST_DAY: 8, WORKED_ON_REST_DAY: 1, LATE: 3 });
    expect(body.byDepartment.FINANCE).toEqual({ EARLY_LEAVE: 1, INCOMPLETE: 1 });
    expect(body.rows).toHaveLength(6);
  });

  it('empty result set still returns 200 with empty rows/byStatus/byDepartment', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 1, username: 'a', role: 'SUPER_ADMIN', iat: 0, exp: 0 } });
    vi.mocked(getAttendanceStatistics).mockResolvedValue([]);
    const res = await GET(req('?date_from=2026-08-01&date_to=2026-08-31'));
    expect(res.status).toBe(200);
    const body = await res.json() as { rows: unknown[]; byStatus: Record<string, number>; byDepartment: Record<string, Record<string, number>> };
    expect(body).toEqual({ rows: [], byStatus: {}, byDepartment: {} });
  });
});
