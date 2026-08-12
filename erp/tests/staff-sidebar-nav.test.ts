import { describe, it, expect } from 'vitest';
import { NAV_GROUPS, filterNavGroups } from '@/components/sidebar-nav';

describe('Staff nav group', () => {
  it('has a Staff group with the 4 expected items, Attendance included', () => {
    const group = NAV_GROUPS.find((g) => g.title === 'Staff');
    expect(group).toBeDefined();
    const hrefs = group!.items.map((i) => i.href);
    expect(hrefs).toEqual(['/settings/staff', '/settings/permissions', '/staff/attendance', '/staff/live-monitor']);
  });

  it('Staff List item exists with the correct href', () => {
    const group = NAV_GROUPS.find((g) => g.title === 'Staff');
    const item = group!.items.find((i) => i.label === 'Staff List');
    expect(item).toBeDefined();
    expect(item!.href).toBe('/settings/staff');
  });

  it('Staff Permission item exists with the correct href', () => {
    const group = NAV_GROUPS.find((g) => g.title === 'Staff');
    const item = group!.items.find((i) => i.label === 'Staff Permission');
    expect(item).toBeDefined();
    expect(item!.href).toBe('/settings/permissions');
  });

  it('Live Monitor item exists and requires staff.livemonitor.view', () => {
    const group = NAV_GROUPS.find((g) => g.title === 'Staff');
    const item = group!.items.find((i) => i.label === 'Live Monitor');
    expect(item).toBeDefined();
    expect(item!.href).toBe('/staff/live-monitor');
    expect(item!.permission).toBe('staff.livemonitor.view');
  });

  it('Attendance item exists and requires staff.attendance.view', () => {
    const group = NAV_GROUPS.find((g) => g.title === 'Staff');
    const item = group!.items.find((i) => i.label === 'Attendance');
    expect(item).toBeDefined();
    expect(item!.href).toBe('/staff/attendance');
    expect(item!.permission).toBe('staff.attendance.view');
  });

  it('Attendance requires staff.attendance.view and is hidden without it', () => {
    const filtered = filterNavGroups(NAV_GROUPS, false, ['staff.manage', 'staff.livemonitor.view']);
    const staffGroup = filtered.find((g) => g.title === 'Staff');
    const hrefs = staffGroup!.items.map((i) => i.href);
    expect(hrefs).not.toContain('/staff/attendance');
  });

  it('SuperAdmin sees every Staff item regardless of granted permissions', () => {
    const filtered = filterNavGroups(NAV_GROUPS, true, []);
    const staffGroup = filtered.find((g) => g.title === 'Staff');
    expect(staffGroup!.items).toHaveLength(4);
  });

  it('a role with only staff.manage sees Staff List and Staff Permission but not Live Monitor', () => {
    const filtered = filterNavGroups(NAV_GROUPS, false, ['staff.manage']);
    const staffGroup = filtered.find((g) => g.title === 'Staff');
    const hrefs = staffGroup!.items.map((i) => i.href);
    expect(hrefs).toEqual(['/settings/staff', '/settings/permissions']);
    expect(hrefs).not.toContain('/staff/live-monitor');
  });

  it('a role with no permissions sees no Staff group at all', () => {
    const filtered = filterNavGroups(NAV_GROUPS, false, []);
    const staffGroup = filtered.find((g) => g.title === 'Staff');
    expect(staffGroup).toBeUndefined();
  });

  it('/settings/staff appears exactly once across all NAV_GROUPS (no duplicate nav item)', () => {
    const allHrefs = NAV_GROUPS.flatMap((g) => g.items).map((i) => i.href);
    expect(allHrefs.filter((h) => h === '/settings/staff')).toHaveLength(1);
  });

  it('/settings/permissions appears exactly once across all NAV_GROUPS (no duplicate nav item)', () => {
    const allHrefs = NAV_GROUPS.flatMap((g) => g.items).map((i) => i.href);
    expect(allHrefs.filter((h) => h === '/settings/permissions')).toHaveLength(1);
  });
});
