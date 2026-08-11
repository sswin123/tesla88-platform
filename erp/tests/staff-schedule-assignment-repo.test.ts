import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));

import pool from '@/lib/db';
import {
  createAssignment,
  getAssignmentById,
  listAssignmentsForStaff,
  updateAssignment,
  ScheduleOverlapError,
} from '@/lib/repositories/staff_schedule_repo';

beforeEach(() => vi.clearAllMocks());

const VALID_INPUT = {
  staffId: 5, templateId: 1, effectiveFrom: '2026-08-01', effectiveTo: '2026-08-31', createdBy: 1,
};

const FULL_ROW = {
  id: 1, staff_id: 5, template_id: 1, effective_from: '2026-08-01', effective_to: '2026-08-31',
  created_by: 1, created_at: '2026-08-11T00:00:00.000Z',
};

function pgError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

describe('createAssignment (Test A/E/G/I/J/K/L/N)', () => {
  it('A: inserts a new assignment and returns its id', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 1 }] } as never);
    const id = await createAssignment(VALID_INPUT);
    expect(id).toBe(1);
    const [sql, params] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('INSERT INTO staff_schedule_assignments');
    expect(params).toEqual([5, 1, '2026-08-01', '2026-08-31', 1]);
  });

  it('open-ended: effectiveTo=null is passed straight through (spec: NULL = long-term)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 2 }] } as never);
    await createAssignment({ ...VALID_INPUT, effectiveTo: null });
    const [, params] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(params).toEqual([5, 1, '2026-08-01', null, 1]);
  });

  it('K: SQL is parameterized', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 1 }] } as never);
    await createAssignment(VALID_INPUT);
    const [sql] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/\$1[\s\S]*\$2[\s\S]*\$3[\s\S]*\$4[\s\S]*\$5/);
  });

  it('N: a Postgres exclusion-constraint violation (23P01) is translated into ScheduleOverlapError, not a raw 500', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(
      pgError('23P01', 'conflicting key value violates exclusion constraint "no_overlapping_assignments"')
    );
    await expect(createAssignment(VALID_INPUT)).rejects.toBeInstanceOf(ScheduleOverlapError);
  });

  it('L: a foreign-key violation (23503, e.g. nonexistent staff_id/template_id) propagates unchanged, not miscategorized as overlap', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(pgError('23503', 'insert or update on table violates foreign key constraint'));
    await expect(createAssignment(VALID_INPUT)).rejects.not.toBeInstanceOf(ScheduleOverlapError);
  });

  it('other DB errors propagate unchanged', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(new Error('connection lost'));
    await expect(createAssignment(VALID_INPUT)).rejects.toThrow('connection lost');
  });
});

describe('date validation (Test J)', () => {
  it('rejects a malformed effectiveFrom', async () => {
    await expect(createAssignment({ ...VALID_INPUT, effectiveFrom: '2026/08/01' })).rejects.toThrow(/invalid effectiveFrom/);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects an invalid calendar date (e.g. Feb 30)', async () => {
    await expect(createAssignment({ ...VALID_INPUT, effectiveFrom: '2026-02-30' })).rejects.toThrow(/invalid effectiveFrom/);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects a malformed effectiveTo', async () => {
    await expect(createAssignment({ ...VALID_INPUT, effectiveTo: 'not-a-date' })).rejects.toThrow(/invalid effectiveTo/);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects a reversed range (effectiveFrom after effectiveTo) — Postgres itself would reject this with a generic 22000, not an overlap error, so it is validated here for a clean message', async () => {
    await expect(createAssignment({ ...VALID_INPUT, effectiveFrom: '2026-08-31', effectiveTo: '2026-08-01' })).rejects.toThrow(/must not be after/);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('accepts a single-day range (effectiveFrom === effectiveTo) — verified valid against real Postgres, produces [d, d+1)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 1 }] } as never);
    await expect(createAssignment({ ...VALID_INPUT, effectiveFrom: '2026-10-05', effectiveTo: '2026-10-05' })).resolves.toBe(1);
  });
});

describe('getAssignmentById (Test B/K)', () => {
  it('B: returns the row when found', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [FULL_ROW] } as never);
    const row = await getAssignmentById(1);
    expect(row).toEqual(FULL_ROW);
    const [, params] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(params).toEqual([1]);
  });

  it('K: returns null when not found', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    expect(await getAssignmentById(999)).toBeNull();
  });
});

