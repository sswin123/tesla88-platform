import pool from '@/lib/db';
import { resolveAttendanceStatus, shouldFinalizeSessionAsTimeout } from '@/lib/attendance-rules';

export interface OpenSessionInput {
  staffId: number;
  attendanceDate: string;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  scheduleSourceType: 'TEMPLATE' | 'OVERRIDE' | null;
  scheduleSourceId: number | null;
  graceMinutes: number;
  /** Snapshotted once at open time (spec §16/§18) — recalculation never re-derives it. */
  isRestDay?: boolean;
  loginAt: string;
  ip: string;
  browser: string;
  device: string;
  operatingSystem: string;
}

/** Finds or creates today's daily Attendance row, then opens a new session on it. */
export async function openSession(input: OpenSessionInput): Promise<number> {
  const existing = await pool.query<{ id: number }>(
    `SELECT id FROM staff_attendance WHERE staff_id = $1 AND attendance_date = $2`,
    [input.staffId, input.attendanceDate]
  );

  let attendanceId: number;
  if (existing.rows[0]) {
    attendanceId = existing.rows[0].id;
  } else {
    const inserted = await pool.query<{ id: number }>(
      `INSERT INTO staff_attendance
         (staff_id, attendance_date, login_time, scheduled_start_at, scheduled_end_at,
          schedule_source_type, schedule_source_id, late_grace_minutes, is_rest_day)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [input.staffId, input.attendanceDate, input.loginAt, input.scheduledStartAt, input.scheduledEndAt,
       input.scheduleSourceType, input.scheduleSourceId, input.graceMinutes, input.isRestDay ?? false]
    );
    attendanceId = inserted.rows[0].id;
  }

  const session = await pool.query<{ id: number }>(
    `INSERT INTO staff_attendance_sessions
       (attendance_id, staff_id, login_at, last_activity_at, ip_address, browser, device, operating_system)
     VALUES ($1, $2, $3, $3, $4, $5, $6, $7)
     RETURNING id`,
    [attendanceId, input.staffId, input.loginAt, input.ip, input.browser, input.device, input.operatingSystem]
  );
  return session.rows[0].id;
}

/**
 * Closes a session — either a real LOGOUT, or TIMEOUT/SYSTEM finalization
 * (called by finalizeStaleOpenSessions). Idempotent: the WHERE clause only
 * matches sessions that are still open, so a repeat call on an already-
 * finalized session is a safe no-op (no recalculation is re-triggered).
 *
 * logout_at is set ONLY for source='LOGOUT' — TIMEOUT/SYSTEM must never
 * fake a logout instant (spec §4/§11: "TIMEOUT 不能伪造 logout_at").
 */
export async function closeSession(
  sessionId: number, source: 'LOGOUT' | 'TIMEOUT' | 'SYSTEM', at: string
): Promise<void> {
  const updated = await pool.query<{ id: number; attendance_id: number }>(
    `UPDATE staff_attendance_sessions
        SET logout_at = CASE WHEN $3 = 'LOGOUT' THEN $2::timestamptz ELSE NULL END,
            last_activity_at = $2,
            checkout_source = $3,
            working_minutes = GREATEST(0, EXTRACT(EPOCH FROM ($2::timestamptz - login_at)) / 60)::int
      WHERE id = $1 AND checkout_source IS NULL
      RETURNING id, attendance_id`,
    [sessionId, at, source]
  );
  if (!updated.rows[0]) return; // already finalized — idempotent no-op
  await recalculateAttendance(updated.rows[0].attendance_id);
}

/**
 * Heartbeat extension point (spec §10, Task 7B). Keeps the OPEN session's
 * last_activity_at fresh so shouldFinalizeSessionAsTimeout() (Task 5)
 * never falsely flags an actively-heartbeating session as stale.
 *
 * Deliberately a single UPDATE, not a SELECT-then-UPDATE:
 *   - `checkout_source IS NULL` in the WHERE clause means a LOGOUT/TIMEOUT/
 *     SYSTEM-finalized session can never match, structurally — there is no
 *     code path here that could reopen or mutate a closed session.
 *   - No matching row (no open session for this staff) simply updates 0
 *     rows — UPDATE can never create a new session or Attendance row, so
 *     this function cannot be the origin of a phantom session.
 *   - Uses the database server clock (NOW()) rather than a JS-computed
 *     timestamp, matching Phase 1's own upsertOnlineStatus()/setOffline()
 *     pattern in staff_monitor_repo.ts for this exact "mark as alive right
 *     now" kind of write — no second timestamp-handling mechanism.
 *   - Does not call resolveAttendanceStatus(), shouldFinalizeSessionAsTimeout(),
 *     or recalculateAttendance() — TIMEOUT finalization and status
 *     recalculation are explicitly out of scope for a heartbeat pulse.
 */
export async function touchOpenSessionActivity(staffId: number): Promise<void> {
  await pool.query(
    `UPDATE staff_attendance_sessions
        SET last_activity_at = NOW()
      WHERE staff_id = $1 AND checkout_source IS NULL`,
    [staffId]
  );
}

/** Lazy TIMEOUT finalization (spec §11/§23) — called on next Login and on Attendance detail read. */
export async function finalizeStaleOpenSessions(staffId: number): Promise<void> {
  const open = await pool.query<{ id: number; attendance_id: number; last_activity_at: string }>(
    `SELECT id, attendance_id, last_activity_at::text
       FROM staff_attendance_sessions
      WHERE staff_id = $1 AND checkout_source IS NULL
      ORDER BY login_at DESC LIMIT 1`,
    [staffId]
  );
  const session = open.rows[0];
  if (!session) return;
  if (!shouldFinalizeSessionAsTimeout(session.last_activity_at, new Date().toISOString())) return;

  await closeSession(session.id, 'TIMEOUT', session.last_activity_at);
}

interface AttendanceSnapshotRow {
  id: number;
  staff_id: number;
  attendance_date: string;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  late_grace_minutes: number | null;
  is_rest_day: boolean;
}

interface SessionAggregateRow {
  login_at: string;
  logout_at: string | null;
  last_activity_at: string;
  checkout_source: 'LOGOUT' | 'TIMEOUT' | 'SYSTEM' | null;
  working_minutes: number;
}

/**
 * Recomputes a Daily Attendance row from all of its Sessions (spec §12):
 * lateness is judged on the FIRST session's check-in, early-leave on the
 * LAST session's checkout, working_minutes sums every session
 * independently. The last session's checkoutSource (LOGOUT/TIMEOUT/
 * SYSTEM/still-open) is passed straight through to
 * resolveAttendanceStatus() — a TIMEOUT/SYSTEM outcome on the most recent
 * session always forces INCOMPLETE for the day, even if an earlier
 * session that same day closed cleanly.
 */
async function recalculateAttendance(attendanceId: number): Promise<void> {
  const att = await pool.query<AttendanceSnapshotRow>(
    `SELECT id, staff_id, attendance_date::text, scheduled_start_at::text, scheduled_end_at::text,
            late_grace_minutes, is_rest_day
       FROM staff_attendance WHERE id = $1`,
    [attendanceId]
  );
  const row = att.rows[0];
  if (!row) return;

  const sessionsResult = await pool.query<SessionAggregateRow>(
    `SELECT login_at::text, logout_at::text, last_activity_at::text, checkout_source, working_minutes
       FROM staff_attendance_sessions WHERE attendance_id = $1 ORDER BY login_at ASC`,
    [attendanceId]
  );
  const sessions = sessionsResult.rows;
  if (sessions.length === 0) return;

  const firstSession = sessions[0];
  const lastSession = sessions[sessions.length - 1];
  const totalWorkingMinutes = sessions.reduce((sum, s) => sum + s.working_minutes, 0);
  const actualCheckout = lastSession.checkout_source === 'LOGOUT' ? lastSession.logout_at : null;

  const result = resolveAttendanceStatus({
    scheduledStartAt: row.scheduled_start_at,
    scheduledEndAt: row.scheduled_end_at,
    actualCheckIn: firstSession.login_at,
    actualCheckout,
    gracePeriodMinutes: row.late_grace_minutes ?? 0,
    isRestDay: row.is_rest_day,
    checkoutSource: lastSession.checkout_source,
  });

  await pool.query(
    `UPDATE staff_attendance
        SET logout_time = $2, working_minutes = $3, late_minutes = $4,
            early_leave_minutes = $5, attendance_status = $6, checkout_source = $7, updated_at = NOW()
      WHERE id = $1`,
    [attendanceId, actualCheckout, totalWorkingMinutes, result.lateMinutes,
     result.earlyLeaveMinutes, result.status, lastSession.checkout_source]
  );
}
