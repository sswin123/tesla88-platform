// erp/tests/staff-table-filters.test.ts
import { describe, it, expect } from 'vitest';
import { filterStaffRows } from '@/lib/staff-table-filters';

const ROWS = [
  { display_name: 'Aaron Tan',  erp_username: 'aaron',  display_status: 'ONLINE',  department: 'Support' },
  { display_name: null,         erp_username: 'bella',  display_status: 'IDLE',    department: 'Finance' },
  { display_name: 'Carl Wong',  erp_username: 'carl',   display_status: 'OFFLINE', department: 'Support' },
];

describe('filterStaffRows', () => {
  it('matches search against display_name (falling back to erp_username)', () => {
    const result = filterStaffRows(ROWS, { search: 'bella', status: 'ALL', department: 'ALL' });
    expect(result).toHaveLength(1);
    expect(result[0].erp_username).toBe('bella');
  });

  it('filters by status', () => {
    const result = filterStaffRows(ROWS, { search: '', status: 'ONLINE', department: 'ALL' });
    expect(result).toHaveLength(1);
    expect(result[0].erp_username).toBe('aaron');
  });

  it('filters by department', () => {
    const result = filterStaffRows(ROWS, { search: '', status: 'ALL', department: 'Support' });
    expect(result.map((r) => r.erp_username)).toEqual(['aaron', 'carl']);
  });

  it('combines all three filters', () => {
    const result = filterStaffRows(ROWS, { search: 'carl', status: 'OFFLINE', department: 'Support' });
    expect(result).toHaveLength(1);
  });

  it('returns everything when filters are all ALL/empty', () => {
    expect(filterStaffRows(ROWS, { search: '', status: 'ALL', department: 'ALL' })).toHaveLength(3);
  });
});
