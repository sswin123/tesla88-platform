import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/repositories/settings_repo', () => ({ getSetting: vi.fn() }));

import { getSetting } from '@/lib/repositories/settings_repo';
import {
  getAttendanceTimezone,
  DEFAULT_ATTENDANCE_TIMEZONE,
  __resetAttendanceTimezoneCacheForTests,
} from '@/lib/attendance-timezone';

beforeEach(() => {
  vi.clearAllMocks();
  __resetAttendanceTimezoneCacheForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getAttendanceTimezone', () => {
  it('1. returns the value stored in system_settings (via the existing settings_repo.getSetting)', async () => {
    vi.mocked(getSetting).mockResolvedValueOnce('Asia/Kuala_Lumpur');
    const tz = await getAttendanceTimezone();
    expect(tz).toBe('Asia/Kuala_Lumpur');
    expect(getSetting).toHaveBeenCalledWith('timezone');
  });

  it('2. correctly returns a non-default configured value (proves it is not hardcoded)', async () => {
    vi.mocked(getSetting).mockResolvedValueOnce('Asia/Singapore');
    expect(await getAttendanceTimezone()).toBe('Asia/Singapore');
  });

  it('3. cache hit does not repeat the DB query', async () => {
    vi.mocked(getSetting).mockResolvedValueOnce('Asia/Kuala_Lumpur');
    await getAttendanceTimezone();
    await getAttendanceTimezone();
    await getAttendanceTimezone();
    expect(getSetting).toHaveBeenCalledTimes(1);
  });

  it('4. still uses the cache just before the 30s TTL boundary', async () => {
    vi.useFakeTimers();
    vi.mocked(getSetting).mockResolvedValueOnce('Asia/Kuala_Lumpur');
    await getAttendanceTimezone();
    vi.advanceTimersByTime(29_999);
    await getAttendanceTimezone();
    expect(getSetting).toHaveBeenCalledTimes(1);
  });

  it('5. re-reads the DB once the TTL has expired', async () => {
    vi.useFakeTimers();
    vi.mocked(getSetting).mockResolvedValue('Asia/Kuala_Lumpur');
    await getAttendanceTimezone();
    vi.advanceTimersByTime(30_001);
    await getAttendanceTimezone();
    expect(getSetting).toHaveBeenCalledTimes(2);
  });

  it('6. falls back to the default when the DB returns an invalid IANA timezone string', async () => {
    vi.mocked(getSetting).mockResolvedValueOnce('Not/A_Real_Zone');
    expect(await getAttendanceTimezone()).toBe(DEFAULT_ATTENDANCE_TIMEZONE);
  });

  it('7. falls back to the default when there is no timezone row at all', async () => {
    vi.mocked(getSetting).mockResolvedValueOnce(null);
    expect(await getAttendanceTimezone()).toBe(DEFAULT_ATTENDANCE_TIMEZONE);
  });

  it('8. falls back to the default on a DB error with no prior cached value (cold start)', async () => {
    vi.mocked(getSetting).mockRejectedValueOnce(new Error('db offline'));
    expect(await getAttendanceTimezone()).toBe(DEFAULT_ATTENDANCE_TIMEZONE);
  });

  it('9a. on DB error, prefers the last known-good cached value over the hardcoded default', async () => {
    vi.useFakeTimers();
    vi.mocked(getSetting).mockResolvedValueOnce('Asia/Singapore');
    await getAttendanceTimezone();
    vi.advanceTimersByTime(30_001);
    vi.mocked(getSetting).mockRejectedValueOnce(new Error('db offline'));
    expect(await getAttendanceTimezone()).toBe('Asia/Singapore');
  });

  it('9b. exactly one canonical fallback constant is used everywhere (no duplicated literal)', () => {
    expect(DEFAULT_ATTENDANCE_TIMEZONE).toBe('Asia/Kuala_Lumpur');
  });

  it('10. concurrent calls before the first DB query resolves share one in-flight request, not duplicate queries', async () => {
    let resolveQuery!: (v: string) => void;
    vi.mocked(getSetting).mockReturnValueOnce(new Promise((resolve) => { resolveQuery = resolve; }) as never);

    const p1 = getAttendanceTimezone();
    const p2 = getAttendanceTimezone();
    const p3 = getAttendanceTimezone();

    resolveQuery('Asia/Kuala_Lumpur');
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(getSetting).toHaveBeenCalledTimes(1);
    expect([r1, r2, r3]).toEqual(['Asia/Kuala_Lumpur', 'Asia/Kuala_Lumpur', 'Asia/Kuala_Lumpur']);
  });

  it('10b. after a concurrent batch resolves, the value is cached for subsequent calls', async () => {
    let resolveQuery!: (v: string) => void;
    vi.mocked(getSetting).mockReturnValueOnce(new Promise((resolve) => { resolveQuery = resolve; }) as never);

    const p1 = getAttendanceTimezone();
    const p2 = getAttendanceTimezone();
    resolveQuery('Asia/Kuala_Lumpur');
    await Promise.all([p1, p2]);

    await getAttendanceTimezone();
    expect(getSetting).toHaveBeenCalledTimes(1);
  });
});
