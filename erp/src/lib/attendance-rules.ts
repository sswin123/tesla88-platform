/**
 * Phase 2 domain layer — the single authority for Attendance date/window/
 * status math (spec §9/§13/§14/§17). Every function here is pure: same
 * input, same output, zero DB access, zero cache, zero fetch, zero
 * Date.now()/process.env reads. Callers resolve DB-backed inputs (e.g.
 * the attendance timezone, via getAttendanceTimezone() in
 * attendance-timezone.ts) themselves and pass plain values in — this
 * file must never import a repository, settings, or the DB pool.
 */

/**
 * Calendar date (YYYY-MM-DD) that `instant` falls on, in the given IANA
 * timezone. This is the ONLY place attendance_date gets computed (spec
 * §9) — no other module may call new Date() and guess "today" on its
 * own. Uses Intl.DateTimeFormat with an explicit `timeZone`, which is
 * fully independent of the host machine's local timezone and
 * process.env.TZ (both are ignored once `timeZone` is set).
 *
 * Fails loudly on bad input rather than silently producing a wrong
 * business date — Attendance date correctness has real payroll/reporting
 * consequences, so an invalid timestamp or an unrecognized IANA zone
 * throws instead of falling back to a default (unlike
 * getAttendanceTimezone(), where a safe global default makes sense for
 * "which zone to use"; there is no equivalently safe default for "what
 * date did this happen on").
 */
