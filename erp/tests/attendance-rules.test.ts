import { describe, it, expect } from 'vitest';
import { resolveAttendanceDate, resolveScheduledWindow } from '@/lib/attendance-rules';

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
