import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));

import pool from '@/lib/db';
import {
  getOnlineStatus,
  upsertOnlineStatus,
  setOffline,
  getMonitorSnapshot,
  getStaffMonitorRow,
  logActivity,
  getRecentActivity,
} from '@/lib/repositories/staff_monitor_repo';

beforeEach(() => vi.clearAllMocks());

describe('staff_monitor_repo', () => {
  it('getOnlineStatus queries by staff_id and returns null when no row', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const result = await getOnlineStatus(99);
    expect(result).toBeNull();
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('FROM staff_online_status'), [99]);
  });

  it('upsertOnlineStatus sends staff_id and all patch fields as params', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    await upsertOnlineStatus(1, {
      module: 'member', page: 'list', ip: '1.2.3.4', browser: 'Chrome', device: 'Desktop', operatingSystem: 'macOS',
    });
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (staff_id) DO UPDATE'),
      [1, 'member', 'list', '1.2.3.4', 'Chrome', 'Desktop', 'macOS']
    );
  });

  it('setOffline marks the staff row OFFLINE', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    await setOffline(1);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("'OFFLINE'"), [1]);
  });

  it('getMonitorSnapshot returns all rows from the join query', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 1, status: 'ONLINE' }] } as never);
    const result = await getMonitorSnapshot();
    expect(result).toEqual([{ id: 1, status: 'ONLINE' }]);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('LEFT JOIN staff_online_status'));
  });

  it('getStaffMonitorRow returns null when staff not found', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const result = await getStaffMonitorRow(999);
    expect(result).toBeNull();
  });

  it('logActivity inserts with staff_id, activity, module, page, description', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    await logActivity(1, 'PAGE_VIEW', 'member', 'list');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO staff_activity_logs'),
      [1, 'PAGE_VIEW', 'member', 'list', null]
    );
  });

  it('getRecentActivity defaults to a limit of 20', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    await getRecentActivity(1);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY created_at DESC'), [1, 20]);
  });
});