export function resolveAttendanceDate(instant: Date | string, timezone: string): string {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  if (isNaN(date.getTime())) {
    throw new Error(`resolveAttendanceDate: invalid timestamp: ${String(instant)}`);
  }

  try {
    // en-CA locale formats as YYYY-MM-DD, which is exactly the DATE column format.
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(date);
  } catch {
    throw new Error(`resolveAttendanceDate: invalid timezone: ${timezone}`);
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidCalendarDate(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/**
 * Converts a (date, HH:MM, IANA timezone) triple into a UTC instant.
 * Implemented via the offset round-trip trick: format a UTC guess back
 * into the target timezone, measure the drift, and correct — avoids
 * needing a timezone database library (none is installed; spec §22
 * forbids adding one for this).
 *
 * DST edge cases (verified empirically against Node's real Intl
 * implementation, not assumed): a single correction pass is used, never
 * iterated further, because a second pass was confirmed to diverge
 * rather than converge near a transition. This single pass has two
 * well-defined, deterministic outcomes at the two kinds of DST boundary:
 *   - Spring-forward gap (the local wall-clock time never occurs,
 *     e.g. 02:30 on the day clocks jump from 02:00 to 03:00): resolves
 *     to the instant shifted forward past the gap by the gap's exact
 *     duration (e.g. 02:30 resolves as if it were 03:30 post-transition).
 *   - Fall-back ambiguous hour (the local wall-clock time occurs twice,
 *     e.g. 01:30 on the day clocks fall back from 02:00 to 01:00):
 *     resolves to the FIRST (earlier, pre-transition) occurrence.
 * Both behaviors are locked in by dedicated tests in
 * attendance-rules.test.ts and must not change without updating them.
 */
function zonedTimeToInstant(dateStr: string, timeStr: string, timezone: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(utcGuess);
  } catch {
    throw new Error(`resolveScheduledWindow: invalid timezone: ${timezone}`);
  }

  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asIfUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  const driftMs = asIfUtc - utcGuess.getTime();
  return new Date(utcGuess.getTime() - driftMs).toISOString();
}

export interface ResolveScheduledWindowInput {
  attendanceDate: string; // YYYY-MM-DD, already resolved via resolveAttendanceDate()
  scheduledStart: string; // HH:MM (24h, zero-padded)
  scheduledEnd: string;   // HH:MM (24h, zero-padded)
  timezone: string;
}

export interface ResolveScheduledWindowResult {
  scheduledStartAt: string; // ISO instant (UTC)
  scheduledEndAt: string;   // ISO instant (UTC)
  isOvernight: boolean;
}

/**
 * Combines a schedule's local start/end TIME with the attendance_date and
 * timezone to produce concrete instants — spec §17. This is the ONLY
 * function that may decide "the shift crosses midnight" — nothing else
 * in the codebase may independently compare scheduledEnd < scheduledStart
 * and add a day.
 *
 * Cross-day rule: scheduledEnd < scheduledStart means the end belongs to
 * the next calendar day (overnight shift). scheduledEnd > scheduledStart
 * means same day. scheduledEnd === scheduledStart is rejected as an
 * invalid schedule (not silently treated as a 24-hour shift) — the spec
 * does not define a 24-hour-shift semantic, and guessing one would hide
 * a very plausible data-entry mistake (e.g. both fields defaulting to
 * the same value).
 *
 * All four inputs are validated explicitly; nothing is passed through to
 * produce a NaN/Invalid Date/undefined result — every invalid input
 * throws a specific, identifiable Error.
 */
export function resolveScheduledWindow(input: ResolveScheduledWindowInput): ResolveScheduledWindowResult {
  const { attendanceDate, scheduledStart, scheduledEnd, timezone } = input;

  if (!DATE_RE.test(attendanceDate) || !isValidCalendarDate(attendanceDate)) {
    throw new Error(`resolveScheduledWindow: invalid attendanceDate: ${attendanceDate}`);
  }
  if (!TIME_RE.test(scheduledStart)) {
    throw new Error(`resolveScheduledWindow: invalid scheduledStart: ${scheduledStart}`);
  }
  if (!TIME_RE.test(scheduledEnd)) {
    throw new Error(`resolveScheduledWindow: invalid scheduledEnd: ${scheduledEnd}`);
  }
  if (scheduledStart === scheduledEnd) {
    throw new Error(
      `resolveScheduledWindow: scheduledStart and scheduledEnd cannot be equal (${scheduledStart}) — ` +
      `this is an invalid schedule, not a 24-hour shift`
    );
  }

  const scheduledStartAt = zonedTimeToInstant(attendanceDate, scheduledStart, timezone);
  const isOvernight = scheduledEnd < scheduledStart;
  const endDate = isOvernight ? addDays(attendanceDate, 1) : attendanceDate;
  const scheduledEndAt = zonedTimeToInstant(endDate, scheduledEnd, timezone);

  return { scheduledStartAt, scheduledEndAt, isOvernight };
}

export type PersistedAttendanceStatus =
  | 'PRESENT' | 'LATE' | 'EARLY_LEAVE' | 'LATE_AND_EARLY' | 'INCOMPLETE' | 'WORKED_ON_REST_DAY';
export type ReportedAttendanceStatus = PersistedAttendanceStatus | 'ABSENT' | 'REST_DAY';

export interface ResolveAttendanceStatusInput {
  /** Output of resolveScheduledWindow(), or null if the staff member has no effective schedule that day. */
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  /** The reduced (first) check-in instant for the day — caller merges multiple sessions before calling this. */
  actualCheckIn: string;
  /** The reduced (last CLOSED session's) checkout instant, or null if there is none yet / it was never a clean logout. */
  actualCheckout: string | null;
  gracePeriodMinutes: number;
  isRestDay: boolean;
  /**
   * LOGOUT = a real, trustworthy checkout — evaluate Early Leave normally.
   * TIMEOUT / SYSTEM = no trustworthy checkout was ever recorded — forces INCOMPLETE.
   * null = the day's last session is still open (no checkout attempt at all yet) — not Incomplete,
   *        just evaluate lateness from the check-in; there is nothing to compare for Early Leave.
   */
  checkoutSource: 'LOGOUT' | 'TIMEOUT' | 'SYSTEM' | null;
}

export interface ResolveAttendanceStatusResult {
  status: PersistedAttendanceStatus;
  lateMinutes: number;
  earlyLeaveMinutes: number;
}

/** Floors to whole minutes — 5:59 elapsed must never round up to "6 minutes late". */
function minutesBetweenFloor(fromIso: string, toIso: string): number {
  return Math.floor((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000);
}

function assertValidInstant(value: string, label: string): void {
  if (isNaN(new Date(value).getTime())) {
    throw new Error(`resolveAttendanceStatus: invalid ${label}: ${value}`);
  }
}

/**
 * Single entry point for Attendance status/late/early-leave classification
 * — spec §13/§14/§16. Pure function: operates only on an already-reduced
 * single check-in/checkout pair (multi-session reduction — first login,
 * last closed logout, any-TIMEOUT flag — is the caller's/repository's
 * job, not this function's; see spec §12). Grace period is symmetric and
 * subtracted from the final minute count, floored to whole minutes.
 *
 * Status priority (fixed, tested, not an incidental if/else order):
 *   1. INCOMPLETE          — checkoutSource TIMEOUT/SYSTEM, unconditionally
 *   2. WORKED_ON_REST_DAY  — isRestDay, overrides the ordinary label below
 *   3. LATE_AND_EARLY
 *   4. LATE
 *   5. EARLY_LEAVE
 *   6. PRESENT
 */
export function resolveAttendanceStatus(input: ResolveAttendanceStatusInput): ResolveAttendanceStatusResult {
  const { scheduledStartAt, scheduledEndAt, actualCheckIn, actualCheckout, gracePeriodMinutes, isRestDay, checkoutSource } = input;

  if (!Number.isFinite(gracePeriodMinutes) || gracePeriodMinutes < 0) {
    throw new Error(`resolveAttendanceStatus: invalid gracePeriodMinutes: ${gracePeriodMinutes} (must be a finite number >= 0)`);
  }
  assertValidInstant(actualCheckIn, 'actualCheckIn');
  if (scheduledStartAt !== null) assertValidInstant(scheduledStartAt, 'scheduledStartAt');
  if (scheduledEndAt !== null) assertValidInstant(scheduledEndAt, 'scheduledEndAt');
  if (checkoutSource === 'LOGOUT' && actualCheckout === null) {
    throw new Error('resolveAttendanceStatus: checkoutSource is LOGOUT but actualCheckout is null');
  }
  if (actualCheckout !== null) assertValidInstant(actualCheckout, 'actualCheckout');

  const lateMinutes = scheduledStartAt
    ? Math.max(0, minutesBetweenFloor(scheduledStartAt, actualCheckIn) - gracePeriodMinutes)
    : 0;

  // Priority 1: an unreliable/missing checkout always wins, regardless of lateness or rest day.
  if (checkoutSource === 'TIMEOUT' || checkoutSource === 'SYSTEM') {
    return { status: 'INCOMPLETE', lateMinutes, earlyLeaveMinutes: 0 };
  }

  const earlyLeaveMinutes =
    scheduledEndAt && checkoutSource === 'LOGOUT' && actualCheckout
      ? Math.max(0, minutesBetweenFloor(actualCheckout, scheduledEndAt) - gracePeriodMinutes)
      : 0;

  // Priority 2: Rest Day overrides the ordinary PRESENT/LATE/EARLY_LEAVE/LATE_AND_EARLY label,
  // but the underlying minute detail is still preserved.
  if (isRestDay) {
    return { status: 'WORKED_ON_REST_DAY', lateMinutes, earlyLeaveMinutes };
  }

  const isLate = lateMinutes > 0;
  const isEarly = earlyLeaveMinutes > 0;
  let status: PersistedAttendanceStatus;
  if (isLate && isEarly) status = 'LATE_AND_EARLY';
  else if (isLate) status = 'LATE';
  else if (isEarly) status = 'EARLY_LEAVE';
  else status = 'PRESENT';

  return { status, lateMinutes, earlyLeaveMinutes };
}
