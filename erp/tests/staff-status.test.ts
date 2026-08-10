// erp/tests/staff-status.test.ts
import { describe, it, expect } from 'vitest';
import { resolveDisplayStatus } from '@/lib/staff-status';

const NOW = new Date('2026-07-26T12:00:00Z');
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

describe('resolveDisplayStatus', () => {
  it('returns OFFLINE when stored status is OFFLINE, regardless of last_activity', () => {
    expect(resolveDisplayStatus({ storedStatus: 'OFFLINE', lastActivity: minsAgo(0), now: NOW })).toBe('OFFLINE');
  });

  it('returns BREAK when stored status is BREAK, regardless of last_activity', () => {
    expect(resolveDisplayStatus({ storedStatus: 'BREAK', lastActivity: minsAgo(30), now: NOW })).toBe('BREAK');
  });

  it('returns ONLINE when stored ONLINE and last_activity is within 3 minutes', () => {
    expect(resolveDisplayStatus({ storedStatus: 'ONLINE', lastActivity: minsAgo(3), now: NOW })).toBe('ONLINE');
  });

  it('returns IDLE just past the 3 minute boundary', () => {
    const justOver = new Date(NOW.getTime() - (3 * 60_000 + 1)).toISOString();
    expect(resolveDisplayStatus({ storedStatus: 'ONLINE', lastActivity: justOver, now: NOW })).toBe('IDLE');
  });

  it('returns IDLE at exactly 10 minutes', () => {
    expect(resolveDisplayStatus({ storedStatus: 'ONLINE', lastActivity: minsAgo(10), now: NOW })).toBe('IDLE');
  });

  it('returns DISCONNECTED just past the 10 minute boundary', () => {
    const justOver = new Date(NOW.getTime() - (10 * 60_000 + 1)).toISOString();
    expect(resolveDisplayStatus({ storedStatus: 'ONLINE', lastActivity: justOver, now: NOW })).toBe('DISCONNECTED');
  });

  it('returns OFFLINE when stored ONLINE but last_activity is null (never checked in)', () => {
    expect(resolveDisplayStatus({ storedStatus: 'ONLINE', lastActivity: null, now: NOW })).toBe('OFFLINE');
  });

  // --- Additional edge-case coverage requested in review (beyond the brief) ---

  it('returns ONLINE when last_activity is a few seconds in the future (clock skew)', () => {
    const future = new Date(NOW.getTime() + 5_000).toISOString();
    // diffMs = now - future is negative, which is <= the 3-minute ONLINE threshold.
    // A negative diff is harmless here — it's treated the same as "very recently active".
    expect(resolveDisplayStatus({ storedStatus: 'ONLINE', lastActivity: future, now: NOW })).toBe('ONLINE');
  });

  it('returns DISCONNECTED when last_activity is an invalid date string (NaN fail-through)', () => {
    // new Date('not-a-date') is an Invalid Date, so lastActivityDate.getTime() is NaN and
    // diffMs = now.getTime() - NaN = NaN. In JS, `NaN <= x` is always false, so both the
    // ONLINE (diffMs <= 3min) and IDLE (diffMs <= 10min) comparisons fail, and execution
    // falls through to the function's final unconditional `return 'DISCONNECTED'`.
    expect(resolveDisplayStatus({ storedStatus: 'ONLINE', lastActivity: 'not-a-date', now: NOW })).toBe('DISCONNECTED');
  });

  it('returns DISCONNECTED for a last_activity many days in the past', () => {
    const fiveDaysAgo = new Date(NOW.getTime() - 5 * 24 * 60 * 60_000).toISOString();
    // There is no separate "very old" bucket in this design — anything past the 10-minute
    // boundary lands in the same DISCONNECTED bucket, whether it's 11 minutes or 5 days stale.
    // Asserting this explicitly documents it as intentional, not an oversight.
    expect(resolveDisplayStatus({ storedStatus: 'ONLINE', lastActivity: fiveDaysAgo, now: NOW })).toBe('DISCONNECTED');
  });

  it('has no memory between calls: the same stored status resolves differently based only on the last_activity passed in', () => {
    // resolveDisplayStatus is a stateless pure function — "recovery" from DISCONNECTED back to
    // ONLINE is nothing more than calling it again with a fresher last_activity. There is no
    // internal state carried between calls.
    const stale = minsAgo(20);
    const fresh = minsAgo(0);
    expect(resolveDisplayStatus({ storedStatus: 'ONLINE', lastActivity: stale, now: NOW })).toBe('DISCONNECTED');
    expect(resolveDisplayStatus({ storedStatus: 'ONLINE', lastActivity: fresh, now: NOW })).toBe('ONLINE');
  });

  it('exercises the OFFLINE stored-status branch directly, independent of last_activity staleness', () => {
    expect(resolveDisplayStatus({ storedStatus: 'OFFLINE', lastActivity: minsAgo(1), now: NOW })).toBe('OFFLINE');
  });

  it('exercises the BREAK stored-status branch directly, independent of last_activity staleness', () => {
    expect(resolveDisplayStatus({ storedStatus: 'BREAK', lastActivity: minsAgo(15), now: NOW })).toBe('BREAK');
  });

  it('exercises the ONLINE stored-status branch directly, falling through to timing logic', () => {
    expect(resolveDisplayStatus({ storedStatus: 'ONLINE', lastActivity: minsAgo(1), now: NOW })).toBe('ONLINE');
  });
});
