import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));

import pool from '@/lib/db';
import { openSession, closeSession, finalizeStaleOpenSessions, touchOpenSessionActivity, getOpenSessionId, listAttendance, getAttendanceDetail, getAttendanceStatistics } from '@/lib/repositories/staff_attendance_repo';

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

  it('LOGOUT: preserves last_activity_at (the last real heartbeat) — the logout instant must NOT overwrite it (Task 9)', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 10, attendance_id: 1 }] } as never)
      .mockResolvedValueOnce({ rows: [{ id: 1, staff_id: 5, attendance_date: '2026-08-11', scheduled_start_at: null, scheduled_end_at: null, late_grace_minutes: 0, is_rest_day: false }] } as never)
      .mockResolvedValueOnce({ rows: [{ login_at: '2026-08-11T01:00:00.000Z', logout_at: '2026-08-11T10:00:00.000Z', last_activity_at: '2026-08-11T09:58:00.000Z', checkout_source: 'LOGOUT', working_minutes: 538 }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    await closeSession(10, 'LOGOUT', '2026-08-11T10:00:00.000Z');

    const [sql] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    // last_activity_at must be conditionally left alone for LOGOUT, and only
    // overwritten with the finalize instant for TIMEOUT/SYSTEM.
    expect(sql).toMatch(/last_activity_at\s*=\s*CASE WHEN[\s\S]*LOGOUT[\s\S]*THEN\s+last_activity_at[\s\S]*ELSE[\s\S]*END/i);
  });

  it('TIMEOUT/SYSTEM: last_activity_at is still written from the finalize instant — unchanged Task 7 semantics', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 10, attendance_id: 1 }] } as never)
      .mockResolvedValueOnce({ rows: [{ id: 1, staff_id: 5, attendance_date: '2026-08-11', scheduled_start_at: null, scheduled_end_at: null, late_grace_minutes: 0, is_rest_day: false }] } as never)
      .mockResolvedValueOnce({ rows: [{ login_at: '2026-08-11T01:00:00.000Z', logout_at: null, last_activity_at: '2026-08-11T04:00:00.000Z', checkout_source: 'TIMEOUT', working_minutes: 180 }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    await closeSession(10, 'TIMEOUT', '2026-08-11T04:00:00.000Z');

    const [sql] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/last_activity_at\s*=\s*CASE WHEN[\s\S]*LOGOUT[\s\S]*THEN\s+last_activity_at\s+ELSE\s+\$2/i);
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

describe('getOpenSessionId (Task 9)', () => {
  it('returns the most recently opened OPEN session id for the staff member', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 10 }] } as never);
    expect(await getOpenSessionId(5)).toBe(10);
    const [sql, params] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/WHERE\s+staff_id\s*=\s*\$1\s+AND\s+checkout_source\s+IS\s+NULL/i);
    expect(sql).toMatch(/ORDER BY\s+login_at\s+DESC\s+LIMIT\s+1/i);
    expect(params).toEqual([5]);
  });

  it('returns null when there is no open session', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    expect(await getOpenSessionId(5)).toBeNull();
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

// --- Task 14: Attendance read API repository functions ---

const LIST_ROW = {
  id: 1, staff_id: 5, display_name: 'CS One', erp_username: 'cs1', department: 'Support', role: 'CS',
  attendance_date: '2026-08-10', login_time: '2026-08-10T01:00:00.000Z', logout_time: '2026-08-10T10:00:00.000Z',
  working_minutes: 540, late_minutes: 0, early_leave_minutes: 0, attendance_status: 'PRESENT', checkout_source: 'LOGOUT',
  scheduled_start_at: null, scheduled_end_at: null, schedule_source_type: null, schedule_source_id: null,
  late_grace_minutes: null, is_rest_day: false,
};

describe('listAttendance (Task 14)', () => {
  it('returns rows and total from a Promise.all data+count query pair', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [LIST_ROW] } as never)
      .mockResolvedValueOnce({ rows: [{ count: 1 }] } as never);

    const result = await listAttendance({
      dateFrom: null, dateTo: null, staffId: null, department: null, status: null,
      viewerRole: 'SUPER_ADMIN', limit: 20, offset: 0,
    });

    expect(result).toEqual({ rows: [LIST_ROW], total: 1 });
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it('a normal Admin viewer excludes SUPER_ADMIN rows via the WHERE clause (same pattern as Live Monitor)', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ count: 0 }] } as never);

    await listAttendance({ dateFrom: null, dateTo: null, staffId: null, department: null, status: null, viewerRole: 'CS', limit: 20, offset: 0 });

    const [dataSql] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    const [countSql] = vi.mocked(pool.query).mock.calls[1] as unknown as [string, unknown[]];
    expect(dataSql).toMatch(/a\.role\s*<>\s*'SUPER_ADMIN'/);
    expect(countSql).toMatch(/a\.role\s*<>\s*'SUPER_ADMIN'/);
  });

  it('a SUPER_ADMIN viewer\'s query has no role exclusion clause at all', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ count: 0 }] } as never);

    await listAttendance({ dateFrom: null, dateTo: null, staffId: null, department: null, status: null, viewerRole: 'SUPER_ADMIN', limit: 20, offset: 0 });

    const [dataSql] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(dataSql).not.toMatch(/SUPER_ADMIN/);
  });

  it('applies dateFrom/dateTo/staffId/department/status filters as parameterized clauses', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ count: 0 }] } as never);

    await listAttendance({
      dateFrom: '2026-08-01', dateTo: '2026-08-31', staffId: 5, department: 'Support', status: 'LATE',
      viewerRole: 'SUPER_ADMIN', limit: 20, offset: 0,
    });

    const [dataSql, dataParams] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(dataSql).toMatch(/attendance_date\s*>=\s*\$1/);
    expect(dataSql).toMatch(/attendance_date\s*<=\s*\$2/);
    expect(dataSql).toMatch(/staff_id\s*=\s*\$3/);
    expect(dataSql).toMatch(/department\s*=\s*\$4/);
    expect(dataSql).toMatch(/attendance_status\s*=\s*\$5/);
    expect(dataParams).toEqual(['2026-08-01', '2026-08-31', 5, 'Support', 'LATE', 20, 0]);
  });

  it('applies limit/offset as the final parameterized values', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ count: 0 }] } as never);

    await listAttendance({ dateFrom: null, dateTo: null, staffId: null, department: null, status: null, viewerRole: 'SUPER_ADMIN', limit: 20, offset: 40 });

    const [dataSql, dataParams] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(dataSql).toMatch(/LIMIT \$1 OFFSET \$2/);
    expect(dataParams).toEqual([20, 40]);
  });

  it('no filters at all produces no WHERE clause beyond nothing (SUPER_ADMIN viewer, no date restriction invented)', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ count: 0 }] } as never);

    await listAttendance({ dateFrom: null, dateTo: null, staffId: null, department: null, status: null, viewerRole: 'SUPER_ADMIN', limit: 20, offset: 0 });

    const [dataSql] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(dataSql).not.toMatch(/WHERE[\s\S]*AND/); // no leftover AND with nothing before it
  });
});

