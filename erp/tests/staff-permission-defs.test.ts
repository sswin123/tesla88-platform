import { describe, it, expect } from 'vitest';
import { PERMISSION_GROUPS } from '@/lib/permission-defs';

describe('Staff Attendance & Monitoring permission group', () => {
  it('defines all 5 required permission keys', () => {
    const group = PERMISSION_GROUPS.find((g) => g.module === 'Staff Attendance & Monitoring');
    expect(group).toBeDefined();
    const keys = group!.permissions.map((p) => p.key).sort();
    expect(keys).toEqual([
      'staff.activity.view',
      'staff.attendance.export',
      'staff.attendance.view',
      'staff.livemonitor.view',
      'staff.schedule.manage',
    ]);
  });
});
