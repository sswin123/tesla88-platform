import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));

import pool from '@/lib/db';
import {
  createTemplate,
  getTemplateById,
  listTemplates,
  updateTemplate,
  deactivateTemplate,
  getTargetStaffRole,
} from '@/lib/repositories/staff_schedule_repo';

beforeEach(() => vi.clearAllMocks());

const VALID_INPUT = {
  name: 'Morning Shift',
  startTime: '09:00',
  endTime: '18:00',
  workingDays: [1, 2, 3, 4, 5],
  lateGraceMinutes: 5,
  createdBy: 1,
};

const FULL_ROW = {
  id: 1, name: 'Morning Shift', start_time: '09:00', end_time: '18:00', is_overnight: false,
  working_days: [1, 2, 3, 4, 5], late_grace_minutes: 5, is_active: true,
  created_by: 1, created_at: '2026-08-11T00:00:00.000Z', updated_at: '2026-08-11T00:00:00.000Z',
};

describe('createTemplate (Test A/J)', () => {
  it('A: inserts a new template and returns its id', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 1 }] } as never);
    const id = await createTemplate(VALID_INPUT);
    expect(id).toBe(1);
    const [sql, params] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('INSERT INTO staff_schedule_templates');
    expect(params).toEqual(['Morning Shift', '09:00', '18:00', false, [1, 2, 3, 4, 5], 5, 1]);
  });

  it('J: saves an overnight template (18:00 -> 03:00) as a plain definition, is_overnight=true, without computing any UTC instant', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 2 }] } as never);
    await createTemplate({ ...VALID_INPUT, startTime: '18:00', endTime: '03:00' });
    const [, params] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(params).toEqual(['Morning Shift', '18:00', '03:00', true, [1, 2, 3, 4, 5], 5, 1]);
  });

  it('K: SQL is parameterized — no raw values are string-concatenated into the query text', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 1 }] } as never);
    await createTemplate(VALID_INPUT);
    const [sql] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).not.toContain('Morning Shift');
    expect(sql).toMatch(/\$1[\s\S]*\$2[\s\S]*\$3[\s\S]*\$4[\s\S]*\$5[\s\S]*\$6[\s\S]*\$7/);
  });

  it('rejects startTime === endTime as an invalid schedule (matches resolveScheduledWindow()\'s own contract, not silently a 24h shift)', async () => {
    await expect(createTemplate({ ...VALID_INPUT, startTime: '09:00', endTime: '09:00' })).rejects.toThrow(/cannot be equal/);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects a malformed time string', async () => {
    await expect(createTemplate({ ...VALID_INPUT, startTime: '9:00' })).rejects.toThrow(/invalid startTime/);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('working_days validation (Test E/F/G/H)', () => {
  it('E: [1,2,3,4,5] is valid', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 1 }] } as never);
    await expect(createTemplate({ ...VALID_INPUT, workingDays: [1, 2, 3, 4, 5] })).resolves.toBe(1);
  });

  it('E2: preserves the given array order — does not silently sort it', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 1 }] } as never);
    await createTemplate({ ...VALID_INPUT, workingDays: [5, 1, 3] });
    const [, params] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(params[4]).toEqual([5, 1, 3]);
  });

  it('F: [0,1,2] is rejected — 0 is not a valid ISO weekday', async () => {
    await expect(createTemplate({ ...VALID_INPUT, workingDays: [0, 1, 2] })).rejects.toThrow(/1-7/);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('F2: [1,2,8] is rejected — 8 is not a valid ISO weekday', async () => {
    await expect(createTemplate({ ...VALID_INPUT, workingDays: [1, 2, 8] })).rejects.toThrow(/1-7/);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('G: [] (empty array) is rejected', async () => {
    await expect(createTemplate({ ...VALID_INPUT, workingDays: [] })).rejects.toThrow(/non-empty/);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('H: [1,1,2] (duplicate weekday) is rejected', async () => {
    await expect(createTemplate({ ...VALID_INPUT, workingDays: [1, 1, 2] })).rejects.toThrow(/duplicate/);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('late_grace_minutes validation (Test I)', () => {
  it('accepts 0', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 1 }] } as never);
    await expect(createTemplate({ ...VALID_INPUT, lateGraceMinutes: 0 })).resolves.toBe(1);
  });

  it('rejects a negative value — matches resolveAttendanceStatus()\'s own gracePeriodMinutes >= 0 contract', async () => {
    await expect(createTemplate({ ...VALID_INPUT, lateGraceMinutes: -1 })).rejects.toThrow(/>= 0/);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects a non-integer value', async () => {
    await expect(createTemplate({ ...VALID_INPUT, lateGraceMinutes: 5.5 })).rejects.toThrow(/integer/);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('getTemplateById (Test B/L)', () => {
  it('B: returns the template row when found', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [FULL_ROW] } as never);
    const row = await getTemplateById(1);
    expect(row).toEqual(FULL_ROW);
    const [sql, params] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('WHERE id = $1');
    expect(params).toEqual([1]);
  });

  it('L: returns null when not found (existing repo convention, e.g. announcement_repo/brand_repo/promotion_repo)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    expect(await getTemplateById(999)).toBeNull();
  });
});

describe('listTemplates (Test C)', () => {
  it('C: returns active templates by default', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [FULL_ROW] } as never);
    const rows = await listTemplates();
    expect(rows).toEqual([FULL_ROW]);
    const [sql, params] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('is_active = true');
    expect(params).toEqual([]);
  });

  it('includeInactive=true omits the is_active filter', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [FULL_ROW] } as never);
    await listTemplates(true);
    const [sql] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).not.toContain('is_active = true');
  });
});