describe('getAttendanceDetail (Task 14)', () => {
  it('returns null immediately when the row does not exist — no finalize, no sessions query', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const result = await getAttendanceDetail(999, 'SUPER_ADMIN');
    expect(result).toBeNull();
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('returns null when the row exists but belongs to a SUPER_ADMIN and the viewer is not SUPER_ADMIN (same visibility rule as the list)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never); // role-filtered fetch finds nothing
    const result = await getAttendanceDetail(1, 'CS');
    expect(result).toBeNull();
    const [sql] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/a\.role\s*<>\s*'SUPER_ADMIN'/);
  });

  it('calls finalizeStaleOpenSessions with the row\'s staff_id, then re-fetches, then fetches sessions, then returns the fresh row with sessions[]', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [LIST_ROW] } as never) // 1. initial fetch
      .mockResolvedValueOnce({ rows: [] } as never)          // 2. finalizeStaleOpenSessions' own lookup -> no open session
      .mockResolvedValueOnce({ rows: [{ ...LIST_ROW, attendance_status: 'INCOMPLETE' }] } as never) // 3. re-fetch (fresh state)
      .mockResolvedValueOnce({ rows: [{ id: 10, login_at: '2026-08-10T01:00:00.000Z', logout_at: '2026-08-10T10:00:00.000Z', last_activity_at: '2026-08-10T10:00:00.000Z', checkout_source: 'LOGOUT', working_minutes: 540, ip_address: '1.2.3.4', browser: 'Chrome', device: 'Desktop', operating_system: 'macOS' }] } as never); // 4. sessions

    const result = await getAttendanceDetail(1, 'SUPER_ADMIN');

    expect(pool.query).toHaveBeenCalledTimes(4);
    const [finalizeSql, finalizeParams] = vi.mocked(pool.query).mock.calls[1] as unknown as [string, unknown[]];
    expect(finalizeSql).toContain('staff_attendance_sessions');
    expect(finalizeParams).toEqual([5]); // LIST_ROW.staff_id
    expect(result?.attendance_status).toBe('INCOMPLETE'); // reflects the post-finalize re-fetch, not the stale initial fetch
    expect(result?.sessions).toHaveLength(1);
    expect(result?.sessions[0].id).toBe(10);
  });

  it('the sessions query is scoped to attendance_id and ordered by login_at', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [LIST_ROW] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [LIST_ROW] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    await getAttendanceDetail(1, 'SUPER_ADMIN');

    const [sessionsSql, sessionsParams] = vi.mocked(pool.query).mock.calls[3] as unknown as [string, unknown[]];
    expect(sessionsSql).toContain('FROM staff_attendance_sessions');
    expect(sessionsSql).toMatch(/WHERE attendance_id = \$1/);
    expect(sessionsSql).toMatch(/ORDER BY login_at/);
    expect(sessionsParams).toEqual([1]);
  });
});

