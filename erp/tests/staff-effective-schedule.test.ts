import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));
vi.mock('@/lib/attendance-timezone', () => ({ getAttendanceTimezone: vi.fn() }));
vi.mock('@/lib/attendance-rules', () => ({ resolveScheduledWindow: vi.fn() }));

import pool from '@/lib/db';
import { getAttendanceTimezone } from '@/lib/attendance-timezone';
import { resolveScheduledWindow } from '@/lib/attendance-rules';
import { getEffectiveSchedule } from '@/lib/repositories/staff_schedule_repo';
import * as fs from 'node:fs';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAttendanceTimezone).mockResolvedValue('Asia/Kuala_Lumpur');
  vi.mocked(resolveScheduledWindow).mockImplementation(({ scheduledStart, scheduledEnd }) => ({
    scheduledStartAt: `2026-08-17T${scheduledStart}:00.000Z`,
    scheduledEndAt: `2026-08-17T${scheduledEnd}:00.000Z`,
    isOvernight: scheduledEnd < scheduledStart,
  }));
});

function mockNoOverride() {
  vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never); // getOverrideByStaffAndDate -> none
}

function mockOverride(row: Record<string, unknown>) {
  vi.mocked(pool.query).mockResolvedValueOnce({ rows: [row] } as never);
}

function mockNoAssignment() {
  vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never); // assignment+template JOIN -> none
}

function mockAssignment(row: Record<string, unknown>) {
  vi.mocked(pool.query).mockResolvedValueOnce({ rows: [row] } as never);
}

describe('getEffectiveSchedule — A. No Schedule', () => {
  it('returns NONE when there is no Override and no Assignment', async () => {
    mockNoOverride();
    mockNoAssignment();
    const result = await getEffectiveSchedule(5, '2026-08-17');
    expect(result).toEqual({
      sourceType: 'NONE', sourceId: null, isRestDay: false,
      scheduledStart: null, scheduledEnd: null, isOvernight: false, lateGraceMinutes: 0,
    });
  });
});

