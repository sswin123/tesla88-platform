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
 *
 * last_activity_at is set ONLY for source!='LOGOUT' (Task 9): a real LOGOUT
 * must not overwrite the session's last real heartbeat with the logout
 * instant — the column's meaning stays "last known-alive activity", distinct
 * from logout_at's "actual logout time". For TIMEOUT, the caller
 * (finalizeStaleOpenSessions) already passes the existing last_activity_at
 * as `at`, so this branch is a same-value no-op there; SYSTEM keeps the
 * same $2-overwrite convention.
 */
export async function closeSession(
  sessionId: number, source: 'LOGOUT' | 'TIMEOUT' | 'SYSTEM', at: string
): Promise<void> {
  const updated = await pool.query<{ id: number; attendance_id: number }>(
    `UPDATE staff_attendance_sessions
        SET logout_at = CASE WHEN $3 = 'LOGOUT' THEN $2::timestamptz ELSE NULL END,
            last_activity_at = CASE WHEN $3 = 'LOGOUT' THEN last_activity_at ELSE $2::timestamptz END,
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

/**
 * Finds the OPEN session Logout should close (Task 9). Concurrent OPEN
 * sessions are allowed (Task 8 Decision 2 — multi-device re-login does not
 * force-close an active session), so when more than one exists this picks
 * the most recently opened one — the same `ORDER BY login_at DESC LIMIT 1`
 * tie-break finalizeStaleOpenSessions() already uses, not a new policy.
 */
export async function getOpenSessionId(staffId: number): Promise<number | null> {
  const result = await pool.query<{ id: number }>(
    `SELECT id FROM staff_attendance_sessions
      WHERE staff_id = $1 AND checkout_source IS NULL
      ORDER BY login_at DESC LIMIT 1`,
    [staffId]
  );
  return result.rows[0]?.id ?? null;
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

/**
 * Attendance read API (Task 14). Read-only — never calls getEffectiveSchedule()
 * or recalculates anything; every returned field is read verbatim from the
 * persisted staff_attendance/staff_attendance_sessions rows (Historical
 * Snapshot principle, spec §18). Only the 6 persisted attendance_status
 * values can ever appear here — ABSENT/REST_DAY are Reporting-layer-derived
 * (Task 15), never materialized as rows, so they are structurally
 * unreachable through these queries, not filtered out by extra code.
 *
 * SUPER_ADMIN visibility (confirmed by decision, not spec-implied): mirrors
 * Live Monitor's rule exactly — `viewerRole = 'SUPER_ADMIN'` sees every
 * staff member's attendance including other SUPER_ADMIN accounts; any other
 * viewer role never sees a SUPER_ADMIN's attendance rows, regardless of
 * their own staff.attendance.view permission (which only gates whether they
 * may call these functions at all, decided upstream by
 * requirePermissionStrict — this is a visibility filter, not a permission).
 */

export interface AttendanceListRow {
  id: number;
  staff_id: number;
  display_name: string | null;
  erp_username: string;
  department: string | null;
  role: string;
  attendance_date: string;
  login_time: string | null;
  logout_time: string | null;
  working_minutes: number;
  late_minutes: number;
  early_leave_minutes: number;
  attendance_status: string;
  checkout_source: string | null;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  schedule_source_type: string | null;
  schedule_source_id: number | null;
  late_grace_minutes: number | null;
  is_rest_day: boolean;
}

export interface ListAttendanceFilters {
  dateFrom: string | null;
  dateTo: string | null;
  staffId: number | null;
  department: string | null;
  status: string | null;
  viewerRole: string;
  limit: number;
  offset: number;
}

const ATTENDANCE_COLUMNS = `
  sa.id, sa.staff_id, a.display_name, a.erp_username, a.department, a.role,
  sa.attendance_date::text, sa.login_time::text, sa.logout_time::text,
  sa.working_minutes, sa.late_minutes, sa.early_leave_minutes, sa.attendance_status, sa.checkout_source,
  sa.scheduled_start_at::text, sa.scheduled_end_at::text, sa.schedule_source_type, sa.schedule_source_id,
  sa.late_grace_minutes, sa.is_rest_day
`;

export async function listAttendance(filters: ListAttendanceFilters): Promise<{ rows: AttendanceListRow[]; total: number }> {
  const clauses: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (filters.viewerRole !== 'SUPER_ADMIN') {
    clauses.push(`a.role <> 'SUPER_ADMIN'`);
  }
  if (filters.dateFrom) { clauses.push(`sa.attendance_date >= $${i++}`); values.push(filters.dateFrom); }
  if (filters.dateTo)   { clauses.push(`sa.attendance_date <= $${i++}`); values.push(filters.dateTo); }
  if (filters.staffId)  { clauses.push(`sa.staff_id = $${i++}`); values.push(filters.staffId); }
  if (filters.department) { clauses.push(`a.department = $${i++}`); values.push(filters.department); }
  if (filters.status)   { clauses.push(`sa.attendance_status = $${i++}`); values.push(filters.status); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const fromJoin = `FROM staff_attendance sa JOIN admins a ON a.id = sa.staff_id ${where}`;

  const limitIdx = i++;
  const offsetIdx = i++;
  const dataValues = [...values, filters.limit, filters.offset];

  const [dataResult, countResult] = await Promise.all([
    pool.query<AttendanceListRow>(
      `SELECT ${ATTENDANCE_COLUMNS} ${fromJoin} ORDER BY sa.attendance_date DESC, a.display_name LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      dataValues
    ),
    pool.query<{ count: number }>(`SELECT COUNT(*)::int AS count ${fromJoin}`, values),
  ]);

  return { rows: dataResult.rows, total: countResult.rows[0].count };
}

