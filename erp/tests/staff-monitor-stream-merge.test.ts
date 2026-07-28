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

  it('returns the same array reference unchanged for non status_update events', () => {
    const rows = [BASE, { ...BASE, id: 2 }];
    const result = mergeStaffStatusUpdate(rows, {
      type: 'presence_ping', staff_id: 1, status: 'ONLINE',
      current_module: 'member', current_page: 'list', last_activity: '2026-07-26T04:05:00.000Z',
    });
    expect(result).toBe(rows);
    expect(result).toEqual(rows);
  });

  it('marks the row ONLINE when last_activity is well within the 3-minute threshold', () => {
    const recent = new Date(Date.now() - 5_000).toISOString(); // 5s ago
    const result = mergeStaffStatusUpdate([BASE], {
      type: 'status_update', staff_id: 1, status: 'ONLINE',
      current_module: 'dashboard', current_page: 'view', last_activity: recent,
    });
    expect(result[0].display_status).toBe('ONLINE');
  });

  it('marks the row DISCONNECTED when last_activity is stale (20 minutes old)', () => {
    const stale = new Date(Date.now() - 20 * 60_000).toISOString(); // 20 min ago
    const result = mergeStaffStatusUpdate([BASE], {
      type: 'status_update', staff_id: 1, status: 'ONLINE',
      current_module: 'dashboard', current_page: 'view', last_activity: stale,
    });
    expect(result[0].display_status).toBe('DISCONNECTED');
  });
});
