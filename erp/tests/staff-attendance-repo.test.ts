import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));

import pool from '@/lib/db';
import { openSession, closeSession, finalizeStaleOpenSessions } from '@/lib/repositories/staff_attendance_repo';

beforeEach(() => vi.clearAllMocks());

describe('openSession', () => {
  it('creates a new daily attendance row when none exists yet, then inserts a session', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [] } as never) // find existing attendance -> none
      .mockResolvedValueOnce({ rows: [{ id: 1 }] } as never) // insert attendance
      .mockResolvedValueOnce({ rows: [{ id: 10 }] } as never); // insert session

    const sessionId = await openSession({
      staffId: 5, attendanceDate: '2026-08-11',
      scheduledStartAt: null, scheduledEndAt: null, scheduleSourceType: null, scheduleSourceId: null, graceMinutes: 0,
      loginAt: '2026-08-11T01:00:00.000Z', ip: '1.2.3.4', browser: 'Chrome', device: 'Desktop', operatingSystem: 'macOS',
    });

    expect(sessionId).toBe(10);
    expect(pool.query).toHaveBeenCalledTimes(3);
    expect(pool.query).toHaveBeenNthCalledWith(2, expect.stringContaining('INSERT INTO staff_attendance'), expect.any(Array));
    expect(pool.query).toHaveBeenNthCalledWith(3, expect.stringContaining('INSERT INTO staff_attendance_sessions'), expect.any(Array));
  });

  it('reuses an existing daily attendance row instead of creating a duplicate', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 7 }] } as never) // find existing -> found
      .mockResolvedValueOnce({ rows: [{ id: 11 }] } as never); // insert session

    const sessionId = await openSession({
      staffId: 5, attendanceDate: '2026-08-11',
      scheduledStartAt: null, scheduledEndAt: null, scheduleSourceType: null, scheduleSourceId: null, graceMinutes: 0,
      loginAt: '2026-08-11T05:00:00.000Z', ip: '1.2.3.4', browser: 'Chrome', device: 'Desktop', operatingSystem: 'macOS',
    });

    expect(sessionId).toBe(11);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it('passes isRestDay through to the attendance insert, defaulting to false when omitted', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ id: 1 }] } as never)
      .mockResolvedValueOnce({ rows: [{ id: 10 }] } as never);

    await openSession({
      staffId: 5, attendanceDate: '2026-08-11',
      scheduledStartAt: null, scheduledEndAt: null, scheduleSourceType: null, scheduleSourceId: null, graceMinutes: 0,
      loginAt: '2026-08-11T01:00:00.000Z', ip: '1.2.3.4', browser: 'Chrome', device: 'Desktop', operatingSystem: 'macOS',
    });

    const [, params] = vi.mocked(pool.query).mock.calls[1] as unknown as [string, unknown[]];
    expect(params[params.length - 1]).toBe(false);
  });
});

