import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/require_permission', () => ({ requirePermissionStrict: vi.fn() }));
vi.mock('@/lib/repositories/audit_repo', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/repositories/staff_schedule_repo', () => ({
  createOverride: vi.fn(),
  getTargetStaffRole: vi.fn(),
  ScheduleOverrideConflictError: class ScheduleOverrideConflictError extends Error {},
}));

import { requirePermissionStrict } from '@/lib/require_permission';
import { logAudit } from '@/lib/repositories/audit_repo';
import {
  createOverride, getTargetStaffRole, ScheduleOverrideConflictError,
} from '@/lib/repositories/staff_schedule_repo';
import { POST } from '@/app/api/staff/schedules/overrides/route';

beforeEach(() => vi.clearAllMocks());

const SUPER_ADMIN_AUTH = { ok: true as const, payload: { sub: 1, username: 'root', role: 'SUPER_ADMIN', iat: 0, exp: 0 } };
const NORMAL_ADMIN_AUTH = { ok: true as const, payload: { sub: 3, username: 'cs1', role: 'CS', iat: 0, exp: 0 } };

function jsonReq(body: unknown) {
  return new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as never;
}

function pgError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

const VALID_TIME_SHIFT_BODY = { staffId: 5, overrideDate: '2026-08-15', isRestDay: false, startTime: '10:00', endTime: '19:00', lateGraceMinutes: 5, reason: 'Special shift' };
const VALID_REST_DAY_BODY = { staffId: 5, overrideDate: '2026-08-15', isRestDay: true, reason: 'Public holiday' };