describe('listAssignmentsForStaff (Test C)', () => {
  it('C: lists a staff member\'s assignments, most recent effective_from first', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [FULL_ROW] } as never);
    const rows = await listAssignmentsForStaff(5);
    expect(rows).toEqual([FULL_ROW]);
    const [sql, params] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('ORDER BY effective_from DESC');
    expect(params).toEqual([5]);
  });
});

describe('updateAssignment (Test D/K/N/O)', () => {
  it('D: updates templateId only', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ ...FULL_ROW, template_id: 2 }] } as never);
    const row = await updateAssignment(1, { templateId: 2 });
    expect(row?.template_id).toBe(2);
    const [sql, params] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('template_id = $1');
    expect(params).toEqual([2, 1]);
  });

  it('updates effectiveFrom/effectiveTo together, revalidating the combined range', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ ...FULL_ROW, effective_from: '2026-09-01', effective_to: '2026-09-30' }] } as never);
    const row = await updateAssignment(1, { effectiveFrom: '2026-09-01', effectiveTo: '2026-09-30' });
    expect(row?.effective_from).toBe('2026-09-01');
  });

  it('fetches the current row first when only effectiveTo is patched, to revalidate against the existing effectiveFrom', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [FULL_ROW] } as never) // getAssignmentById -> current effective_from
      .mockResolvedValueOnce({ rows: [{ ...FULL_ROW, effective_to: '2026-09-15' }] } as never); // UPDATE ... RETURNING
    const row = await updateAssignment(1, { effectiveTo: '2026-09-15' });
    expect(row?.effective_to).toBe('2026-09-15');
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it('effectiveTo=null explicitly clears to open-ended (distinct from omitting the field)', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [FULL_ROW] } as never)
      .mockResolvedValueOnce({ rows: [{ ...FULL_ROW, effective_to: null }] } as never);
    const row = await updateAssignment(1, { effectiveTo: null });
    expect(row?.effective_to).toBeNull();
    const [, updateParams] = vi.mocked(pool.query).mock.calls[1] as unknown as [string, unknown[]];
    expect(updateParams).toContain(null);
  });

  it('O: an UPDATE that would create an overlap surfaces ScheduleOverlapError, not a raw 500', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(
      pgError('23P01', 'conflicting key value violates exclusion constraint "no_overlapping_assignments"')
    );
    await expect(updateAssignment(1, { templateId: 2 })).rejects.toBeInstanceOf(ScheduleOverlapError);
  });

  it('rejects a reversed range on update before reaching the DB', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [FULL_ROW] } as never); // current row fetch
    await expect(updateAssignment(1, { effectiveTo: '2026-07-01' })).rejects.toThrow(/must not be after/);
  });

  it('returns null when the assignment does not exist (simple patch)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    expect(await updateAssignment(999, { templateId: 2 })).toBeNull();
  });

  it('returns null when the assignment does not exist (date-range patch, never reaches the UPDATE)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never); // getAssignmentById -> not found
    expect(await updateAssignment(999, { effectiveTo: '2026-09-15' })).toBeNull();
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});

describe('inactive template semantics (Test M)', () => {
  it('M: creating an assignment against an inactive template is NOT blocked — the spec does not define this restriction, so none is invented', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 1 }] } as never);
    await expect(createAssignment(VALID_INPUT)).resolves.toBe(1);
    // No SELECT against staff_schedule_templates.is_active happened — a single INSERT only.
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});
