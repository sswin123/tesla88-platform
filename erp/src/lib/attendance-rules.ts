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