export interface AttendanceSessionRow {
  id: number;
  login_at: string;
  logout_at: string | null;
  last_activity_at: string;
  checkout_source: string | null;
  working_minutes: number;
  ip_address: string | null;
  browser: string | null;
  device: string | null;
  operating_system: string | null;
}

async function fetchAttendanceRow(id: number, viewerRole: string): Promise<AttendanceListRow | null> {
  const clauses = ['sa.id = $1'];
  if (viewerRole !== 'SUPER_ADMIN') clauses.push(`a.role <> 'SUPER_ADMIN'`);
  const result = await pool.query<AttendanceListRow>(
    `SELECT ${ATTENDANCE_COLUMNS} FROM staff_attendance sa JOIN admins a ON a.id = sa.staff_id WHERE ${clauses.join(' AND ')}`,
    [id]
  );
  return result.rows[0] ?? null;
}

/**
 * Detail read (spec §24 "含 sessions 明细"). Performs lazy TIMEOUT
 * finalization (spec §11 trigger b: "该员工的 Attendance 被查询/打开详情时")
 * before returning — this is why the row is fetched twice: once to learn
 * staff_id (and to apply the same visibility/404 check the list uses), then
 * finalizeStaleOpenSessions() runs (a fast single-query no-op in the
 * common case where nothing is stale), then the row is re-fetched so the
 * response reflects any status/session change finalization just made —
 * returning the pre-finalize snapshot would make the finalize call pointless.
 */
export async function getAttendanceDetail(
  id: number, viewerRole: string
): Promise<(AttendanceListRow & { sessions: AttendanceSessionRow[] }) | null> {
  const row = await fetchAttendanceRow(id, viewerRole);
  if (!row) return null;

  await finalizeStaleOpenSessions(row.staff_id);

  const freshRow = (await fetchAttendanceRow(id, viewerRole)) ?? row;

  const sessionsResult = await pool.query<AttendanceSessionRow>(
    `SELECT id, login_at::text, logout_at::text, last_activity_at::text, checkout_source, working_minutes,
            ip_address, browser, device, operating_system
       FROM staff_attendance_sessions WHERE attendance_id = $1 ORDER BY login_at`,
    [id]
  );

  return { ...freshRow, sessions: sessionsResult.rows };
}

/**
 * Attendance Statistics (Task 15, plan §Task 15 — set-based, all-staff/
 * department/date-range). ONE query, no per-staff/per-day loop, no calls
 * to getEffectiveSchedule(). generate_series() produces the requested
 * calendar; a LEFT JOIN chain (Override > Assignment+active-Template >
 * none) resolves the effective schedule per (staff, date) in SQL; a final
 * LEFT JOIN against real staff_attendance rows lets COALESCE prefer the
 * persisted historical fact whenever one exists (Historical Snapshot
 * guarantee — a row that already exists is never re-evaluated against
 * current Override/Assignment state), falling back to a derived
 * ABSENT/REST_DAY only for dates with no row. Staff with no effective
 * schedule at all are excluded entirely (never a false ABSENT).
 *
 * Two corrections made against the plan's original draft (which predates
 * both), verified live against telegram-member-bot-postgres-1 before
 * trusting them:
 *   - `t.is_active = true` added to the assignments CTE — the plan's SQL
 *     omitted it, but getEffectiveSchedule() (Task 13) already requires an
 *     active Template; without this, an Assignment pointing at a
 *     deactivated Template would still count here, contradicting Task 13.
 *   - `viewerRole`-based SUPER_ADMIN exclusion added to staff_scope —
 *     mirrors Task 14's exact rule (own SQL, not shared code): a
 *     SUPER_ADMIN viewer sees every staff member; any other viewer never
 *     sees a SUPER_ADMIN's statistics, regardless of their own
 *     staff.attendance.view permission.
 */