describe('closeSession', () => {
  it('LOGOUT: writes logout_at + checkout_source=LOGOUT, then recalculates the daily attendance row', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 10, attendance_id: 1 }] } as never) // update session, returning
      .mockResolvedValueOnce({ rows: [{ id: 1, staff_id: 5, attendance_date: '2026-08-11', scheduled_start_at: null, scheduled_end_at: null, late_grace_minutes: 0, is_rest_day: false }] } as never) // fetch attendance
      .mockResolvedValueOnce({ rows: [{ login_at: '2026-08-11T01:00:00.000Z', logout_at: '2026-08-11T10:00:00.000Z', last_activity_at: '2026-08-11T10:00:00.000Z', checkout_source: 'LOGOUT', working_minutes: 540 }] } as never) // fetch all sessions
      .mockResolvedValueOnce({ rows: [] } as never); // update attendance with computed status

    await closeSession(10, 'LOGOUT', '2026-08-11T10:00:00.000Z');

    expect(pool.query).toHaveBeenCalledTimes(4);
    expect(pool.query).toHaveBeenNthCalledWith(1, expect.stringContaining('UPDATE staff_attendance_sessions'), expect.any(Array));
    expect(pool.query).toHaveBeenNthCalledWith(4, expect.stringContaining('UPDATE staff_attendance'), expect.any(Array));
  });

  it('LOGOUT: the session UPDATE sets logout_at to the real logout instant', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 10, attendance_id: 1 }] } as never)
      .mockResolvedValueOnce({ rows: [{ id: 1, staff_id: 5, attendance_date: '2026-08-11', scheduled_start_at: null, scheduled_end_at: null, late_grace_minutes: 0, is_rest_day: false }] } as never)
      .mockResolvedValueOnce({ rows: [{ login_at: '2026-08-11T01:00:00.000Z', logout_at: '2026-08-11T10:00:00.000Z', last_activity_at: '2026-08-11T10:00:00.000Z', checkout_source: 'LOGOUT', working_minutes: 540 }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    await closeSession(10, 'LOGOUT', '2026-08-11T10:00:00.000Z');

    const [sql, params] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('logout_at');
    expect(params).toEqual([10, '2026-08-11T10:00:00.000Z', 'LOGOUT']);
  });

  it('TIMEOUT: never writes a real logout_at — spec forbids faking it', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 10, attendance_id: 1 }] } as never)
      .mockResolvedValueOnce({ rows: [{ id: 1, staff_id: 5, attendance_date: '2026-08-11', scheduled_start_at: null, scheduled_end_at: null, late_grace_minutes: 0, is_rest_day: false }] } as never)
      .mockResolvedValueOnce({ rows: [{ login_at: '2026-08-11T01:00:00.000Z', logout_at: null, last_activity_at: '2026-08-11T04:00:00.000Z', checkout_source: 'TIMEOUT', working_minutes: 180 }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    await closeSession(10, 'TIMEOUT', '2026-08-11T04:00:00.000Z');

    const [sql] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    // The UPDATE must conditionally null out logout_at for non-LOGOUT sources, not
    // unconditionally set it to the finalize instant.
    expect(sql).toMatch(/CASE WHEN[\s\S]*LOGOUT[\s\S]*ELSE NULL END/i);
  });

  it('is idempotent — a session that is already finalized (checkout_source IS NOT NULL) is a no-op, not re-recalculated', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never); // UPDATE ... WHERE checkout_source IS NULL matched nothing

    await closeSession(10, 'LOGOUT', '2026-08-11T10:00:00.000Z');

    expect(pool.query).toHaveBeenCalledTimes(1); // no recalculation query follows
  });

  it('recalculation sums working_minutes across all sessions for the day, not just the one just closed', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 11, attendance_id: 1 }] } as never)
      .mockResolvedValueOnce({ rows: [{ id: 1, staff_id: 5, attendance_date: '2026-08-11', scheduled_start_at: null, scheduled_end_at: null, late_grace_minutes: 0, is_rest_day: false }] } as never)
      .mockResolvedValueOnce({
        rows: [
          { login_at: '2026-08-11T01:00:00.000Z', logout_at: '2026-08-11T04:00:00.000Z', last_activity_at: '2026-08-11T04:00:00.000Z', checkout_source: 'LOGOUT', working_minutes: 180 },
          { login_at: '2026-08-11T05:00:00.000Z', logout_at: '2026-08-11T10:00:00.000Z', last_activity_at: '2026-08-11T10:00:00.000Z', checkout_source: 'LOGOUT', working_minutes: 300 },
        ],
      } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    await closeSession(11, 'LOGOUT', '2026-08-11T10:00:00.000Z');

    const [, params] = vi.mocked(pool.query).mock.calls[3] as unknown as [string, unknown[]];
    // UPDATE staff_attendance params: [attendanceId, logoutTime, workingMinutes, lateMinutes, earlyLeaveMinutes, status, checkoutSource]
    expect(params[2]).toBe(480); // 180 + 300, not the first-to-last span
  });

  it('recalculation judges lateness from the FIRST session and early-leave from the LAST (spec §12)', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 11, attendance_id: 1 }] } as never)
      .mockResolvedValueOnce({
        rows: [{ id: 1, staff_id: 5, attendance_date: '2026-08-11', scheduled_start_at: '2026-08-11T01:00:00.000Z', scheduled_end_at: '2026-08-11T10:00:00.000Z', late_grace_minutes: 5, is_rest_day: false }],
      } as never)
      .mockResolvedValueOnce({
        rows: [
          { login_at: '2026-08-11T01:20:00.000Z', logout_at: '2026-08-11T04:00:00.000Z', last_activity_at: '2026-08-11T04:00:00.000Z', checkout_source: 'LOGOUT', working_minutes: 160 }, // late by 15
          { login_at: '2026-08-11T05:00:00.000Z', logout_at: '2026-08-11T09:40:00.000Z', last_activity_at: '2026-08-11T09:40:00.000Z', checkout_source: 'LOGOUT', working_minutes: 280 }, // early by 15
        ],
      } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    await closeSession(11, 'LOGOUT', '2026-08-11T09:40:00.000Z');

    const [, params] = vi.mocked(pool.query).mock.calls[3] as unknown as [string, unknown[]];
    expect(params[3]).toBe(15); // lateMinutes, from the FIRST session's 01:20 check-in
    expect(params[4]).toBe(15); // earlyLeaveMinutes, from the LAST session's 09:40 checkout
    expect(params[5]).toBe('LATE_AND_EARLY');
  });
});

describe('finalizeStaleOpenSessions', () => {
  it('is a no-op when there is no open session', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never); // find open session -> none
    await finalizeStaleOpenSessions(5);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('finalizes a stale open session (last_activity_at over 10 minutes ago) as TIMEOUT, then recalculates', async () => {
    const staleActivity = new Date(Date.now() - 20 * 60_000).toISOString();
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 10, attendance_id: 1, last_activity_at: staleActivity }] } as never) // find open session -> stale
      .mockResolvedValueOnce({ rows: [{ id: 10, attendance_id: 1 }] } as never) // closeSession's UPDATE ... WHERE checkout_source IS NULL
      .mockResolvedValueOnce({ rows: [{ id: 1, staff_id: 5, attendance_date: '2026-08-11', scheduled_start_at: null, scheduled_end_at: null, late_grace_minutes: 0, is_rest_day: false }] } as never)
      .mockResolvedValueOnce({ rows: [{ login_at: staleActivity, logout_at: null, last_activity_at: staleActivity, checkout_source: 'TIMEOUT', working_minutes: 0 }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    await finalizeStaleOpenSessions(5);

    expect(pool.query).toHaveBeenNthCalledWith(2, expect.any(String), [10, staleActivity, 'TIMEOUT']);
  });

  it('does nothing when the open session is still recent (last_activity_at within the last 10 minutes)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 10, attendance_id: 1, last_activity_at: new Date().toISOString() }],
    } as never);
    await finalizeStaleOpenSessions(5);
    expect(pool.query).toHaveBeenCalledTimes(1); // only the lookup — no finalize UPDATE follows
  });
});
