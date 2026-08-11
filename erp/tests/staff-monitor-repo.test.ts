import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));

import pool from '@/lib/db';
import {
  getOnlineStatus,
  upsertOnlineStatus,
  setOffline,
  getMonitorSnapshot,
  getStaffMonitorRow,
  getStaffRole,
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
    const result = await getMonitorSnapshot('CS');
    expect(result).toEqual([{ id: 1, status: 'ONLINE' }]);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('LEFT JOIN staff_online_status'), expect.any(Array));
  });

  it('getStaffMonitorRow returns null when staff not found', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const result = await getStaffMonitorRow(999, 'CS');
    expect(result).toBeNull();
  });

  describe('SUPER_ADMIN visibility (Task 8B + Live Monitor visibility fix)', () => {
    it('getMonitorSnapshot: a normal Admin viewer excludes SUPER_ADMIN rows via the WHERE clause', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 1, role: 'CS' }] } as never);
      await getMonitorSnapshot('CS');
      const [sql, params] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
      expect(sql).toMatch(/\$1\s*=\s*'SUPER_ADMIN'\s*OR\s*a\.role\s*<>\s*'SUPER_ADMIN'/i);
      expect(params).toEqual(['CS']);
    });

    it('getMonitorSnapshot: a SUPER_ADMIN viewer still runs through the same WHERE clause (no exclusion, by construction — $1=\'SUPER_ADMIN\' short-circuits the OR true)', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 1, role: 'SUPER_ADMIN' }, { id: 2, role: 'CS' }] } as never);
      const result = await getMonitorSnapshot('SUPER_ADMIN');
      expect(result).toHaveLength(2);
      const [, params] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
      expect(params).toEqual(['SUPER_ADMIN']);
    });

    it('getStaffMonitorRow: passes viewerRole as a query parameter alongside staffId', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 1, role: 'CS' }] } as never);
      await getStaffMonitorRow(1, 'CS');
      const [sql, params] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
      expect(sql).toMatch(/\$2\s*=\s*'SUPER_ADMIN'\s*OR\s*a\.role\s*<>\s*'SUPER_ADMIN'/i);
      expect(params).toEqual([1, 'CS']);
    });

    it('getStaffRole: returns the role for a given staff id', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ role: 'SUPER_ADMIN' }] } as never);
      const role = await getStaffRole(1);
      expect(role).toBe('SUPER_ADMIN');
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT role FROM admins WHERE id = $1'), [1]);
    });

    it('getStaffRole: returns null when the staff id does not exist', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
      expect(await getStaffRole(999)).toBeNull();
    });
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