describe('updateTemplate (Test D/M)', () => {
  it('D: updates only the provided field (rename) — a single UPDATE, no full-row refetch needed', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ ...FULL_ROW, name: 'Renamed' }] } as never);
    const row = await updateTemplate(1, { name: 'Renamed' });
    expect(row?.name).toBe('Renamed');
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('SET name = $1');
    expect(params).toEqual(['Renamed', 1]);
  });

  it('recomputes is_overnight when only endTime changes — fetches the current row first to get startTime', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [FULL_ROW] } as never) // getTemplateById fetch for current startTime
      .mockResolvedValueOnce({ rows: [{ ...FULL_ROW, end_time: '05:00', is_overnight: true }] } as never); // UPDATE ... RETURNING
    const row = await updateTemplate(1, { endTime: '05:00' });
    expect(row?.is_overnight).toBe(true);
    const [, updateParams] = vi.mocked(pool.query).mock.calls[1] as unknown as [string, unknown[]];
    expect(updateParams).toContain(true); // is_overnight = true ('05:00' < '09:00')
  });

  it('rejects the combined startTime/endTime becoming equal after a partial patch', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [FULL_ROW] } as never); // getTemplateById -> end_time '18:00'
    await expect(updateTemplate(1, { startTime: '18:00' })).rejects.toThrow(/cannot be equal/);
  });

  it('M: returns null when the template does not exist', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    expect(await updateTemplate(999, { name: 'X' })).toBeNull();
  });

  it('M2: returns null (via the current-row fetch) when updating start/end time on a nonexistent template', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never); // getTemplateById -> not found
    expect(await updateTemplate(999, { endTime: '05:00' })).toBeNull();
    expect(pool.query).toHaveBeenCalledTimes(1); // never reaches the UPDATE
  });

  it('validates working_days/grace on update, same rules as create', async () => {
    await expect(updateTemplate(1, { workingDays: [1, 1] })).rejects.toThrow(/duplicate/);
    await expect(updateTemplate(1, { lateGraceMinutes: -5 })).rejects.toThrow(/>= 0/);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('deactivateTemplate — archive semantics (Test N/O)', () => {
  it('N: sets is_active=false via UPDATE, never a hard DELETE (schema has is_active, no deleted_at column; assignments.template_id is ON DELETE RESTRICT)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ ...FULL_ROW, is_active: false }] } as never);
    const row = await deactivateTemplate(1);
    expect(row?.is_active).toBe(false);
    const [sql] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/UPDATE staff_schedule_templates/);
    expect(sql).toContain('is_active = false');
    expect(sql).not.toMatch(/DELETE FROM/i);
  });

  it('N2: returns null when the template does not exist', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    expect(await deactivateTemplate(999)).toBeNull();
  });

  it('O: a hard DELETE code path does not exist in this repository — an existing Assignment reference can never be broken by anything Task 10 ships (structural, not a runtime FK test; Assignments do not exist until Task 11)', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../src/lib/repositories/staff_schedule_repo.ts', import.meta.url), 'utf8')
    );
    expect(source).not.toMatch(/DELETE FROM staff_schedule_templates/i);
  });
});

describe('getTargetStaffRole (Task 16 — SUPER_ADMIN Assignment protection)', () => {
  it('returns the real role from the DB for a given staff id', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ role: 'SUPER_ADMIN' }] } as never);
    const role = await getTargetStaffRole(9);
    expect(role).toBe('SUPER_ADMIN');
    const [sql, params] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('SELECT role FROM admins WHERE id = $1');
    expect(params).toEqual([9]);
  });

  it('returns null when the staff id does not exist', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    expect(await getTargetStaffRole(999999)).toBeNull();
  });
});
