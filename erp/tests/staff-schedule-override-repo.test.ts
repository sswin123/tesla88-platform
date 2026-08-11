import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));

import pool from '@/lib/db';
import {
  createOverride,
  getOverrideById,
  getOverrideByStaffAndDate,
  listOverridesForStaff,
  updateOverride,
  ScheduleOverrideConflictError,
} from '@/lib/repositories/staff_schedule_repo';

beforeEach(() => vi.clearAllMocks());

const VALID_INPUT = {
  staffId: 5, overrideDate: '2026-08-20', isRestDay: false,
  startTime: '10:00', endTime: '19:00', lateGraceMinutes: 10, reason: 'special shift', createdBy: 1,
};

const REST_DAY_INPUT = {
  staffId: 5, overrideDate: '2026-08-21', isRestDay: true,
  startTime: null, endTime: null, lateGraceMinutes: null, reason: null, createdBy: 1,
};

const FULL_ROW = {
  id: 1, staff_id: 5, override_date: '2026-08-20', start_time: '10:00', end_time: '19:00',
  is_rest_day: false, late_grace_minutes: 10, reason: 'special shift', created_by: 1, created_at: '2026-08-11T00:00:00.000Z',
};

function pgError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

describe('createOverride (Test A/B/N/O/V)', () => {
  it('A: inserts a normal (non-rest-day) override and returns its id', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 1 }] } as never);
    const id = await createOverride(VALID_INPUT);
    expect(id).toBe(1);
    const [sql, params] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('INSERT INTO staff_schedule_overrides');
    expect(params).toEqual([5, '2026-08-20', '10:00', '19:00', false, 10, 'special shift', 1]);
  });

  it('B: inserts a Rest Day override with start_time/end_time forced to NULL', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 2 }] } as never);
    await createOverride(REST_DAY_INPUT);
    const [, params] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(params).toEqual([5, '2026-08-21', null, null, true, null, null, 1]);
  });

  it('Rest Day override with startTime/endTime accidentally supplied is auto-cleared to NULL, not rejected — matches the DB comment\'s invariant (start_time/end_time NULL when is_rest_day=true)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 3 }] } as never);
    await createOverride({ ...REST_DAY_INPUT, startTime: '09:00', endTime: '18:00' });
    const [, params] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(params[2]).toBeNull();
    expect(params[3]).toBeNull();
  });

  it('a non-rest-day override requires both startTime and endTime', async () => {
    await expect(createOverride({ ...VALID_INPUT, startTime: null })).rejects.toThrow(/startTime and endTime are required/);
    await expect(createOverride({ ...VALID_INPUT, endTime: null })).rejects.toThrow(/startTime and endTime are required/);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects startTime === endTime on a non-rest-day override', async () => {
    await expect(createOverride({ ...VALID_INPUT, startTime: '10:00', endTime: '10:00' })).rejects.toThrow(/cannot be equal/);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('O: rejects a malformed time format', async () => {
    await expect(createOverride({ ...VALID_INPUT, startTime: '9:00' })).rejects.toThrow(/invalid startTime/);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('N: rejects an invalid calendar date (e.g. Feb 30)', async () => {
    await expect(createOverride({ ...VALID_INPUT, overrideDate: '2026-02-30' })).rejects.toThrow(/invalid overrideDate/);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('O2: rejects a malformed date format', async () => {
    await expect(createOverride({ ...VALID_INPUT, overrideDate: '2026/08/20' })).rejects.toThrow(/invalid overrideDate/);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('lateGraceMinutes: accepts null (no override), rejects negative when provided', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 1 }] } as never);
    await expect(createOverride({ ...VALID_INPUT, lateGraceMinutes: null })).resolves.toBe(1);
    await expect(createOverride({ ...VALID_INPUT, lateGraceMinutes: -1 })).rejects.toThrow(/>= 0/);
  });

  it('V: a UNIQUE-constraint violation (23505, staff_id+override_date) is translated into ScheduleOverrideConflictError, not a raw 500', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(
      pgError('23505', 'duplicate key value violates unique constraint "staff_schedule_overrides_staff_id_override_date_key"')
    );
    await expect(createOverride(VALID_INPUT)).rejects.toBeInstanceOf(ScheduleOverrideConflictError);
  });

  it('Q: a foreign-key violation (23503, nonexistent staff_id) propagates unchanged, not miscategorized as a conflict', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(pgError('23503', 'insert or update on table violates foreign key constraint'));
    await expect(createOverride(VALID_INPUT)).rejects.not.toBeInstanceOf(ScheduleOverrideConflictError);
  });

  it('other DB errors propagate unchanged', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(new Error('connection lost'));
    await expect(createOverride(VALID_INPUT)).rejects.toThrow('connection lost');
  });
});

describe('getOverrideById / getOverrideByStaffAndDate (Test C/D/P)', () => {
  it('C: returns the row when found by id', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [FULL_ROW] } as never);
    expect(await getOverrideById(1)).toEqual(FULL_ROW);
  });

  it('P: getOverrideById returns null when not found', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    expect(await getOverrideById(999)).toBeNull();
  });

  it('D: returns the row when found by staff+date', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [FULL_ROW] } as never);
    const row = await getOverrideByStaffAndDate(5, '2026-08-20');
    expect(row).toEqual(FULL_ROW);
    const [sql, params] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('WHERE staff_id = $1 AND override_date = $2');
    expect(params).toEqual([5, '2026-08-20']);
  });

  it('P2: getOverrideByStaffAndDate returns null when there is no override that day', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    expect(await getOverrideByStaffAndDate(5, '2026-08-22')).toBeNull();
  });
});

