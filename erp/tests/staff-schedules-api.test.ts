import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/require_permission', () => ({ requirePermissionStrict: vi.fn() }));
vi.mock('@/lib/repositories/audit_repo', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/repositories/staff_schedule_repo', () => ({
  createTemplate: vi.fn(),
  listTemplates: vi.fn(),
  updateTemplate: vi.fn(),
  deactivateTemplate: vi.fn(),
  createAssignment: vi.fn(),
  getTargetStaffRole: vi.fn(),
  ScheduleOverlapError: class ScheduleOverlapError extends Error {},
}));

import { requirePermissionStrict } from '@/lib/require_permission';
import { logAudit } from '@/lib/repositories/audit_repo';
import {
  createTemplate, listTemplates, updateTemplate, deactivateTemplate,
  createAssignment, getTargetStaffRole, ScheduleOverlapError,
} from '@/lib/repositories/staff_schedule_repo';
import { GET, POST } from '@/app/api/staff/schedules/route';
import { PATCH, DELETE } from '@/app/api/staff/schedules/[id]/route';
import { POST as POST_ASSIGNMENT } from '@/app/api/staff/schedules/assignments/route';

beforeEach(() => vi.clearAllMocks());

const SUPER_ADMIN_AUTH = { ok: true as const, payload: { sub: 1, username: 'root', role: 'SUPER_ADMIN', iat: 0, exp: 0 } };
const NORMAL_ADMIN_AUTH = { ok: true as const, payload: { sub: 3, username: 'cs1', role: 'CS', iat: 0, exp: 0 } };

function jsonReq(body: unknown) {
  return new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as never;
}
function idParams(id: string) { return { params: Promise.resolve({ id }) } as never; }

function pgError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

const VALID_TEMPLATE_BODY = { name: 'Morning', startTime: '09:00', endTime: '18:00', workingDays: [1, 2, 3, 4, 5], lateGraceMinutes: 5 };
const VALID_ASSIGNMENT_BODY = { staffId: 5, templateId: 1, effectiveFrom: '2026-08-11', effectiveTo: null };