// --- Task 15: Attendance Statistics (set-based) ---

describe('getAttendanceStatistics (Task 15)', () => {
  it('runs a single set-based query — never more than one pool.query call regardless of date range size', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    await getAttendanceStatistics({ dateFrom: '2026-08-01', dateTo: '2026-08-31', staffId: null, department: null, viewerRole: 'SUPER_ADMIN' });
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('passes dateFrom, dateTo, staffId, department, and viewerRole as parameterized query args, not string interpolation', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    await getAttendanceStatistics({ dateFrom: '2026-08-01', dateTo: '2026-08-31', staffId: 5, department: 'CS', viewerRole: 'CS' });
    expect(pool.query).toHaveBeenCalledWith(expect.any(String), ['2026-08-01', '2026-08-31', 5, 'CS', 'CS']);
  });

  it('the query text contains generate_series, LEFT JOIN, and GROUP BY — proof it is set-based, not row-by-row', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    await getAttendanceStatistics({ dateFrom: '2026-08-01', dateTo: '2026-08-31', staffId: null, department: null, viewerRole: 'SUPER_ADMIN' });
    const [sql] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/generate_series/);
    expect(sql).toMatch(/LEFT JOIN/);
    expect(sql).toMatch(/GROUP BY/);
  });

  it('the query text excludes SUPER_ADMIN rows unless the viewer itself is SUPER_ADMIN (same visibility rule as Task 14, live-verified) — proven via the parameterized role check, not string interpolation', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    await getAttendanceStatistics({ dateFrom: '2026-08-01', dateTo: '2026-08-31', staffId: null, department: null, viewerRole: 'CS' });
    const [sql] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/=\s*'SUPER_ADMIN'\s*OR\s*role\s*<>\s*'SUPER_ADMIN'/);
  });

  it('the query text only counts Assignments through an active Template — matches getEffectiveSchedule()\'s own "Template must be active" rule (Task 13)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    await getAttendanceStatistics({ dateFrom: '2026-08-01', dateTo: '2026-08-31', staffId: null, department: null, viewerRole: 'SUPER_ADMIN' });
    const [sql] = vi.mocked(pool.query).mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/t\.is_active\s*=\s*true/);
  });

  it('maps DB rows into StatisticsRow shape with numeric fields coerced', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ staff_id: 5, department: 'CS', status: 'LATE', count: '3', total_working_minutes: '1200', total_late_minutes: '45', total_early_leave_minutes: '0' }],
    } as never);
    const result = await getAttendanceStatistics({ dateFrom: '2026-08-01', dateTo: '2026-08-31', staffId: null, department: null, viewerRole: 'SUPER_ADMIN' });
    expect(result).toEqual([{ staffId: 5, department: 'CS', status: 'LATE', count: 3, totalWorkingMinutes: 1200, totalLateMinutes: 45, totalEarlyLeaveMinutes: 0 }]);
  });

  it('[Case N: Historical Snapshot] a date with an existing row is never re-derived from current schedule state — the query guarantees this via COALESCE(act.attendance_status, <derived>), live-verified after deactivating the original Template', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ staff_id: 5, department: 'CS', status: 'LATE', count: '1', total_working_minutes: '500', total_late_minutes: '20', total_early_leave_minutes: '0' }],
    } as never);
    const result = await getAttendanceStatistics({ dateFrom: '2026-08-11', dateTo: '2026-08-11', staffId: 5, department: null, viewerRole: 'SUPER_ADMIN' });
    expect(result[0].status).toBe('LATE');
  });
});
