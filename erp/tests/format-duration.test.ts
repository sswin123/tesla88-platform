// erp/tests/format-duration.test.ts
import { describe, it, expect } from 'vitest';
import { formatDuration } from '@/lib/format-duration';

const NOW = new Date('2026-07-26T12:00:00Z');

describe('formatDuration', () => {
  it('returns an em dash when fromIso is null', () => {
    expect(formatDuration(null, NOW)).toBe('—');
  });

  it('formats minutes only when under an hour', () => {
    const from = new Date(NOW.getTime() - 45 * 60_000).toISOString();
    expect(formatDuration(from, NOW)).toBe('45m');
  });

  it('formats hours and minutes when over an hour', () => {
    const from = new Date(NOW.getTime() - (2 * 60 + 15) * 60_000).toISOString();
    expect(formatDuration(from, NOW)).toBe('2h 15m');
  });

  it('never returns a negative duration for a future timestamp', () => {
    const from = new Date(NOW.getTime() + 5 * 60_000).toISOString();
    expect(formatDuration(from, NOW)).toBe('0m');
  });
});