describe('getEffectiveSchedule — B/C. Override', () => {
  it('B: a normal (non-rest-day) Override resolves via resolveScheduledWindow() using its own start_time/end_time', async () => {
    mockOverride({
      id: 10, staff_id: 5, override_date: '2026-08-17', start_time: '10:00:00', end_time: '19:00:00',
      is_rest_day: false, late_grace_minutes: 15, reason: 'special', created_by: 1, created_at: 'x',
    });
    const result = await getEffectiveSchedule(5, '2026-08-17');
    expect(result.sourceType).toBe('OVERRIDE');
    expect(result.sourceId).toBe(10);
    expect(result.isRestDay).toBe(false);
    expect(result.lateGraceMinutes).toBe(15);
    expect(result.scheduledStart).toBe('2026-08-17T10:00:00.000Z');
    expect(result.scheduledEnd).toBe('2026-08-17T19:00:00.000Z');
    // The DB TIME::text format (HH:MM:SS) must be normalized to HH:MM before
    // reaching resolveScheduledWindow(), which rejects anything else.
    expect(resolveScheduledWindow).toHaveBeenCalledWith(
      expect.objectContaining({ scheduledStart: '10:00', scheduledEnd: '19:00' })
    );
  });

  it('C: a Rest Day Override short-circuits — no window resolution, scheduledStart/End null', async () => {
    mockOverride({
      id: 11, staff_id: 5, override_date: '2026-08-17', start_time: null, end_time: null,
      is_rest_day: true, late_grace_minutes: null, reason: null, created_by: 1, created_at: 'x',
    });
    const result = await getEffectiveSchedule(5, '2026-08-17');
    expect(result).toEqual({
      sourceType: 'OVERRIDE', sourceId: 11, isRestDay: true,
      scheduledStart: null, scheduledEnd: null, isOvernight: false, lateGraceMinutes: 0,
    });
    expect(resolveScheduledWindow).not.toHaveBeenCalled();
    // Rest Day short-circuits before ever looking at Assignment.
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('a normal Override with a null late_grace_minutes falls back to the spec default (5 minutes) — Override is self-contained, it cannot borrow a Template\'s grace', async () => {
    mockOverride({
      id: 12, staff_id: 5, override_date: '2026-08-17', start_time: '10:00:00', end_time: '19:00:00',
      is_rest_day: false, late_grace_minutes: null, reason: null, created_by: 1, created_at: 'x',
    });
    const result = await getEffectiveSchedule(5, '2026-08-17');
    expect(result.lateGraceMinutes).toBe(5);
  });

  it('L/M: past and future override dates both resolve normally — no date restriction', async () => {
    mockOverride({
      id: 13, staff_id: 5, override_date: '2020-01-01', start_time: '10:00:00', end_time: '19:00:00',
      is_rest_day: false, late_grace_minutes: 5, reason: null, created_by: 1, created_at: 'x',
    });
    await expect(getEffectiveSchedule(5, '2020-01-01')).resolves.toMatchObject({ sourceType: 'OVERRIDE' });

    mockOverride({
      id: 14, staff_id: 5, override_date: '2030-01-01', start_time: '10:00:00', end_time: '19:00:00',
      is_rest_day: false, late_grace_minutes: 5, reason: null, created_by: 1, created_at: 'x',
    });
    await expect(getEffectiveSchedule(5, '2030-01-01')).resolves.toMatchObject({ sourceType: 'OVERRIDE' });
  });

  it('O: an overnight Override (end < start) is passed through resolveScheduledWindow() unchanged — no second overnight computation here', async () => {
    mockOverride({
      id: 15, staff_id: 5, override_date: '2026-08-17', start_time: '22:00:00', end_time: '06:00:00',
      is_rest_day: false, late_grace_minutes: 5, reason: null, created_by: 1, created_at: 'x',
    });
    const result = await getEffectiveSchedule(5, '2026-08-17');
    expect(result.isOvernight).toBe(true);
    expect(resolveScheduledWindow).toHaveBeenCalledWith(
      expect.objectContaining({ scheduledStart: '22:00', scheduledEnd: '06:00' })
    );
  });

  it('T: is_rest_day=false with a null start_time/end_time is a data-integrity violation and fails loudly (should be structurally impossible via createOverride/updateOverride)', async () => {
    mockOverride({
      id: 16, staff_id: 5, override_date: '2026-08-17', start_time: null, end_time: '19:00:00',
      is_rest_day: false, late_grace_minutes: 5, reason: null, created_by: 1, created_at: 'x',
    });
    await expect(getEffectiveSchedule(5, '2026-08-17')).rejects.toThrow(/data integrity/);
  });
});

describe('getEffectiveSchedule — D. Override takes priority over Assignment', () => {
  it('D: when both an Override and an Assignment exist for the same day, Override wins and Assignment is never even queried', async () => {
    mockOverride({
      id: 20, staff_id: 5, override_date: '2026-08-17', start_time: '10:00:00', end_time: '19:00:00',
      is_rest_day: false, late_grace_minutes: 5, reason: null, created_by: 1, created_at: 'x',
    });
    const result = await getEffectiveSchedule(5, '2026-08-17');
    expect(result.sourceType).toBe('OVERRIDE');
    expect(pool.query).toHaveBeenCalledTimes(1); // only the override lookup ran
  });
});

describe('getEffectiveSchedule — E/F/G/H/I/J/K/P. Assignment', () => {
  it('E/F/P: an Assignment on a matching working day resolves via its Template, using the Template\'s late_grace_minutes', async () => {
    mockNoOverride();
    mockAssignment({ assignment_id: 30, start_time: '09:00:00', end_time: '18:00:00', late_grace_minutes: 5 });
    const result = await getEffectiveSchedule(5, '2026-08-17');
    expect(result.sourceType).toBe('ASSIGNMENT');
    expect(result.sourceId).toBe(30);
    expect(result.lateGraceMinutes).toBe(5);
    expect(resolveScheduledWindow).toHaveBeenCalledWith(
      expect.objectContaining({ scheduledStart: '09:00', scheduledEnd: '18:00' })
    );
  });

  it('G: a non-working day (SQL join returns no rows because of the ISODOW filter) resolves to NONE', async () => {
    mockNoOverride();
    mockNoAssignment();
    const result = await getEffectiveSchedule(5, '2026-08-16'); // Sunday, per the live-verified query
    expect(result.sourceType).toBe('NONE');
  });

  it('H/I/J: boundary and open-ended semantics are enforced entirely by the SQL WHERE clause (live-verified against real Postgres — see commit message), the repository just forwards the row it gets', async () => {
    mockNoOverride();
    mockAssignment({ assignment_id: 31, start_time: '09:00:00', end_time: '18:00:00', late_grace_minutes: 5 });
    const [, params] = await (async () => {
      const result = await getEffectiveSchedule(5, '2026-08-01');
      return [result, vi.mocked(pool.query).mock.calls[1] as unknown as [string, unknown[]]];
    })();
    expect(params[1]).toEqual([5, '2026-08-01']);
    const [sql] = params;
    expect(sql).toContain('effective_from <=');
    expect(sql).toMatch(/effective_to IS NULL OR a\.effective_to >=/);
    expect(sql).toMatch(/is_active\s*=\s*true/);
    expect(sql).toMatch(/ISODOW/);
  });

  it('K: an Assignment whose Template is inactive resolves to NONE (the SQL WHERE clause filters it out — live-verified)', async () => {
    mockNoOverride();
    mockNoAssignment(); // is_active=false means the JOIN query returns 0 rows, live-verified
    const result = await getEffectiveSchedule(5, '2026-08-17');
    expect(result.sourceType).toBe('NONE');
  });

  it('N: an overnight Assignment Template is passed through resolveScheduledWindow() unchanged', async () => {
    mockNoOverride();
    mockAssignment({ assignment_id: 32, start_time: '22:00:00', end_time: '06:00:00', late_grace_minutes: 5 });
    const result = await getEffectiveSchedule(5, '2026-08-17');
    expect(result.isOvernight).toBe(true);
    expect(resolveScheduledWindow).toHaveBeenCalledWith(
      expect.objectContaining({ scheduledStart: '22:00', scheduledEnd: '06:00' })
    );
  });

  it('T2: more than one matching Assignment row is a data-integrity violation and fails loudly instead of silently picking one', async () => {
    mockNoOverride();
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        { assignment_id: 40, start_time: '09:00:00', end_time: '18:00:00', late_grace_minutes: 5 },
        { assignment_id: 41, start_time: '10:00:00', end_time: '19:00:00', late_grace_minutes: 5 },
      ],
    } as never);
    await expect(getEffectiveSchedule(5, '2026-08-17')).rejects.toThrow(/data integrity/);
  });
});