describe('GET/POST /api/staff/schedules — Template', () => {
  it('Auth 401', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: false, status: 401 });
    expect((await GET()).status).toBe(401);
  });

  it('Auth 403', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: false, status: 403 });
    expect((await GET()).status).toBe(403);
    expect((await POST(jsonReq(VALID_TEMPLATE_BODY))).status).toBe(403);
  });

  it('GET 200 with templates', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    vi.mocked(listTemplates).mockResolvedValue([{ id: 1 } as never]);
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it('POST 200 creates a template, createdBy from JWT (not body)', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(NORMAL_ADMIN_AUTH);
    vi.mocked(createTemplate).mockResolvedValue(1);
    const res = await POST(jsonReq({ ...VALID_TEMPLATE_BODY, createdBy: 999 }));
    expect(res.status).toBe(200);
    expect(createTemplate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Morning', createdBy: 3 }));
  });

  it('POST missing required field → 400', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    const res = await POST(jsonReq({ name: 'Morning' }));
    expect(res.status).toBe(400);
    expect(createTemplate).not.toHaveBeenCalled();
  });

  it('POST invalid startTime (repo validation Error) → 400', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    vi.mocked(createTemplate).mockRejectedValueOnce(new Error('staff_schedule_repo: invalid startTime: 9:00 (expected HH:MM or HH:MM:SS)'));
    const res = await POST(jsonReq({ ...VALID_TEMPLATE_BODY, startTime: '9:00' }));
    expect(res.status).toBe(400);
  });

  it('POST startTime === endTime (repo validation Error) → 400', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    vi.mocked(createTemplate).mockRejectedValueOnce(new Error('staff_schedule_repo: startTime and endTime cannot be equal (09:00) — this is an invalid schedule, not a 24-hour shift'));
    const res = await POST(jsonReq({ ...VALID_TEMPLATE_BODY, startTime: '09:00', endTime: '09:00' }));
    expect(res.status).toBe(400);
  });

  it('POST invalid working_days (repo validation Error) → 400', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    vi.mocked(createTemplate).mockRejectedValueOnce(new Error('staff_schedule_repo: invalid working_days value 8 — must be an integer 1-7 (ISO weekday, 1=Mon..7=Sun)'));
    const res = await POST(jsonReq({ ...VALID_TEMPLATE_BODY, workingDays: [1, 8] }));
    expect(res.status).toBe(400);
  });

  it('POST duplicate weekday (repo validation Error) → 400', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    vi.mocked(createTemplate).mockRejectedValueOnce(new Error('staff_schedule_repo: working_days contains duplicate weekday value(s): [1,1]'));
    const res = await POST(jsonReq({ ...VALID_TEMPLATE_BODY, workingDays: [1, 1] }));
    expect(res.status).toBe(400);
  });

  it('POST invalid grace minutes (repo validation Error) → 400', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    vi.mocked(createTemplate).mockRejectedValueOnce(new Error('staff_schedule_repo: invalid late_grace_minutes -1 — must be an integer >= 0'));
    const res = await POST(jsonReq({ ...VALID_TEMPLATE_BODY, lateGraceMinutes: -1 }));
    expect(res.status).toBe(400);
  });

  it('POST an unexpected non-validation error propagates as 500, not silently mapped to 400', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    vi.mocked(createTemplate).mockRejectedValueOnce(new Error('connection terminated unexpectedly'));
    const res = await POST(jsonReq(VALID_TEMPLATE_BODY));
    expect(res.status).toBe(500);
  });

  it('POST success → audit log written with actor from JWT', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(NORMAL_ADMIN_AUTH);
    vi.mocked(createTemplate).mockResolvedValue(7);
    await POST(jsonReq(VALID_TEMPLATE_BODY));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      admin_id: 3, action: 'SCHEDULE_TEMPLATE_CREATED', target_type: 'schedule_template', target_id: 7,
    }));
  });

  it('POST failure → no audit log written', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    vi.mocked(createTemplate).mockRejectedValueOnce(new Error('staff_schedule_repo: invalid startTime: x'));
    await POST(jsonReq(VALID_TEMPLATE_BODY));
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe('PATCH/DELETE /api/staff/schedules/[id] — Template', () => {
  it('PATCH 401', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: false, status: 401 });
    expect((await PATCH(jsonReq({ name: 'x' }), idParams('1'))).status).toBe(401);
  });

  it('PATCH 403', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: false, status: 403 });
    expect((await PATCH(jsonReq({ name: 'x' }), idParams('1'))).status).toBe(403);
  });

  it('PATCH invalid (non-numeric) id → 400', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    const res = await PATCH(jsonReq({ name: 'x' }), idParams('abc'));
    expect(res.status).toBe(400);
    expect(updateTemplate).not.toHaveBeenCalled();
  });

  it('PATCH 200 on success', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    vi.mocked(updateTemplate).mockResolvedValue({ id: 1, name: 'Renamed' } as never);
    const res = await PATCH(jsonReq({ name: 'Renamed' }), idParams('1'));
    expect(res.status).toBe(200);
    expect(updateTemplate).toHaveBeenCalledWith(1, { name: 'Renamed' });
  });

  it('PATCH nonexistent id (repo returns null) → 404', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    vi.mocked(updateTemplate).mockResolvedValue(null);
    const res = await PATCH(jsonReq({ name: 'Renamed' }), idParams('999'));
    expect(res.status).toBe(404);
  });

  it('PATCH validation error (repo Error) → 400', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    vi.mocked(updateTemplate).mockRejectedValueOnce(new Error('staff_schedule_repo: invalid startTime: 9:00'));
    const res = await PATCH(jsonReq({ startTime: '9:00' }), idParams('1'));
    expect(res.status).toBe(400);
  });

  it('PATCH success → audit log written', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(NORMAL_ADMIN_AUTH);
    vi.mocked(updateTemplate).mockResolvedValue({ id: 1, name: 'Renamed' } as never);
    await PATCH(jsonReq({ name: 'Renamed' }), idParams('1'));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      admin_id: 3, action: 'SCHEDULE_TEMPLATE_UPDATED', target_type: 'schedule_template', target_id: 1,
    }));
  });

  it('PATCH not-found → no audit log written', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    vi.mocked(updateTemplate).mockResolvedValue(null);
    await PATCH(jsonReq({ name: 'x' }), idParams('999'));
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('DELETE deactivates and returns 200', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    vi.mocked(deactivateTemplate).mockResolvedValue({ id: 1, is_active: false } as never);
    const res = await DELETE(new Request('http://localhost') as never, idParams('1'));
    expect(deactivateTemplate).toHaveBeenCalledWith(1);
    expect(res.status).toBe(200);
  });

  it('DELETE nonexistent id (repo returns null) → 404', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    vi.mocked(deactivateTemplate).mockResolvedValue(null);
    const res = await DELETE(new Request('http://localhost') as never, idParams('999'));
    expect(res.status).toBe(404);
  });

  it('DELETE invalid (non-numeric) id → 400', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    const res = await DELETE(new Request('http://localhost') as never, idParams('abc'));
    expect(res.status).toBe(400);
    expect(deactivateTemplate).not.toHaveBeenCalled();
  });

  it('DELETE success → audit log written', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(NORMAL_ADMIN_AUTH);
    vi.mocked(deactivateTemplate).mockResolvedValue({ id: 1, is_active: false } as never);
    await DELETE(new Request('http://localhost') as never, idParams('1'));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      admin_id: 3, action: 'SCHEDULE_TEMPLATE_DEACTIVATED', target_type: 'schedule_template', target_id: 1,
    }));
  });

  it('DELETE not-found → no audit log written', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    vi.mocked(deactivateTemplate).mockResolvedValue(null);
    await DELETE(new Request('http://localhost') as never, idParams('999'));
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe('POST /api/staff/schedules/assignments', () => {
  beforeEach(() => {
    vi.mocked(getTargetStaffRole).mockResolvedValue('CS'); // default: target is a normal staff member
  });

  it('Auth 401', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: false, status: 401 });
    expect((await POST_ASSIGNMENT(jsonReq(VALID_ASSIGNMENT_BODY))).status).toBe(401);
  });

  it('Auth 403', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: false, status: 403 });
    expect((await POST_ASSIGNMENT(jsonReq(VALID_ASSIGNMENT_BODY))).status).toBe(403);
  });

  it('200 on success, createdBy from JWT', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(NORMAL_ADMIN_AUTH);
    vi.mocked(createAssignment).mockResolvedValue(1);
    const res = await POST_ASSIGNMENT(jsonReq({ ...VALID_ASSIGNMENT_BODY, createdBy: 999 }));
    expect(res.status).toBe(200);
    expect(createAssignment).toHaveBeenCalledWith(expect.objectContaining({ staffId: 5, templateId: 1, createdBy: 3 }));
  });

  it('missing required field → 400', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    const res = await POST_ASSIGNMENT(jsonReq({ staffId: 5, templateId: 1 }));
    expect(res.status).toBe(400);
    expect(createAssignment).not.toHaveBeenCalled();
  });

  it('invalid date range (repo validation Error) → 400', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    vi.mocked(createAssignment).mockRejectedValueOnce(new Error('staff_schedule_repo: effectiveFrom (2026-08-31) must not be after effectiveTo (2026-08-01)'));
    const res = await POST_ASSIGNMENT(jsonReq({ ...VALID_ASSIGNMENT_BODY, effectiveFrom: '2026-08-31', effectiveTo: '2026-08-01' }));
    expect(res.status).toBe(400);
  });

  it('overlap → 409', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    vi.mocked(createAssignment).mockRejectedValueOnce(new ScheduleOverlapError('overlap'));
    const res = await POST_ASSIGNMENT(jsonReq(VALID_ASSIGNMENT_BODY));
    expect(res.status).toBe(409);
  });

  it('adjacent range is allowed (repo simply succeeds — no special-casing in the route)', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    vi.mocked(createAssignment).mockResolvedValue(2);
    const res = await POST_ASSIGNMENT(jsonReq({ ...VALID_ASSIGNMENT_BODY, effectiveFrom: '2026-09-01' }));
    expect(res.status).toBe(200);
  });

  it('nonexistent staff (FK violation 23503) → controlled 400, not a raw Postgres error', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    vi.mocked(createAssignment).mockRejectedValueOnce(pgError('23503', 'insert or update on table "staff_schedule_assignments" violates foreign key constraint "staff_schedule_assignments_staff_id_fkey"'));
    const res = await POST_ASSIGNMENT(jsonReq(VALID_ASSIGNMENT_BODY));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).not.toMatch(/violates foreign key constraint/); // raw PG message not leaked
  });

  it('nonexistent template (FK violation 23503) → controlled 400', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    vi.mocked(createAssignment).mockRejectedValueOnce(pgError('23503', 'insert or update on table "staff_schedule_assignments" violates foreign key constraint "staff_schedule_assignments_template_id_fkey"'));
    const res = await POST_ASSIGNMENT(jsonReq(VALID_ASSIGNMENT_BODY));
    expect(res.status).toBe(400);
  });

  it('success → audit log written with actor from JWT', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(NORMAL_ADMIN_AUTH);
    vi.mocked(createAssignment).mockResolvedValue(9);
    await POST_ASSIGNMENT(jsonReq(VALID_ASSIGNMENT_BODY));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      admin_id: 3, action: 'SCHEDULE_ASSIGNMENT_CREATED', target_type: 'schedule_assignment', target_id: 9,
    }));
  });

  it('failure → no audit log written', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
    vi.mocked(createAssignment).mockRejectedValueOnce(new ScheduleOverlapError('overlap'));
    await POST_ASSIGNMENT(jsonReq(VALID_ASSIGNMENT_BODY));
    expect(logAudit).not.toHaveBeenCalled();
  });

  describe('SUPER_ADMIN protection', () => {
    it('a normal Admin cannot create an Assignment targeting a SUPER_ADMIN staff — 403, target role read from DB', async () => {
      vi.mocked(requirePermissionStrict).mockResolvedValue(NORMAL_ADMIN_AUTH);
      vi.mocked(getTargetStaffRole).mockResolvedValue('SUPER_ADMIN');
      const res = await POST_ASSIGNMENT(jsonReq(VALID_ASSIGNMENT_BODY));
      expect(res.status).toBe(403);
      expect(getTargetStaffRole).toHaveBeenCalledWith(5);
      expect(createAssignment).not.toHaveBeenCalled();
    });

    it('a SUPER_ADMIN viewer CAN create an Assignment targeting a SUPER_ADMIN staff', async () => {
      vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
      vi.mocked(getTargetStaffRole).mockResolvedValue('SUPER_ADMIN');
      vi.mocked(createAssignment).mockResolvedValue(1);
      const res = await POST_ASSIGNMENT(jsonReq(VALID_ASSIGNMENT_BODY));
      expect(res.status).toBe(200);
    });

    it('a SUPER_ADMIN viewer can create an Assignment targeting a normal staff member', async () => {
      vi.mocked(requirePermissionStrict).mockResolvedValue(SUPER_ADMIN_AUTH);
      vi.mocked(getTargetStaffRole).mockResolvedValue('CS');
      vi.mocked(createAssignment).mockResolvedValue(1);
      const res = await POST_ASSIGNMENT(jsonReq(VALID_ASSIGNMENT_BODY));
      expect(res.status).toBe(200);
    });

    it('a normal Admin creating an Assignment for a normal staff member is unaffected', async () => {
      vi.mocked(requirePermissionStrict).mockResolvedValue(NORMAL_ADMIN_AUTH);
      vi.mocked(getTargetStaffRole).mockResolvedValue('CS');
      vi.mocked(createAssignment).mockResolvedValue(1);
      const res = await POST_ASSIGNMENT(jsonReq(VALID_ASSIGNMENT_BODY));
      expect(res.status).toBe(200);
    });

    it('body cannot spoof the target role check — the check always queries the DB by staffId, ignoring any role-like field in the body', async () => {
      vi.mocked(requirePermissionStrict).mockResolvedValue(NORMAL_ADMIN_AUTH);
      vi.mocked(getTargetStaffRole).mockResolvedValue('SUPER_ADMIN');
      const res = await POST_ASSIGNMENT(jsonReq({ ...VALID_ASSIGNMENT_BODY, role: 'CS', isSuperAdmin: false, viewerRole: 'SUPER_ADMIN' }));
      expect(res.status).toBe(403);
    });
  });
});
