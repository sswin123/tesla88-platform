// erp/tests/staff-monitor-stream-merge.test.ts
import { describe, it, expect } from 'vitest';
import { mergeStaffStatusUpdate, type StaffMonitorSnapshot } from '@/hooks/useStaffMonitorStream';

const BASE: StaffMonitorSnapshot = {
  id: 1, display_name: 'Aaron', erp_username: 'aaron', department: 'Support', role: 'CS',
  status: 'ONLINE', display_status: 'ONLINE', current_module: 'dashboard', current_page: 'view',
  login_at: '2026-07-26T04:00:00.000Z', last_activity: '2026-07-26T04:00:00.000Z',
  current_ip: '1.2.3.4', browser: 'Chrome', device: 'Desktop', operating_system: 'macOS',
};

describe('mergeStaffStatusUpdate', () => {
  it('updates only the matching row by staff_id', () => {
    const other: StaffMonitorSnapshot = { ...BASE, id: 2 };
    const result = mergeStaffStatusUpdate([BASE, other], {
      type: 'status_update', staff_id: 1, status: 'ONLINE',
      current_module: 'member', current_page: 'list', last_activity: '2026-07-26T04:05:00.000Z',
    });
    expect(result[0].current_module).toBe('member');
    expect(result[0].current_page).toBe('list');
    expect(result[1]).toEqual(other);
  });

  it('recomputes display_status from the pushed last_activity', () => {
    const result = mergeStaffStatusUpdate([BASE], {
      type: 'status_update', staff_id: 1, status: 'OFFLINE',
      current_module: null, current_page: null, last_activity: null,
    });
    expect(result[0].display_status).toBe('OFFLINE');
  });

  it('ignores events for staff not in the current list', () => {
    const result = mergeStaffStatusUpdate([BASE], {
      type: 'status_update', staff_id: 999, status: 'ONLINE',
      current_module: 'member', current_page: 'list', last_activity: '2026-07-26T04:05:00.000Z',
    });
    expect(result).toEqual([BASE]);
  });
});
