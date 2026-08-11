import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));

import pool from '@/lib/db';
import { openSession, closeSession, finalizeStaleOpenSessions, touchOpenSessionActivity } from '@/lib/repositories/staff_attendance_repo';

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

describe('touchOpenSessionActivity', () => {
  it('1. updates last_activity_at on the OPEN session for that staff member', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rowCount: 1, rows: [] } as never);
    await touchOpenSessionActivity(5);

    const [sql, params] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('UPDATE staff_attendance_sessions');
    expect(sql).toContain('SET last_activity_at = NOW()');
    expect(sql).toContain('checkout_source IS NULL');
    expect(params).toEqual([5]);
  });

  it('2. is a single UPDATE — never runs a SELECT first, never runs an INSERT (cannot create a session)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rowCount: 0, rows: [] } as never);
    await touchOpenSessionActivity(5);
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).not.toMatch(/INSERT INTO staff_attendance\b/);
    expect(sql).not.toMatch(/INSERT INTO staff_attendance_sessions/);
  });

  it('3. no OPEN session (rowCount 0) — the call still completes without error, no session/attendance created', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rowCount: 0, rows: [] } as never);
    await expect(touchOpenSessionActivity(5)).resolves.toBeUndefined();
    expect(pool.query).toHaveBeenCalledTimes(1); // no follow-up create-session query
  });

  it('4. the WHERE clause excludes any session with a non-null checkout_source, so LOGOUT and TIMEOUT sessions are structurally unreachable by this query', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rowCount: 0, rows: [] } as never);
    await touchOpenSessionActivity(5);
    const [sql] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    // Matches only rows where checkout_source IS NULL — a LOGOUT/TIMEOUT/SYSTEM row (non-null
    // checkout_source) can never satisfy this WHERE clause, regardless of staff_id.
    expect(sql).toMatch(/WHERE\s+staff_id\s*=\s*\$1\s+AND\s+checkout_source\s+IS\s+NULL/i);
  });

  it('5. never touches login_at, checkout_source, working_minutes, or attendance_status — only last_activity_at', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rowCount: 1, rows: [] } as never);
    await touchOpenSessionActivity(5);
    const [sql] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    // The SET clause must be exactly one column.
    const setClause = sql.match(/SET\s+([\s\S]*?)\s+WHERE/i)?.[1] ?? '';
    expect(setClause.split(',').map((s) => s.trim())).toEqual(['last_activity_at = NOW()']);
  });

  it('6. uses the database server clock (NOW()) rather than a JS-computed timestamp — structurally guarantees monotonicity, no client/env-supplied time', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rowCount: 1, rows: [] } as never);
    await touchOpenSessionActivity(5);
    const [sql, params] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('NOW()');
    expect(params).toEqual([5]); // no timestamp parameter at all — confirms NOW() is the sole time source
  });
});

// --- Task 8: Login Lifecycle composition (finalizeStaleOpenSessions + openSession called back-to-back) ---

