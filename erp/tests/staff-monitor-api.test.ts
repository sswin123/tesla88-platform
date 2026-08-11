// erp/tests/staff-monitor-api.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/require_permission', () => ({ requirePermissionStrict: vi.fn() }));
vi.mock('@/lib/repositories/staff_monitor_repo', () => ({
  getMonitorSnapshot:  vi.fn(),
  getStaffMonitorRow:  vi.fn(),
  getRecentActivity:   vi.fn(),
}));

import { requirePermissionStrict } from '@/lib/require_permission';
import { getMonitorSnapshot, getStaffMonitorRow, getRecentActivity } from '@/lib/repositories/staff_monitor_repo';
import { GET as GET_LIST } from '@/app/api/staff/monitor/route';
import { GET as GET_ONE } from '@/app/api/staff/monitor/[id]/route';

beforeEach(() => vi.clearAllMocks());

const ROW = {
  id: 1, display_name: 'Aaron', erp_username: 'aaron', department: 'Support', role: 'CS',
  status: 'ONLINE', current_module: 'member', current_page: 'list',
  login_at: new Date().toISOString(), last_activity: new Date().toISOString(),
  current_ip: '1.2.3.4', browser: 'Chrome', device: 'Desktop', operating_system: 'macOS',
};

describe('GET /api/staff/monitor', () => {
  it('returns 401 when not logged in', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: false, status: 401 });
    const res = await GET_LIST();
    expect(res.status).toBe(401);
  });

  it('returns 403 when logged in but lacking permission', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: false, status: 403 });
    const res = await GET_LIST();
    expect(res.status).toBe(403);
  });

  it('returns staff with a computed display_status', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 9, username: 'x', role: 'SUPER_ADMIN', iat: 0, exp: 0 } });
    vi.mocked(getMonitorSnapshot).mockResolvedValue([ROW] as never);
    const res = await GET_LIST();
    expect(res.status).toBe(200);
    const data = await res.json() as { staff: { display_status: string }[] };
    expect(data.staff[0].display_status).toBe('ONLINE');
  });

  it('Test 4 (SUPER_ADMIN visibility): passes the caller\'s role through to getMonitorSnapshot() — this is what makes SUPER_ADMIN visible to a SUPER_ADMIN viewer', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 9, username: 'root', role: 'SUPER_ADMIN', iat: 0, exp: 0 } });
    vi.mocked(getMonitorSnapshot).mockResolvedValue([ROW] as never);
    await GET_LIST();
    expect(getMonitorSnapshot).toHaveBeenCalledWith('SUPER_ADMIN');
  });

  it('Test 3 (SUPER_ADMIN visibility): a normal Admin\'s role is passed through unchanged — the exclusion itself lives in the repository, not the route', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 3, username: 'cs1', role: 'CS', iat: 0, exp: 0 } });
    vi.mocked(getMonitorSnapshot).mockResolvedValue([ROW] as never);
    await GET_LIST();
    expect(getMonitorSnapshot).toHaveBeenCalledWith('CS');
  });
});

function makeIdReq(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/staff/monitor/[id]', () => {
  it('returns 403 when lacking permission', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: false, status: 403 });
    const res = await GET_ONE(new Request('http://localhost') as never, makeIdReq('1') as never);
    expect(res.status).toBe(403);
  });

  it('returns 400 for a non-numeric id', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 9, username: 'x', role: 'SUPER_ADMIN', iat: 0, exp: 0 } });
    const res = await GET_ONE(new Request('http://localhost') as never, makeIdReq('abc') as never);
    expect(res.status).toBe(400);
  });

  it('returns 404 when staff not found', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 9, username: 'x', role: 'SUPER_ADMIN', iat: 0, exp: 0 } });
    vi.mocked(getStaffMonitorRow).mockResolvedValue(null);
    const res = await GET_ONE(new Request('http://localhost') as never, makeIdReq('999') as never);
    expect(res.status).toBe(404);
  });

  it('returns staff detail with recent activity and display_status', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 9, username: 'x', role: 'SUPER_ADMIN', iat: 0, exp: 0 } });
    vi.mocked(getStaffMonitorRow).mockResolvedValue(ROW as never);
    vi.mocked(getRecentActivity).mockResolvedValue([{ id: 1, staff_id: 1, activity: 'LOGIN', module: null, page: null, description: null, created_at: new Date().toISOString() }] as never);
    const res = await GET_ONE(new Request('http://localhost') as never, makeIdReq('1') as never);
    expect(res.status).toBe(200);
    const data = await res.json() as { display_status: string; recent_activity: unknown[] };
    expect(data.display_status).toBe('ONLINE');
    expect(data.recent_activity).toHaveLength(1);
  });

  it('SUPER_ADMIN visibility: passes the caller\'s role through to getStaffMonitorRow()', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 3, username: 'cs1', role: 'CS', iat: 0, exp: 0 } });
    vi.mocked(getStaffMonitorRow).mockResolvedValue(null);
    await GET_ONE(new Request('http://localhost') as never, makeIdReq('1') as never);
    expect(getStaffMonitorRow).toHaveBeenCalledWith(1, 'CS');
  });

  it('a normal Admin directly requesting a SUPER_ADMIN\'s id gets 404 — the repository\'s WHERE clause excludes the row entirely, no separate role check needed here', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 3, username: 'cs1', role: 'CS', iat: 0, exp: 0 } });
    vi.mocked(getStaffMonitorRow).mockResolvedValue(null); // repository already filtered it out
    const res = await GET_ONE(new Request('http://localhost') as never, makeIdReq('9') as never);
    expect(res.status).toBe(404);
  });
});