describe('POST /api/staff/schedules/overrides', () => {
  beforeEach(() => {
    vi.mocked(getTargetStaffRole).mockResolvedValue('CS'); // default: target is a normal staff member
  });

  it('Auth 401', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: false, status: 401 });
    expect((await POST(jsonReq(VALID_TIME_SHIFT_BODY))).status).toBe(401);
  });

  it('Auth 403 (no staff.schedule.manage)', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: false, status: 403 });
    expect((await POST(jsonReq(VALID_TIME_SHIFT_BODY))).status).toBe(403);
  });

  it('200 on success for a normal Admin creating a normal time-shift override', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(NORMAL_ADMIN_AUTH);
    vi.mocked(createOverride).mockResolvedValue(1);
    const res = await POST(jsonReq(VALID_TIME_SHIFT_BODY));
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; id: number };
    expect(body).toEqual({ ok: true, id: 1 });
  });

  it('200 on success for a SUPER_ADMIN creating an override', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    vi.mocked(createOverride).mockResolvedValue(2);
    const res = await POST(jsonReq(VALID_TIME_SHIFT_BODY));
    expect(res.status).toBe(200);
  });

  it('rest-day override: startTime/endTime forwarded as null to the repository, not read from body', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(NORMAL_ADMIN_AUTH);
    vi.mocked(createOverride).mockResolvedValue(3);
    const res = await POST(jsonReq({ ...VALID_REST_DAY_BODY, startTime: '08:00', endTime: '17:00' }));
    expect(res.status).toBe(200);
    expect(createOverride).toHaveBeenCalledWith(expect.objectContaining({ isRestDay: true, startTime: null, endTime: null }));
  });

  it('createdBy always comes from JWT sub, never from body', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(NORMAL_ADMIN_AUTH);
    vi.mocked(createOverride).mockResolvedValue(4);
    await POST(jsonReq({ ...VALID_TIME_SHIFT_BODY, createdBy: 999, adminId: 999 }));
    expect(createOverride).toHaveBeenCalledWith(expect.objectContaining({ createdBy: 3 }));
  });

  it('missing staffId → 400', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    const res = await POST(jsonReq({ overrideDate: '2026-08-15', isRestDay: true }));
    expect(res.status).toBe(400);
    expect(createOverride).not.toHaveBeenCalled();
  });

  it('missing overrideDate → 400', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    const res = await POST(jsonReq({ staffId: 5, isRestDay: true }));
    expect(res.status).toBe(400);
    expect(createOverride).not.toHaveBeenCalled();
  });

  it('isRestDay false but startTime/endTime missing → 400 (route-level shape check, repo never called)', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    const res = await POST(jsonReq({ staffId: 5, overrideDate: '2026-08-15', isRestDay: false }));
    expect(res.status).toBe(400);
    expect(createOverride).not.toHaveBeenCalled();
  });

  it('isRestDay defaults to false when omitted', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    const res = await POST(jsonReq({ staffId: 5, overrideDate: '2026-08-15' }));
    expect(res.status).toBe(400);
  });

  it('repository validation error (e.g. invalid time format) → 400', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    vi.mocked(createOverride).mockRejectedValueOnce(new Error('staff_schedule_repo: invalid startTime: 25:99'));
    const res = await POST(jsonReq(VALID_TIME_SHIFT_BODY));
    expect(res.status).toBe(400);
  });

  it('duplicate staff+date (conflict) → 409', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    vi.mocked(createOverride).mockRejectedValueOnce(new ScheduleOverrideConflictError());
    const res = await POST(jsonReq(VALID_TIME_SHIFT_BODY));
    expect(res.status).toBe(409);
  });

  it('nonexistent staff (FK violation 23503) → controlled 400, not a raw Postgres error', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    vi.mocked(createOverride).mockRejectedValueOnce(pgError('23503', 'insert or update on table "staff_schedule_overrides" violates foreign key constraint "staff_schedule_overrides_staff_id_fkey"'));
    const res = await POST(jsonReq(VALID_TIME_SHIFT_BODY));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).not.toMatch(/violates foreign key constraint/);
  });

  it('unexpected error → 500, internal message not leaked', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    vi.mocked(createOverride).mockRejectedValueOnce(new Error('connection terminated unexpectedly'));
    const res = await POST(jsonReq(VALID_TIME_SHIFT_BODY));
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).not.toMatch(/connection terminated/);
  });

  it('success → audit log written with actor from JWT and new_value snapshot', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(NORMAL_ADMIN_AUTH);
    vi.mocked(createOverride).mockResolvedValue(9);
    await POST(jsonReq(VALID_TIME_SHIFT_BODY));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      admin_id: 3, action: 'SCHEDULE_OVERRIDE_CREATED', target_type: 'schedule_override', target_id: 9,
      new_value: expect.objectContaining({ staffId: 5, overrideDate: '2026-08-15', isRestDay: false, startTime: '10:00', endTime: '19:00' }),
    }));
  });

  it('validation failure → no audit log written', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    const res = await POST(jsonReq({ staffId: 5, overrideDate: '2026-08-15', isRestDay: false }));
    expect(res.status).toBe(400);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('conflict (409) failure → no audit log written', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    vi.mocked(createOverride).mockRejectedValueOnce(new ScheduleOverrideConflictError());
    await POST(jsonReq(VALID_TIME_SHIFT_BODY));
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('unexpected (500) failure → no audit log written', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    vi.mocked(createOverride).mockRejectedValueOnce(new Error('db down'));
    await POST(jsonReq(VALID_TIME_SHIFT_BODY));
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('audit failure does not affect the success response (fire-and-forget)', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(NORMAL_ADMIN_AUTH);
    vi.mocked(createOverride).mockResolvedValue(10);
    vi.mocked(logAudit).mockRejectedValueOnce(new Error('audit db down'));
    const res = await POST(jsonReq(VALID_TIME_SHIFT_BODY));
    expect(res.status).toBe(200);
  });

  describe('SUPER_ADMIN target protection', () => {
    it('a normal Admin cannot create an Override targeting a SUPER_ADMIN staff — 403, target role read from DB', async () => {
      vi.mocked(requirePermissionStrict).mockResolvedValue(NORMAL_ADMIN_AUTH);
      vi.mocked(getTargetStaffRole).mockResolvedValue('SUPER_ADMIN');
      const res = await POST(jsonReq(VALID_TIME_SHIFT_BODY));
      expect(res.status).toBe(403);
      expect(getTargetStaffRole).toHaveBeenCalledWith(5);
      expect(createOverride).not.toHaveBeenCalled();
    });

    it('a SUPER_ADMIN viewer CAN create an Override targeting a SUPER_ADMIN staff (no DB lookup needed)', async () => {
      vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
      vi.mocked(createOverride).mockResolvedValue(1);
      const res = await POST(jsonReq(VALID_TIME_SHIFT_BODY));
      expect(res.status).toBe(200);
      expect(getTargetStaffRole).not.toHaveBeenCalled();
    });

    it('a SUPER_ADMIN viewer can create an Override targeting a normal staff member', async () => {
      vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
      vi.mocked(createOverride).mockResolvedValue(1);
      const res = await POST(jsonReq(VALID_TIME_SHIFT_BODY));
      expect(res.status).toBe(200);
    });

    it('a normal Admin creating an Override for a normal staff member is unaffected', async () => {
      vi.mocked(requirePermissionStrict).mockResolvedValue(NORMAL_ADMIN_AUTH);
      vi.mocked(getTargetStaffRole).mockResolvedValue('CS');
      vi.mocked(createOverride).mockResolvedValue(1);
      const res = await POST(jsonReq(VALID_TIME_SHIFT_BODY));
      expect(res.status).toBe(200);
    });

    it('body cannot spoof the target role check — the check always queries the DB by staffId, ignoring any role-like field in the body', async () => {
      vi.mocked(requirePermissionStrict).mockResolvedValue(NORMAL_ADMIN_AUTH);
      vi.mocked(getTargetStaffRole).mockResolvedValue('SUPER_ADMIN');
      const res = await POST(jsonReq({ ...VALID_TIME_SHIFT_BODY, role: 'CS', isSuperAdmin: false, viewerRole: 'SUPER_ADMIN', targetRole: 'CS' }));
      expect(res.status).toBe(403);
    });

    it('403 SUPER_ADMIN protection → no audit log written', async () => {
      vi.mocked(requirePermissionStrict).mockResolvedValue(NORMAL_ADMIN_AUTH);
      vi.mocked(getTargetStaffRole).mockResolvedValue('SUPER_ADMIN');
      await POST(jsonReq(VALID_TIME_SHIFT_BODY));
      expect(logAudit).not.toHaveBeenCalled();
    });
  });
});