describe('Login Lifecycle composition (Task 8)', () => {
  it('B. active OPEN session (not stale) + re-login: old session is left untouched, a second concurrent session is created', async () => {
    const recentActivity = new Date().toISOString();
    vi.mocked(pool.query)
      // finalizeStaleOpenSessions: find open session -> recent, not stale -> no-op (1 query)
      .mockResolvedValueOnce({ rows: [{ id: 10, attendance_id: 1, last_activity_at: recentActivity }] } as never)
      // openSession: find existing daily attendance -> found (reuse)
      .mockResolvedValueOnce({ rows: [{ id: 1 }] } as never)
      // openSession: insert new session
      .mockResolvedValueOnce({ rows: [{ id: 20 }] } as never);

    await finalizeStaleOpenSessions(5);
    const sessionId2 = await openSession({
      staffId: 5, attendanceDate: '2026-08-11',
      scheduledStartAt: null, scheduledEndAt: null, scheduleSourceType: null, scheduleSourceId: null, graceMinutes: 0,
      loginAt: '2026-08-11T02:00:00.000Z', ip: '1.2.3.4', browser: 'Chrome', device: 'Desktop', operatingSystem: 'macOS',
    });

    expect(sessionId2).toBe(20);
    expect(pool.query).toHaveBeenCalledTimes(3);
    // No UPDATE against staff_attendance_sessions (i.e. session #10 was never closed/touched).
    const sqls = vi.mocked(pool.query).mock.calls.map((c) => (c as unknown as [string, unknown[]])[0]);
    expect(sqls.some((sql) => /UPDATE staff_attendance_sessions/.test(sql))).toBe(false);
  });

  it('C. stale OPEN session + re-login: old session is TIMEOUT-finalized (logout_at NULL) before a new session is created', async () => {
    const staleActivity = new Date(Date.now() - 20 * 60_000).toISOString();
    vi.mocked(pool.query)
      // finalizeStaleOpenSessions: find open session -> stale
      .mockResolvedValueOnce({ rows: [{ id: 10, attendance_id: 1, last_activity_at: staleActivity }] } as never)
      // closeSession: UPDATE ... WHERE checkout_source IS NULL RETURNING
      .mockResolvedValueOnce({ rows: [{ id: 10, attendance_id: 1 }] } as never)
      // recalculateAttendance: fetch attendance snapshot
      .mockResolvedValueOnce({ rows: [{ id: 1, staff_id: 5, attendance_date: '2026-08-11', scheduled_start_at: null, scheduled_end_at: null, late_grace_minutes: 0, is_rest_day: false }] } as never)
      // recalculateAttendance: fetch all sessions
      .mockResolvedValueOnce({ rows: [{ login_at: '2026-08-11T01:00:00.000Z', logout_at: null, last_activity_at: staleActivity, checkout_source: 'TIMEOUT', working_minutes: 0 }] } as never)
      // recalculateAttendance: UPDATE staff_attendance
      .mockResolvedValueOnce({ rows: [] } as never)
      // openSession: find existing daily attendance -> found (reuse same attendance row)
      .mockResolvedValueOnce({ rows: [{ id: 1 }] } as never)
      // openSession: insert new session
      .mockResolvedValueOnce({ rows: [{ id: 21 }] } as never);

    await finalizeStaleOpenSessions(5);
    const sessionId2 = await openSession({
      staffId: 5, attendanceDate: '2026-08-11',
      scheduledStartAt: null, scheduledEndAt: null, scheduleSourceType: null, scheduleSourceId: null, graceMinutes: 0,
      loginAt: '2026-08-11T02:00:00.000Z', ip: '1.2.3.4', browser: 'Chrome', device: 'Desktop', operatingSystem: 'macOS',
    });

    expect(sessionId2).toBe(21);
    // The TIMEOUT close never faked a logout_at.
    const closeCall = vi.mocked(pool.query).mock.calls[1] as unknown as [string, unknown[]];
    expect(closeCall[0]).toMatch(/CASE WHEN[\s\S]*LOGOUT[\s\S]*ELSE NULL END/i);
    expect(closeCall[1]).toEqual([10, staleActivity, 'TIMEOUT']);
    // Both the old (finalized) and new session ultimately belong to the same daily attendance row (id 1).
    expect(pool.query).toHaveBeenCalledTimes(7);
  });

  it('D. same-day multiple logins reuse the same daily attendance row and create separate sessions each time', async () => {
    vi.mocked(pool.query)
      // Login 1: no attendance yet -> insert attendance + insert session
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ id: 1 }] } as never)
      .mockResolvedValueOnce({ rows: [{ id: 30 }] } as never)
      // Login 2 (same day): attendance already exists -> reuse, insert session only
      .mockResolvedValueOnce({ rows: [{ id: 1 }] } as never)
      .mockResolvedValueOnce({ rows: [{ id: 31 }] } as never);

    const input = {
      staffId: 5, attendanceDate: '2026-08-11',
      scheduledStartAt: null, scheduledEndAt: null, scheduleSourceType: null, scheduleSourceId: null, graceMinutes: 0,
      ip: '1.2.3.4', browser: 'Chrome', device: 'Desktop', operatingSystem: 'macOS',
    };
    const session1 = await openSession({ ...input, loginAt: '2026-08-11T01:00:00.000Z' });
    const session2 = await openSession({ ...input, loginAt: '2026-08-11T05:00:00.000Z' });

    expect(session1).toBe(30);
    expect(session2).toBe(31);
    const insertAttendanceCalls = vi.mocked(pool.query).mock.calls.filter(
      (c) => /INSERT INTO staff_attendance\b/.test((c as unknown as [string, unknown[]])[0])
    );
    expect(insertAttendanceCalls).toHaveLength(1); // only Login 1 created the daily row
  });
});
