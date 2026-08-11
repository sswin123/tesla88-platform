import { getSetting } from '@/lib/repositories/settings_repo';

/**
 * The single canonical fallback — never duplicate this literal elsewhere.
 * Used when system_settings has no timezone row, an invalid value, or the
 * DB is unreachable and there is no prior cached value to fall back to.
 */
export const DEFAULT_ATTENDANCE_TIMEZONE = 'Asia/Kuala_Lumpur';

const CACHE_TTL_MS = 30_000;

let cachedValue: string | null = null;
let cachedAt = 0;
let inFlight: Promise<string> | null = null;

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

async function fetchTimezoneFromDb(): Promise<string | null> {
  try {
    const value = await getSetting('timezone');
    if (value && isValidTimezone(value)) return value;
    return null;
  } catch {
    return null;
  }
}

/**
 * Single entry point for "what timezone does Attendance use" (Phase 2
 * spec §8). Reads the "timezone" key via the existing generic
 * settings_repo.ts (getSetting) rather than querying system_settings
 * directly — that repository already existed (since 2026-06-26) and was
 * missed in Phase 2's initial discovery pass; reusing it here avoids a
 * second, duplicate system_settings access pattern. 30s in-process TTL
 * cache mirrors permission_engine.ts's exact pattern. Concurrent calls
 * while a refresh is in flight share one pending DB query rather than
 * firing duplicates. On any failure (missing row, invalid IANA string,
 * DB error) this prefers the last known-good cached value over the
 * hardcoded default, so a transient DB blip doesn't discard a timezone
 * that was working moments ago; only a cold start with no prior cache
 * falls all the way back to DEFAULT_ATTENDANCE_TIMEZONE.
 *
 * Attendance code must never read the "timezone" setting any other way —
 * always through this function.
 */
export async function getAttendanceTimezone(): Promise<string> {
  const now = Date.now();
  if (cachedValue && now - cachedAt < CACHE_TTL_MS) return cachedValue;
  if (inFlight) return inFlight;

  inFlight = fetchTimezoneFromDb().then((value) => {
    cachedValue = value ?? cachedValue ?? DEFAULT_ATTENDANCE_TIMEZONE;
    cachedAt = Date.now();
    inFlight = null;
    return cachedValue;
  });
  return inFlight;
}

/** Test-only escape hatch — production code never calls this. */
export function __resetAttendanceTimezoneCacheForTests(): void {
  cachedValue = null;
  cachedAt = 0;
  inFlight = null;
}
