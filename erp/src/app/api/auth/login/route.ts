import { NextRequest, NextResponse } from 'next/server';
import {
  comparePassword,
  signJWT,
  getAdminByUsername,
  COOKIE_NAME,
  COOKIE_MAX_AGE,
} from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { getAttendanceTimezone } from '@/lib/attendance-timezone';
import { resolveAttendanceDate } from '@/lib/attendance-rules';
import { openSession, finalizeStaleOpenSessions } from '@/lib/repositories/staff_attendance_repo';
import { getEffectiveSchedule } from '@/lib/repositories/staff_schedule_repo';
import { parseUserAgent } from '@/lib/parse-user-agent';

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = rateLimit(`erp-login:${ip}`, 5, 15 * 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many login attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSecs) } }
    );
  }

  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { username, password } = body;
  if (!username || !password) {
    return NextResponse.json(
      { error: 'Username and password are required' },
      { status: 400 }
    );
  }

  let admin;
  try {
    admin = await getAdminByUsername(username);
  } catch (err) {
    console.error('[login] DB error:', err);
    return NextResponse.json({ error: 'Database connection failed' }, { status: 503 });
  }

  if (!admin || !admin.is_active) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const valid = await comparePassword(password, admin.erp_password_hash);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const token = await signJWT({
    sub: admin.id,
    username: admin.erp_username,
    role: admin.role,
  });

  // Best-effort — Attendance session tracking must never block a successful
  // login (spec §19: authentication and Attendance lifecycle are decoupled).
  try {
    await finalizeStaleOpenSessions(admin.id);
    const timezone = await getAttendanceTimezone();
    const now = new Date().toISOString();
    const attendanceDate = resolveAttendanceDate(now, timezone);

    // Task 8B: the ONLY source of schedule resolution — no Override/
    // Assignment/Template query, no overnight/weekday/grace logic here.
    // Task 13's sourceType ('OVERRIDE' | 'TEMPLATE' | 'NONE') already
    // matches openSession()'s scheduleSourceType contract exactly (fixed
    // in the Task 13 Source ID Fix), so NONE is the only case mapped.
    const effectiveSchedule = await getEffectiveSchedule(admin.id, attendanceDate);
    const scheduleSourceType = effectiveSchedule.sourceType === 'NONE' ? null : effectiveSchedule.sourceType;

    const ua = request.headers.get('user-agent') ?? '';
    const { browser, device, os } = parseUserAgent(ua);

    await openSession({
      staffId: admin.id,
      attendanceDate,
      scheduledStartAt: effectiveSchedule.scheduledStart,
      scheduledEndAt: effectiveSchedule.scheduledEnd,
      scheduleSourceType,
      scheduleSourceId: effectiveSchedule.sourceId,
      graceMinutes: effectiveSchedule.lateGraceMinutes,
      isRestDay: effectiveSchedule.isRestDay,
      loginAt: now,
      ip,
      browser,
      device,
      operatingSystem: os,
    });
  } catch (err) {
    console.error('[login] attendance lifecycle error:', err);
  }

  const response = NextResponse.json({ ok: true, role: admin.role });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
  return response;
}
