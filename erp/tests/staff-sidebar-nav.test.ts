import { describe, it, expect } from 'vitest';
import { NAV_GROUPS, filterNavGroups } from '@/components/sidebar';

describe('Staff nav group', () => {
  it('has a Staff group with the 4 expected items', () => {
    const group = NAV_GROUPS.find((g) => g.title === 'Staff');
    expect(group).toBeDefined();
    const hrefs = group!.items.map((i) => i.href);
    expect(hrefs).toEqual(['/settings/staff', '/settings/permissions', '/staff/attendance', '/staff/live-monitor']);
  });

  it('Live Monitor requires staff.livemonitor.view and is hidden without it', () => {
    const filtered = filterNavGroups(NAV_GROUPS, false, ['staff.manage', 'staff.attendance.view']);
    const staffGroup = filtered.find((g) => g.title === 'Staff');
    const hrefs = staffGroup!.items.map((i) => i.href);
    expect(hrefs).not.toContain('/staff/live-monitor');
    expect(hrefs).toContain('/staff/attendance');
  });

  it('SuperAdmin sees every Staff item regardless of granted permissions', () => {
    const filtered = filterNavGroups(NAV_GROUPS, true, []);
    const staffGroup = filtered.find((g) => g.title === 'Staff');
    expect(staffGroup!.items).toHaveLength(4);
  });
});
