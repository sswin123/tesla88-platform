import { describe, it, expect } from 'vitest';
import { resolveAttendanceDate, resolveScheduledWindow, resolveAttendanceStatus } from '@/lib/attendance-rules';

describe('resolveAttendanceDate', () => {
  it('1. Asia/Kuala_Lumpur — daytime instant resolves to the expected local calendar date', () => {
    // 2026-08-11 09:00 KL (UTC+8) = 2026-08-11 01:00 UTC
    expect(resolveAttendanceDate('2026-08-11T01:00:00.000Z', 'Asia/Kuala_Lumpur')).toBe('2026-08-11');
  });

  it('2. UTC timezone — the calendar date matches the raw UTC date', () => {
    expect(resolveAttendanceDate('2026-08-11T23:59:00.000Z', 'UTC')).toBe('2026-08-11');
    expect(resolveAttendanceDate('2026-08-12T00:00:00.000Z', 'UTC')).toBe('2026-08-12');
  });

  it('3. America/New_York — resolves correctly in winter (EST, UTC-5)', () => {
    expect(resolveAttendanceDate('2026-01-15T04:30:00.000Z', 'America/New_York')).toBe('2026-01-14');
  });

  it('3b. America/New_York — resolves correctly in summer (EDT, UTC-4), proving DST is honoured', () => {
    expect(resolveAttendanceDate('2026-07-15T04:30:00.000Z', 'America/New_York')).toBe('2026-07-15');
  });

  it('4. Europe/London — winter (GMT, UTC+0)', () => {
    expect(resolveAttendanceDate('2026-01-15T23:59:59.000Z', 'Europe/London')).toBe('2026-01-15');
  });

  it('4b. Europe/London — summer (BST, UTC+1)', () => {
    expect(resolveAttendanceDate('2026-07-15T22:30:00.000Z', 'Europe/London')).toBe('2026-07-15');
  });

  it('5. midnight boundary — 23:59:59 local stays on the current day (Asia/Kuala_Lumpur)', () => {
    // 2026-08-11 23:59:59 KL = 2026-08-11 15:59:59 UTC
    expect(resolveAttendanceDate('2026-08-11T15:59:59.000Z', 'Asia/Kuala_Lumpur')).toBe('2026-08-11');
  });

  it('6. midnight boundary — 00:00:00 local rolls over to the next day (Asia/Kuala_Lumpur)', () => {
    // 2026-08-12 00:00:00 KL = 2026-08-11 16:00:00 UTC
    expect(resolveAttendanceDate('2026-08-11T16:00:00.000Z', 'Asia/Kuala_Lumpur')).toBe('2026-08-12');
  });

  it('7. UTC → Kuala Lumpur crosses a calendar date even though the UTC date has not changed yet', () => {
    // Same UTC calendar day (2026-08-11), one instant resolves KL-local to the 11th, the very next
    // second resolves KL-local to the 12th — proves the conversion is timezone-driven, not UTC-passthrough.
    expect(resolveAttendanceDate('2026-08-11T15:59:59.000Z', 'Asia/Kuala_Lumpur')).toBe('2026-08-11');
    expect(resolveAttendanceDate('2026-08-11T16:00:00.000Z', 'Asia/Kuala_Lumpur')).toBe('2026-08-12');
  });

  it('8. UTC → New York crosses a calendar date the opposite direction (behind UTC, not ahead)', () => {
    // 2026-08-12 03:59:59 UTC is still 2026-08-11 23:59:59 EDT (UTC-4) — the US date lags UTC,
    // the mirror-image case of Kuala Lumpur (which runs ahead of UTC).
    expect(resolveAttendanceDate('2026-08-12T03:59:59.000Z', 'America/New_York')).toBe('2026-08-11');
    expect(resolveAttendanceDate('2026-08-12T04:00:00.000Z', 'America/New_York')).toBe('2026-08-12');
  });

  it('9. invalid timestamp — throws a clear, explicit error rather than producing a silent wrong date', () => {
    expect(() => resolveAttendanceDate('not-a-real-timestamp', 'Asia/Kuala_Lumpur')).toThrow(/invalid timestamp/i);
  });

  it('9b. invalid Date object — same explicit-error behavior', () => {
    expect(() => resolveAttendanceDate(new Date('garbage'), 'Asia/Kuala_Lumpur')).toThrow(/invalid timestamp/i);
  });

  it('10. invalid timezone — throws a clear, explicit error rather than silently falling back', () => {
    expect(() => resolveAttendanceDate('2026-08-11T01:00:00.000Z', 'Not/A_Real_Zone')).toThrow(/invalid timezone/i);
  });

  it('11. date-only semantics — the returned value is always exactly YYYY-MM-DD, never a time component', () => {
    const result = resolveAttendanceDate('2026-08-11T01:23:45.678Z', 'Asia/Kuala_Lumpur');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('12/13. does not depend on the machine-local timezone or process.env.TZ — explicit param always wins', () => {
    const originalTz = process.env.TZ;
    try {
      process.env.TZ = 'Pacific/Kiritimati'; // UTC+14 — as far from Asia/Kuala_Lumpur as practical to prove independence
      const result = resolveAttendanceDate('2026-08-11T16:00:00.000Z', 'Asia/Kuala_Lumpur');
      expect(result).toBe('2026-08-12'); // identical to the no-TZ-env case verified in test 6
    } finally {
      process.env.TZ = originalTz;
    }
  });

  it('14. deterministic — the exact same input always produces the exact same output', () => {
    const a = resolveAttendanceDate('2026-08-11T16:00:00.000Z', 'Asia/Kuala_Lumpur');
    const b = resolveAttendanceDate('2026-08-11T16:00:00.000Z', 'Asia/Kuala_Lumpur');
    const c = resolveAttendanceDate('2026-08-11T16:00:00.000Z', 'Asia/Kuala_Lumpur');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('accepts a Date object as well as an ISO string, with identical results', () => {
    expect(resolveAttendanceDate(new Date('2026-08-11T01:00:00.000Z'), 'Asia/Kuala_Lumpur')).toBe('2026-08-11');
  });
});

describe('resolveScheduledWindow', () => {
  it('1. normal same-day shift 09:00 → 18:00 (Asia/Kuala_Lumpur)', () => {
    const w = resolveScheduledWindow({
      attendanceDate: '2026-08-11', scheduledStart: '09:00', scheduledEnd: '18:00', timezone: 'Asia/Kuala_Lumpur',
    });
    expect(w).toEqual({
      scheduledStartAt: '2026-08-11T01:00:00.000Z', // 09:00 +08:00
      scheduledEndAt: '2026-08-11T10:00:00.000Z',    // 18:00 +08:00
      isOvernight: false,
    });
  });

  it('2. overnight shift 18:00 → 03:00 pushes the end to the next calendar day, not the previous one', () => {
    const w = resolveScheduledWindow({
      attendanceDate: '2026-08-11', scheduledStart: '18:00', scheduledEnd: '03:00', timezone: 'Asia/Kuala_Lumpur',
    });
    expect(w.scheduledStartAt).toBe('2026-08-11T10:00:00.000Z'); // 18:00 Aug 11 +08:00
    expect(w.scheduledEndAt).toBe('2026-08-11T19:00:00.000Z');   // 03:00 Aug 12 KL (+08:00) = 19:00 Aug 11 UTC
    expect(w.isOvernight).toBe(true);
  });

  it('3. overnight shift 23:00 → 00:30 (a short overnight window)', () => {
    const w = resolveScheduledWindow({
      attendanceDate: '2026-08-11', scheduledStart: '23:00', scheduledEnd: '00:30', timezone: 'Asia/Kuala_Lumpur',
    });
    expect(w.scheduledStartAt).toBe('2026-08-11T15:00:00.000Z');
    expect(w.scheduledEndAt).toBe('2026-08-11T16:30:00.000Z');
    expect(w.isOvernight).toBe(true);
  });

  it('4. overnight shift 23:59 → 00:01 (a 2-minute window spanning midnight)', () => {
    const w = resolveScheduledWindow({
      attendanceDate: '2026-08-11', scheduledStart: '23:59', scheduledEnd: '00:01', timezone: 'Asia/Kuala_Lumpur',
    });
    expect(w.scheduledStartAt).toBe('2026-08-11T15:59:00.000Z');
    expect(w.scheduledEndAt).toBe('2026-08-11T16:01:00.000Z');
    expect(w.isOvernight).toBe(true);
    expect(new Date(w.scheduledEndAt).getTime() - new Date(w.scheduledStartAt).getTime()).toBe(2 * 60_000);
  });

  it('5. midnight start 00:00 → 23:59 (same-day, nearly-full-day shift)', () => {
    const w = resolveScheduledWindow({
      attendanceDate: '2026-08-11', scheduledStart: '00:00', scheduledEnd: '23:59', timezone: 'Asia/Kuala_Lumpur',
    });
    expect(w.scheduledStartAt).toBe('2026-08-10T16:00:00.000Z');
    expect(w.scheduledEndAt).toBe('2026-08-11T15:59:00.000Z');
    expect(w.isOvernight).toBe(false);
  });

  it('6. scheduledStart === scheduledEnd is an invalid schedule, not a 24-hour shift — throws explicitly', () => {
    expect(() => resolveScheduledWindow({
      attendanceDate: '2026-08-11', scheduledStart: '09:00', scheduledEnd: '09:00', timezone: 'Asia/Kuala_Lumpur',
    })).toThrow(/cannot be equal|invalid/i);
  });

  it('6b. 00:00 === 00:00 is also invalid (same rule, no special-casing midnight)', () => {
    expect(() => resolveScheduledWindow({
      attendanceDate: '2026-08-11', scheduledStart: '00:00', scheduledEnd: '00:00', timezone: 'Asia/Kuala_Lumpur',
    })).toThrow(/cannot be equal|invalid/i);
  });

  it('7. invalid scheduledStart format throws explicitly', () => {
    expect(() => resolveScheduledWindow({
      attendanceDate: '2026-08-11', scheduledStart: '25:00', scheduledEnd: '18:00', timezone: 'Asia/Kuala_Lumpur',
    })).toThrow(/invalid scheduledStart/i);
    expect(() => resolveScheduledWindow({
      attendanceDate: '2026-08-11', scheduledStart: '9:00', scheduledEnd: '18:00', timezone: 'Asia/Kuala_Lumpur',
    })).toThrow(/invalid scheduledStart/i);
  });

  it('8. invalid scheduledEnd format throws explicitly', () => {
    expect(() => resolveScheduledWindow({
      attendanceDate: '2026-08-11', scheduledStart: '09:00', scheduledEnd: '18:60', timezone: 'Asia/Kuala_Lumpur',
    })).toThrow(/invalid scheduledEnd/i);
  });

  it('9. invalid attendanceDate (malformed string) throws explicitly', () => {
    expect(() => resolveScheduledWindow({
      attendanceDate: '2026/08/11', scheduledStart: '09:00', scheduledEnd: '18:00', timezone: 'Asia/Kuala_Lumpur',
    })).toThrow(/invalid attendanceDate/i);
  });

  it('9b. invalid attendanceDate (nonexistent calendar date, e.g. Feb 30) throws explicitly', () => {
    expect(() => resolveScheduledWindow({
      attendanceDate: '2026-02-30', scheduledStart: '09:00', scheduledEnd: '18:00', timezone: 'Asia/Kuala_Lumpur',
    })).toThrow(/invalid attendanceDate/i);
  });

  it('10. invalid IANA timezone throws explicitly', () => {
    expect(() => resolveScheduledWindow({
      attendanceDate: '2026-08-11', scheduledStart: '09:00', scheduledEnd: '18:00', timezone: 'Not/A_Real_Zone',
    })).toThrow(/invalid timezone/i);
  });

  it('11. UTC timezone', () => {
    const w = resolveScheduledWindow({
      attendanceDate: '2026-08-11', scheduledStart: '09:00', scheduledEnd: '18:00', timezone: 'UTC',
    });
    expect(w.scheduledStartAt).toBe('2026-08-11T09:00:00.000Z');
    expect(w.scheduledEndAt).toBe('2026-08-11T18:00:00.000Z');
  });

  it('12. Asia/Kuala_Lumpur is covered by tests 1–5 above (dedicated case for completeness)', () => {
    const w = resolveScheduledWindow({
      attendanceDate: '2026-08-11', scheduledStart: '10:00', scheduledEnd: '19:00', timezone: 'Asia/Kuala_Lumpur',
    });
    expect(w.scheduledStartAt).toBe('2026-08-11T02:00:00.000Z');
  });

  it('13. America/New_York — normal shift in winter (EST, UTC-5)', () => {
    const w = resolveScheduledWindow({
      attendanceDate: '2026-01-15', scheduledStart: '09:00', scheduledEnd: '17:00', timezone: 'America/New_York',
    });
    expect(w.scheduledStartAt).toBe('2026-01-15T14:00:00.000Z');
    expect(w.scheduledEndAt).toBe('2026-01-15T22:00:00.000Z');
  });

  it('13b. America/New_York — the same 09:00–17:00 shift resolves to different UTC instants in summer (EDT), proving DST is honoured', () => {
    const w = resolveScheduledWindow({
      attendanceDate: '2026-07-15', scheduledStart: '09:00', scheduledEnd: '17:00', timezone: 'America/New_York',
    });
    expect(w.scheduledStartAt).toBe('2026-07-15T13:00:00.000Z'); // one hour earlier in UTC than the winter case
    expect(w.scheduledEndAt).toBe('2026-07-15T21:00:00.000Z');
  });

  it('14a. DST spring-forward gap — a scheduledStart that falls inside the nonexistent local hour resolves deterministically', () => {
    // 2026-03-08 is America/New_York's spring-forward day: local clocks jump 02:00 -> 03:00,
    // so 02:30 never happens locally. Verified empirically against Node's real Intl implementation
    // (see Task 3 investigation): the single round-trip correction lands on 2026-03-08T07:30:00.000Z,
    // which Intl reports back as local 03:30 EDT — i.e. the nonexistent instant is pushed forward
    // by exactly the gap duration. This is the documented, deterministic behavior; it is NOT claimed
    // to equal a literal "02:30" wall clock, because no such instant exists.
    const w = resolveScheduledWindow({
      attendanceDate: '2026-03-08', scheduledStart: '02:30', scheduledEnd: '10:00', timezone: 'America/New_York',
    });
    expect(w.scheduledStartAt).toBe('2026-03-08T07:30:00.000Z');
  });

  it('14b. DST fall-back ambiguous hour — a scheduledStart inside the repeated local hour resolves to the first (pre-transition) occurrence', () => {
    // 2026-11-01 is America/New_York's fall-back day: local 01:00-01:59 happens twice (EDT then EST).
    // Verified empirically: the round-trip correction converges to 2026-11-01T05:30:00.000Z, which is
    // the FIRST (EDT) occurrence of local 01:30, not the second (EST) one.
    const w = resolveScheduledWindow({
      attendanceDate: '2026-11-01', scheduledStart: '01:30', scheduledEnd: '10:00', timezone: 'America/New_York',
    });
    expect(w.scheduledStartAt).toBe('2026-11-01T05:30:00.000Z');
  });

  it('15. same input always produces the same output (deterministic)', () => {
    const input = { attendanceDate: '2026-08-11', scheduledStart: '18:00', scheduledEnd: '03:00', timezone: 'Asia/Kuala_Lumpur' } as const;
    const a = resolveScheduledWindow(input);
    const b = resolveScheduledWindow(input);
    expect(a).toEqual(b);
  });

  it('16. independent of the machine-local timezone / process.env.TZ', () => {
    const originalTz = process.env.TZ;
    try {
      process.env.TZ = 'Pacific/Kiritimati';
      const w = resolveScheduledWindow({
        attendanceDate: '2026-08-11', scheduledStart: '18:00', scheduledEnd: '03:00', timezone: 'Asia/Kuala_Lumpur',
      });
      expect(w.scheduledEndAt).toBe('2026-08-11T19:00:00.000Z'); // identical to test 2's result
    } finally {
      process.env.TZ = originalTz;
    }
  });

  it('17. output includes an explicit isOvernight flag so callers never re-derive it', () => {
    const same = resolveScheduledWindow({
      attendanceDate: '2026-08-11', scheduledStart: '09:00', scheduledEnd: '18:00', timezone: 'Asia/Kuala_Lumpur',
    });
    const overnight = resolveScheduledWindow({
      attendanceDate: '2026-08-11', scheduledStart: '18:00', scheduledEnd: '03:00', timezone: 'Asia/Kuala_Lumpur',
    });
    expect(same.isOvernight).toBe(false);
    expect(overnight.isOvernight).toBe(true);
  });
});

describe('resolveAttendanceStatus', () => {
  // Fixture: normal same-day shift 09:00-18:00 Asia/Kuala_Lumpur, verified in resolveScheduledWindow test 1.
  const NORMAL_SCHEDULE = {
    scheduledStartAt: '2026-08-11T01:00:00.000Z', // 09:00 KL
    scheduledEndAt: '2026-08-11T10:00:00.000Z',   // 18:00 KL
  };
  // Fixture: overnight shift 18:00-03:00 Asia/Kuala_Lumpur, verified in resolveScheduledWindow test 2.
  const OVERNIGHT_SCHEDULE = {
    scheduledStartAt: '2026-08-11T10:00:00.000Z', // 18:00 KL Aug 11
    scheduledEndAt: '2026-08-11T19:00:00.000Z',   // 03:00 KL Aug 12
  };
  const GRACE_5 = 5;

  // --- PRESENT ---

  it('1. on-time check-in and checkout is PRESENT with zero late/early minutes', () => {
    const r = resolveAttendanceStatus({
      ...NORMAL_SCHEDULE, actualCheckIn: '2026-08-11T01:00:00.000Z', actualCheckout: '2026-08-11T10:00:00.000Z',
      gracePeriodMinutes: GRACE_5, isRestDay: false, checkoutSource: 'LOGOUT',
    });
    expect(r).toEqual({ status: 'PRESENT', lateMinutes: 0, earlyLeaveMinutes: 0 });
  });

  it('2. check-in exactly at the grace boundary (09:05) is still PRESENT', () => {
    const r = resolveAttendanceStatus({
      ...NORMAL_SCHEDULE, actualCheckIn: '2026-08-11T01:05:00.000Z', actualCheckout: '2026-08-11T10:00:00.000Z',
      gracePeriodMinutes: GRACE_5, isRestDay: false, checkoutSource: 'LOGOUT',
    });
    expect(r.status).toBe('PRESENT');
    expect(r.lateMinutes).toBe(0);
  });

  it('2b. checkout exactly at the early-grace boundary (17:55) is still PRESENT', () => {
    const r = resolveAttendanceStatus({
      ...NORMAL_SCHEDULE, actualCheckIn: '2026-08-11T01:00:00.000Z', actualCheckout: '2026-08-11T09:55:00.000Z',
      gracePeriodMinutes: GRACE_5, isRestDay: false, checkoutSource: 'LOGOUT',
    });
    expect(r.status).toBe('PRESENT');
    expect(r.earlyLeaveMinutes).toBe(0);
  });

  // --- LATE ---

  it('3. check-in 1 minute past the grace boundary (09:06) is LATE by exactly 1 minute', () => {
    const r = resolveAttendanceStatus({
      ...NORMAL_SCHEDULE, actualCheckIn: '2026-08-11T01:06:00.000Z', actualCheckout: '2026-08-11T10:00:00.000Z',
      gracePeriodMinutes: GRACE_5, isRestDay: false, checkoutSource: 'LOGOUT',
    });
    expect(r.status).toBe('LATE');
    expect(r.lateMinutes).toBe(1);
    expect(r.earlyLeaveMinutes).toBe(0);
  });

  it('4. check-in at 09:20 is LATE by 15 minutes (20 elapsed - 5 grace)', () => {
    const r = resolveAttendanceStatus({
      ...NORMAL_SCHEDULE, actualCheckIn: '2026-08-11T01:20:00.000Z', actualCheckout: '2026-08-11T10:00:00.000Z',
      gracePeriodMinutes: GRACE_5, isRestDay: false, checkoutSource: 'LOGOUT',
    });
    expect(r.lateMinutes).toBe(15);
  });

  // --- EARLY_LEAVE ---

  it('5. checkout 1 minute past the early-grace boundary (17:54) is EARLY_LEAVE by exactly 1 minute', () => {
    const r = resolveAttendanceStatus({
      ...NORMAL_SCHEDULE, actualCheckIn: '2026-08-11T01:00:00.000Z', actualCheckout: '2026-08-11T09:54:00.000Z',
      gracePeriodMinutes: GRACE_5, isRestDay: false, checkoutSource: 'LOGOUT',
    });
    expect(r.status).toBe('EARLY_LEAVE');
    expect(r.earlyLeaveMinutes).toBe(1);
    expect(r.lateMinutes).toBe(0);
  });

  it('6. checkout at 17:40 is EARLY_LEAVE by 15 minutes (20 elapsed - 5 grace)', () => {
    const r = resolveAttendanceStatus({
      ...NORMAL_SCHEDULE, actualCheckIn: '2026-08-11T01:00:00.000Z', actualCheckout: '2026-08-11T09:40:00.000Z',
      gracePeriodMinutes: GRACE_5, isRestDay: false, checkoutSource: 'LOGOUT',
    });
    expect(r.earlyLeaveMinutes).toBe(15);
  });

  // --- LATE_AND_EARLY ---

  it('7. late check-in (09:20) and early checkout (17:40) together produce LATE_AND_EARLY with both values preserved', () => {
    const r = resolveAttendanceStatus({
      ...NORMAL_SCHEDULE, actualCheckIn: '2026-08-11T01:20:00.000Z', actualCheckout: '2026-08-11T09:40:00.000Z',
      gracePeriodMinutes: GRACE_5, isRestDay: false, checkoutSource: 'LOGOUT',
    });
    expect(r.status).toBe('LATE_AND_EARLY');
    expect(r.lateMinutes).toBe(15);
    expect(r.earlyLeaveMinutes).toBe(15);
  });

  // --- Seconds / rounding boundary (floor policy) ---

  it('8. check-in at 09:05:59 floors to 5 elapsed minutes, within grace — PRESENT, not 6 minutes late', () => {
    const r = resolveAttendanceStatus({
      ...NORMAL_SCHEDULE, actualCheckIn: '2026-08-11T01:05:59.000Z', actualCheckout: '2026-08-11T10:00:00.000Z',
      gracePeriodMinutes: GRACE_5, isRestDay: false, checkoutSource: 'LOGOUT',
    });
    expect(r.status).toBe('PRESENT');
    expect(r.lateMinutes).toBe(0);
  });

  it('9. check-in at 09:06:00 exactly floors to 6 elapsed minutes — LATE by 1', () => {
    const r = resolveAttendanceStatus({
      ...NORMAL_SCHEDULE, actualCheckIn: '2026-08-11T01:06:00.000Z', actualCheckout: '2026-08-11T10:00:00.000Z',
      gracePeriodMinutes: GRACE_5, isRestDay: false, checkoutSource: 'LOGOUT',
    });
    expect(r.lateMinutes).toBe(1);
  });

  // --- INCOMPLETE / TIMEOUT ---

  it('10. checkoutSource=TIMEOUT is always INCOMPLETE, even with a late check-in', () => {
    const r = resolveAttendanceStatus({
      ...NORMAL_SCHEDULE, actualCheckIn: '2026-08-11T01:20:00.000Z', actualCheckout: null,
      gracePeriodMinutes: GRACE_5, isRestDay: false, checkoutSource: 'TIMEOUT',
    });
    expect(r.status).toBe('INCOMPLETE');
    expect(r.lateMinutes).toBe(15); // lateness is still known and preserved
    expect(r.earlyLeaveMinutes).toBe(0); // never computed — no trustworthy checkout exists
  });

  it('10b. checkoutSource=SYSTEM is treated the same as TIMEOUT — not a trustworthy logout', () => {
    const r = resolveAttendanceStatus({
      ...NORMAL_SCHEDULE, actualCheckIn: '2026-08-11T01:00:00.000Z', actualCheckout: null,
      gracePeriodMinutes: GRACE_5, isRestDay: false, checkoutSource: 'SYSTEM',
    });
    expect(r.status).toBe('INCOMPLETE');
  });

  it('11. TIMEOUT takes priority over Rest Day — INCOMPLETE, not WORKED_ON_REST_DAY (data completeness wins)', () => {
    const r = resolveAttendanceStatus({
      ...NORMAL_SCHEDULE, actualCheckIn: '2026-08-11T01:00:00.000Z', actualCheckout: null,
      gracePeriodMinutes: GRACE_5, isRestDay: true, checkoutSource: 'TIMEOUT',
    });
    expect(r.status).toBe('INCOMPLETE');
  });

  it('12. a still-open session (checkoutSource=null, no checkout yet) is NOT Incomplete — only late is evaluated', () => {
    const r = resolveAttendanceStatus({
      ...NORMAL_SCHEDULE, actualCheckIn: '2026-08-11T01:00:00.000Z', actualCheckout: null,
      gracePeriodMinutes: GRACE_5, isRestDay: false, checkoutSource: null,
    });
    expect(r.status).toBe('PRESENT');
  });

  it('12b. a still-open session with a late check-in is LATE, not Incomplete', () => {
    const r = resolveAttendanceStatus({
      ...NORMAL_SCHEDULE, actualCheckIn: '2026-08-11T01:20:00.000Z', actualCheckout: null,
      gracePeriodMinutes: GRACE_5, isRestDay: false, checkoutSource: null,
    });
    expect(r.status).toBe('LATE');
    expect(r.earlyLeaveMinutes).toBe(0);
  });

  // --- Rest Day ---

  it('13. Rest Day with on-time attendance is WORKED_ON_REST_DAY, not PRESENT', () => {
    const r = resolveAttendanceStatus({
      ...NORMAL_SCHEDULE, actualCheckIn: '2026-08-11T01:00:00.000Z', actualCheckout: '2026-08-11T10:00:00.000Z',
      gracePeriodMinutes: GRACE_5, isRestDay: true, checkoutSource: 'LOGOUT',
    });
    expect(r.status).toBe('WORKED_ON_REST_DAY');
  });

  it('14. Rest Day preserves late/early minute detail even though the status label is WORKED_ON_REST_DAY', () => {
    const r = resolveAttendanceStatus({
      ...NORMAL_SCHEDULE, actualCheckIn: '2026-08-11T01:20:00.000Z', actualCheckout: '2026-08-11T09:40:00.000Z',
      gracePeriodMinutes: GRACE_5, isRestDay: true, checkoutSource: 'LOGOUT',
    });
    expect(r.status).toBe('WORKED_ON_REST_DAY');
    expect(r.lateMinutes).toBe(15);
    expect(r.earlyLeaveMinutes).toBe(15);
  });

  // --- Overnight (reuses Task 3's verified OVERNIGHT_SCHEDULE fixture, no re-derivation of +1 day here) ---

  it('15. overnight shift — late check-in (18:10) with on-time checkout (03:00) is LATE', () => {
    const r = resolveAttendanceStatus({
      ...OVERNIGHT_SCHEDULE, actualCheckIn: '2026-08-11T10:10:00.000Z', actualCheckout: '2026-08-11T19:00:00.000Z',
      gracePeriodMinutes: GRACE_5, isRestDay: false, checkoutSource: 'LOGOUT',
    });
    expect(r.status).toBe('LATE');
    expect(r.lateMinutes).toBe(5);
    expect(r.earlyLeaveMinutes).toBe(0);
  });

  it('16. overnight shift — on-time check-in (18:00) with early checkout (02:50) is EARLY_LEAVE', () => {
    const r = resolveAttendanceStatus({
      ...OVERNIGHT_SCHEDULE, actualCheckIn: '2026-08-11T10:00:00.000Z', actualCheckout: '2026-08-11T18:50:00.000Z',
      gracePeriodMinutes: GRACE_5, isRestDay: false, checkoutSource: 'LOGOUT',
    });
    expect(r.status).toBe('EARLY_LEAVE');
    expect(r.earlyLeaveMinutes).toBe(5);
    expect(r.lateMinutes).toBe(0);
  });

  it('17. overnight shift — late check-in (18:10) AND early checkout (02:50) is LATE_AND_EARLY', () => {
    const r = resolveAttendanceStatus({
      ...OVERNIGHT_SCHEDULE, actualCheckIn: '2026-08-11T10:10:00.000Z', actualCheckout: '2026-08-11T18:50:00.000Z',
      gracePeriodMinutes: GRACE_5, isRestDay: false, checkoutSource: 'LOGOUT',
    });
    expect(r.status).toBe('LATE_AND_EARLY');
    expect(r.lateMinutes).toBe(5);
    expect(r.earlyLeaveMinutes).toBe(5);
  });

  // --- Grace period edge cases ---

  it('18. zero grace period — even 1 minute late counts as LATE', () => {
    const r = resolveAttendanceStatus({
      ...NORMAL_SCHEDULE, actualCheckIn: '2026-08-11T01:01:00.000Z', actualCheckout: '2026-08-11T10:00:00.000Z',
      gracePeriodMinutes: 0, isRestDay: false, checkoutSource: 'LOGOUT',
    });
    expect(r.status).toBe('LATE');
    expect(r.lateMinutes).toBe(1);
  });

  it('19. a large grace period (60 minutes) absorbs what would otherwise be a late check-in', () => {
    const r = resolveAttendanceStatus({
      ...NORMAL_SCHEDULE, actualCheckIn: '2026-08-11T01:30:00.000Z', actualCheckout: '2026-08-11T10:00:00.000Z',
      gracePeriodMinutes: 60, isRestDay: false, checkoutSource: 'LOGOUT',
    });
    expect(r.status).toBe('PRESENT');
    expect(r.lateMinutes).toBe(0);
  });

  it('20. negative gracePeriodMinutes throws explicitly rather than being silently clamped to zero', () => {
    expect(() => resolveAttendanceStatus({
      ...NORMAL_SCHEDULE, actualCheckIn: '2026-08-11T01:00:00.000Z', actualCheckout: '2026-08-11T10:00:00.000Z',
      gracePeriodMinutes: -1, isRestDay: false, checkoutSource: 'LOGOUT',
    })).toThrow(/gracePeriodMinutes/);
  });

  // --- Invalid input ---

  it('21. invalid actualCheckIn timestamp throws explicitly', () => {
    expect(() => resolveAttendanceStatus({
      ...NORMAL_SCHEDULE, actualCheckIn: 'not-a-timestamp', actualCheckout: '2026-08-11T10:00:00.000Z',
      gracePeriodMinutes: GRACE_5, isRestDay: false, checkoutSource: 'LOGOUT',
    })).toThrow(/invalid actualCheckIn/i);
  });

  it('22. invalid actualCheckout timestamp throws explicitly', () => {
    expect(() => resolveAttendanceStatus({
      ...NORMAL_SCHEDULE, actualCheckIn: '2026-08-11T01:00:00.000Z', actualCheckout: 'garbage',
      gracePeriodMinutes: GRACE_5, isRestDay: false, checkoutSource: 'LOGOUT',
    })).toThrow(/invalid actualCheckout/i);
  });

  it('23. checkoutSource=LOGOUT with a null actualCheckout is a contract violation — throws explicitly', () => {
    expect(() => resolveAttendanceStatus({
      ...NORMAL_SCHEDULE, actualCheckIn: '2026-08-11T01:00:00.000Z', actualCheckout: null,
      gracePeriodMinutes: GRACE_5, isRestDay: false, checkoutSource: 'LOGOUT',
    })).toThrow(/LOGOUT.*actualCheckout|actualCheckout.*LOGOUT/i);
  });

  it('24. no effective schedule (scheduledStartAt/EndAt both null) is always PRESENT with zero late/early', () => {
    const r = resolveAttendanceStatus({
      scheduledStartAt: null, scheduledEndAt: null,
      actualCheckIn: '2026-08-11T01:00:00.000Z', actualCheckout: '2026-08-11T10:00:00.000Z',
      gracePeriodMinutes: GRACE_5, isRestDay: false, checkoutSource: 'LOGOUT',
    });
    expect(r).toEqual({ status: 'PRESENT', lateMinutes: 0, earlyLeaveMinutes: 0 });
  });

  // --- Invariants ---

  it('invariant: lateMinutes and earlyLeaveMinutes are never negative, across every branch above', () => {
    const cases = [
      { actualCheckIn: '2026-08-11T00:00:00.000Z', actualCheckout: '2026-08-11T11:00:00.000Z', checkoutSource: 'LOGOUT' as const }, // early check-in, late checkout
      { actualCheckIn: '2026-08-11T01:20:00.000Z', actualCheckout: '2026-08-11T10:20:00.000Z', checkoutSource: 'LOGOUT' as const },
    ];
    for (const c of cases) {
      const r = resolveAttendanceStatus({ ...NORMAL_SCHEDULE, ...c, gracePeriodMinutes: GRACE_5, isRestDay: false });
      expect(r.lateMinutes).toBeGreaterThanOrEqual(0);
      expect(r.earlyLeaveMinutes).toBeGreaterThanOrEqual(0);
    }
  });

  it('invariant: PRESENT implies both minute values are exactly zero', () => {
    const r = resolveAttendanceStatus({
      ...NORMAL_SCHEDULE, actualCheckIn: '2026-08-11T01:00:00.000Z', actualCheckout: '2026-08-11T10:00:00.000Z',
      gracePeriodMinutes: GRACE_5, isRestDay: false, checkoutSource: 'LOGOUT',
    });
    expect(r.status).toBe('PRESENT');
    expect(r.lateMinutes).toBe(0);
    expect(r.earlyLeaveMinutes).toBe(0);
  });

  it('invariant: INCOMPLETE never produces a positive earlyLeaveMinutes', () => {
    const r = resolveAttendanceStatus({
      ...NORMAL_SCHEDULE, actualCheckIn: '2026-08-11T01:00:00.000Z', actualCheckout: null,
      gracePeriodMinutes: GRACE_5, isRestDay: false, checkoutSource: 'TIMEOUT',
    });
    expect(r.status).toBe('INCOMPLETE');
    expect(r.earlyLeaveMinutes).toBe(0);
  });
});
