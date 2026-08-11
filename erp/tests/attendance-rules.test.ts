import { describe, it, expect } from 'vitest';
import { resolveAttendanceDate } from '@/lib/attendance-rules';

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
