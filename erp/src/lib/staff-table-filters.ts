// erp/src/lib/staff-table-filters.ts
export interface FilterableStaffRow {
  display_name: string | null;
  erp_username: string;
  display_status: string;
  department: string | null;
}

export function filterStaffRows<T extends FilterableStaffRow>(
  staff: T[],
  filters: { search: string; status: string; department: string }
): T[] {
  const search = filters.search.trim().toLowerCase();
  return staff.filter((s) => {
    const name = (s.display_name ?? s.erp_username).toLowerCase();
    if (search && !name.includes(search)) return false;
    if (filters.status !== 'ALL' && s.display_status !== filters.status) return false;
    if (filters.department !== 'ALL' && s.department !== filters.department) return false;
    return true;
  });
}
