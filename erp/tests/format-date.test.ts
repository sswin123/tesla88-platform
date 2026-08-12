import { describe, it, expect } from 'vitest';
import { formatAttendanceDate, formatClockTime } from '@/lib/format-date';

describe('formatAttendanceDate', () => {
  it('formats a YYYY-MM-DD string as a readable date', () => {
    expect(formatAttendanceDate('2026-08-11')).toBe('11 Aug 2026');
  });
});

describe('formatClockTime', () => {
  it('formats an ISO instant as HH:MM in the given timezone', () => {
    expect(formatClockTime('2026-08-11T01:20:00.000Z', 'Asia/Kuala_Lumpur')).toBe('09:20');
  });

  it('returns an em dash for null', () => {
    expect(formatClockTime(null, 'Asia/Kuala_Lumpur')).toBe('—');
  });
});