export interface StatisticsFilters {
  dateFrom: string;
  dateTo: string;
  staffId: number | null;
  department: string | null;
  viewerRole: string;
}

export interface StatisticsRow {
  staffId: number;
  department: string | null;
  status: string;
  count: number;
  totalWorkingMinutes: number;
  totalLateMinutes: number;
  totalEarlyLeaveMinutes: number;
}

export async function getAttendanceStatistics(filters: StatisticsFilters): Promise<StatisticsRow[]> {
  const r = await pool.query<{
    staff_id: number; department: string | null; status: string; count: string;
    total_working_minutes: string; total_late_minutes: string; total_early_leave_minutes: string;
  }>(
    `WITH date_series AS (
       SELECT generate_series($1::date, $2::date, '1 day')::date AS d
     ),
     staff_scope AS (
       SELECT id AS staff_id, department FROM admins
       WHERE is_active = true
         AND ($3::int IS NULL OR id = $3)
         AND ($4::text IS NULL OR department = $4)
         AND ($5 = 'SUPER_ADMIN' OR role <> 'SUPER_ADMIN')
     ),
     calendar AS (
       SELECT s.staff_id, s.department, ds.d AS attendance_date
       FROM staff_scope s CROSS JOIN date_series ds
     ),
     overrides AS (
       SELECT staff_id, override_date, is_rest_day
       FROM staff_schedule_overrides
       WHERE override_date BETWEEN $1 AND $2
     ),
     assignments AS (
       SELECT a.staff_id, a.effective_from, a.effective_to, t.working_days
       FROM staff_schedule_assignments a
       JOIN staff_schedule_templates t ON t.id = a.template_id
       WHERE t.is_active = true
     ),
     actual AS (
       SELECT staff_id, attendance_date, attendance_status, working_minutes, late_minutes, early_leave_minutes
       FROM staff_attendance
       WHERE attendance_date BETWEEN $1 AND $2
     ),
     effective AS (
       SELECT
         c.staff_id, c.department, c.attendance_date,
         (o.staff_id IS NOT NULL OR a.staff_id IS NOT NULL) AS has_schedule,
         CASE
           WHEN o.staff_id IS NOT NULL THEN o.is_rest_day
           WHEN a.staff_id IS NOT NULL THEN NOT (EXTRACT(ISODOW FROM c.attendance_date)::int = ANY(a.working_days))
           ELSE NULL
         END AS is_rest_day
       FROM calendar c
       LEFT JOIN overrides o ON o.staff_id = c.staff_id AND o.override_date = c.attendance_date
       LEFT JOIN assignments a ON a.staff_id = c.staff_id
         AND a.effective_from <= c.attendance_date
         AND (a.effective_to IS NULL OR a.effective_to >= c.attendance_date)
         AND o.staff_id IS NULL
     )
     SELECT
       e.staff_id, e.department,
       COALESCE(
         act.attendance_status,
         CASE WHEN NOT e.has_schedule THEN NULL
              WHEN e.is_rest_day THEN 'REST_DAY'
              ELSE 'ABSENT' END
       ) AS status,
       COUNT(*) AS count,
       COALESCE(SUM(act.working_minutes), 0)::int AS total_working_minutes,
       COALESCE(SUM(act.late_minutes), 0)::int AS total_late_minutes,
       COALESCE(SUM(act.early_leave_minutes), 0)::int AS total_early_leave_minutes
     FROM effective e
     LEFT JOIN actual act ON act.staff_id = e.staff_id AND act.attendance_date = e.attendance_date
     WHERE (act.attendance_status IS NOT NULL OR e.has_schedule)
     GROUP BY e.staff_id, e.department, status
     ORDER BY e.department, e.staff_id, status`,
    [filters.dateFrom, filters.dateTo, filters.staffId, filters.department, filters.viewerRole]
  );

  return r.rows.map((row) => ({
    staffId: row.staff_id, department: row.department, status: row.status,
    count: Number(row.count), totalWorkingMinutes: Number(row.total_working_minutes),
    totalLateMinutes: Number(row.total_late_minutes), totalEarlyLeaveMinutes: Number(row.total_early_leave_minutes),
  }));
}