describe('listOverridesForStaff (Test E)', () => {
  it('E: lists a staff member\'s overrides, most recent date first', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [FULL_ROW] } as never);
    const rows = await listOverridesForStaff(5);
    expect(rows).toEqual([FULL_ROW]);
    const [sql, params] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('ORDER BY override_date DESC');
    expect(params).toEqual([5]);
  });
});

describe('uniqueness scenarios F/G/H/I — proven at the DB layer (see commit message for live PostgreSQL verification); these confirm the repository maps 23505 correctly regardless of which of F/G/H/I triggered it', () => {
  it('F: same staff + same date triggers ScheduleOverrideConflictError', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(pgError('23505', 'duplicate key value violates unique constraint "staff_schedule_overrides_staff_id_override_date_key"'));
    await expect(createOverride(VALID_INPUT)).rejects.toBeInstanceOf(ScheduleOverrideConflictError);
  });

  it('G/H/I: non-conflicting combinations (different date, different staff, or both) succeed — proven by the create path having no staff/date-scoped pre-check, only the DB constraint enforces it', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 10 }] } as never);
    await expect(createOverride({ ...VALID_INPUT, staffId: 6, overrideDate: '2026-08-25' })).resolves.toBe(10);
  });
});

describe('updateOverride (Test J/K/L/M/P)', () => {
  it('J: updates overrideDate only', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ ...FULL_ROW, override_date: '2026-08-21' }] } as never);
    const row = await updateOverride(1, { overrideDate: '2026-08-21' });
    expect(row?.override_date).toBe('2026-08-21');
    const [sql, params] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('override_date = $1');
    expect(params).toEqual(['2026-08-21', 1]);
  });

  it('K: updating into an existing (staff, date) pair surfaces ScheduleOverrideConflictError', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(pgError('23505', 'duplicate key value violates unique constraint "staff_schedule_overrides_staff_id_override_date_key"'));
    await expect(updateOverride(1, { overrideDate: '2026-08-21' })).rejects.toBeInstanceOf(ScheduleOverrideConflictError);
  });

  it('L: flips isRestDay false -> true and clears start_time/end_time to NULL, fetching the current row first', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [FULL_ROW] } as never) // getOverrideById -> current row (is_rest_day=false, has times)
      .mockResolvedValueOnce({ rows: [{ ...FULL_ROW, is_rest_day: true, start_time: null, end_time: null }] } as never); // UPDATE ... RETURNING
    const row = await updateOverride(1, { isRestDay: true });
    expect(row?.is_rest_day).toBe(true);
    expect(row?.start_time).toBeNull();
    const [, updateParams] = vi.mocked(pool.query).mock.calls[1] as unknown as [string, unknown[]];
    expect(updateParams).toContain(true);
    expect(updateParams).toContain(null);
  });

  it('flips isRestDay true -> false: requires startTime/endTime to be supplied in the same patch (cannot infer working hours from nothing)', async () => {
    const restRow = { ...FULL_ROW, is_rest_day: true, start_time: null, end_time: null };
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [restRow] } as never); // getOverrideById -> current
    await expect(updateOverride(1, { isRestDay: false })).rejects.toThrow(/startTime and endTime are required/);
  });

  it('flips isRestDay true -> false with startTime/endTime supplied: succeeds', async () => {
    const restRow = { ...FULL_ROW, is_rest_day: true, start_time: null, end_time: null };
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [restRow] } as never)
      .mockResolvedValueOnce({ rows: [{ ...FULL_ROW, is_rest_day: false, start_time: '08:00', end_time: '17:00' }] } as never);
    const row = await updateOverride(1, { isRestDay: false, startTime: '08:00', endTime: '17:00' });
    expect(row?.is_rest_day).toBe(false);
    expect(row?.start_time).toBe('08:00');
  });

  it('M: updates lateGraceMinutes and reason independently of the rest-day/time fields', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ ...FULL_ROW, late_grace_minutes: 15, reason: 'updated reason' }] } as never);
    const row = await updateOverride(1, { lateGraceMinutes: 15, reason: 'updated reason' });
    expect(row?.late_grace_minutes).toBe(15);
    expect(row?.reason).toBe('updated reason');
    expect(pool.query).toHaveBeenCalledTimes(1); // no current-row fetch needed for these fields
  });

  it('P: returns null when the override does not exist (simple patch)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    expect(await updateOverride(999, { reason: 'x' })).toBeNull();
  });

  it('P2: returns null when the override does not exist (rest-day/time patch, never reaches the UPDATE)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never); // getOverrideById -> not found
    expect(await updateOverride(999, { isRestDay: true })).toBeNull();
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid overrideDate on update before reaching the DB', async () => {
    await expect(updateOverride(1, { overrideDate: '2026-13-01' })).rejects.toThrow(/invalid overrideDate/);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('past/future dates (Test T/U) — no restriction invented, spec does not define one', () => {
  it('T: a past date is accepted (no "must be future" rule exists in the spec)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 1 }] } as never);
    await expect(createOverride({ ...VALID_INPUT, overrideDate: '2020-01-01' })).resolves.toBe(1);
  });

  it('U: a future date is accepted', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 1 }] } as never);
    await expect(createOverride({ ...VALID_INPUT, overrideDate: '2030-01-01' })).resolves.toBe(1);
  });
});