describe('getEffectiveSchedule — R/S. isolation', () => {
  it('R: different staff — the query is always scoped by the exact staffId argument', async () => {
    mockNoOverride();
    mockNoAssignment();
    await getEffectiveSchedule(7, '2026-08-17');
    const [, overrideParams] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    const [, assignmentParams] = vi.mocked(pool.query).mock.calls[1] as unknown as [string, unknown[]];
    expect(overrideParams[0]).toBe(7);
    expect(assignmentParams[0]).toBe(7);
  });

  it('S: different date — the query is always scoped by the exact attendanceDate argument', async () => {
    mockNoOverride();
    mockNoAssignment();
    await getEffectiveSchedule(5, '2026-09-01');
    const [, overrideParams] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(overrideParams[1]).toBe('2026-09-01');
  });
});

describe('getEffectiveSchedule — U/V. ISO weekday convention', () => {
  it('U/V: the SQL join uses EXTRACT(ISODOW ...) — Monday=1..Sunday=7, not JS getDay()\'s Sunday=0', async () => {
    mockNoOverride();
    mockNoAssignment();
    await getEffectiveSchedule(5, '2026-08-17');
    const [sql] = vi.mocked(pool.query).mock.calls[1] as unknown as [string, unknown[]];
    expect(sql).toMatch(/EXTRACT\(ISODOW FROM/i);
    expect(sql).not.toMatch(/getDay\(\)/);
  });
});

describe('getEffectiveSchedule — invalid input', () => {
  it('rejects an invalid attendanceDate before touching the DB', async () => {
    await expect(getEffectiveSchedule(5, '2026-02-30')).rejects.toThrow(/invalid attendanceDate/);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('getEffectiveSchedule — X/Y. single source of truth for timezone/window math', () => {
  it('X: getAttendanceTimezone() is the only timezone source — no direct system_settings read, no second cache', async () => {
    mockNoOverride();
    mockAssignment({ assignment_id: 50, start_time: '09:00:00', end_time: '18:00:00', late_grace_minutes: 5 });
    await getEffectiveSchedule(5, '2026-08-17');
    expect(getAttendanceTimezone).toHaveBeenCalledTimes(1);
  });

  it('Y: resolveScheduledWindow() is the only window/overnight resolver — this file never independently compares end < start to decide isOvernight for a resolved schedule', async () => {
    const source = fs.readFileSync(
      new URL('../src/lib/repositories/staff_schedule_repo.ts', import.meta.url),
      'utf8'
    );
    // Only the pre-existing Template-write-time comparisons (isOvernight column
    // bookkeeping in createTemplate/updateTemplate) may compare end/start times
    // directly — getEffectiveSchedule() itself must delegate entirely.
    const effectiveScheduleSection = source.slice(source.indexOf('export async function getEffectiveSchedule'));
    expect(effectiveScheduleSection).not.toMatch(/endTime\s*<\s*startTime/);
    expect(effectiveScheduleSection).toContain('resolveScheduledWindow(');
  });
});

describe('getEffectiveSchedule — W. historical Attendance is never touched', () => {
  it('W: this file contains no write (INSERT/UPDATE/DELETE) against staff_attendance or staff_attendance_sessions — only Template/Assignment/Override tables are ever mutated here', () => {
    const source = fs.readFileSync(
      new URL('../src/lib/repositories/staff_schedule_repo.ts', import.meta.url),
      'utf8'
    );
    expect(source).not.toMatch(/(INSERT INTO|UPDATE|DELETE FROM)\s+staff_attendance\b/i);
    expect(source).not.toMatch(/(INSERT INTO|UPDATE|DELETE FROM)\s+staff_attendance_sessions/i);
  });
});
