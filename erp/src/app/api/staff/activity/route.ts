import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getClientIp } from '@/lib/rate-limit';
import { isValidModule, isValidPage } from '@/lib/staff-module-map';
import { getOnlineStatus, upsertOnlineStatus, logActivity } from '@/lib/repositories/staff_monitor_repo';
import { touchOpenSessionActivity } from '@/lib/repositories/staff_attendance_repo';

function parseUserAgent(ua: string): { browser: string; device: string; os: string } {
  const browser =
    /Edg\//.test(ua) ? 'Edge' :
    /Chrome\//.test(ua) ? 'Chrome' :
    /Firefox\//.test(ua) ? 'Firefox' :
    /Safari\//.test(ua) ? 'Safari' : 'Unknown';
  const os =
    /Windows/.test(ua) ? 'Windows' :
    /Mac OS X/.test(ua) ? 'macOS' :
    /Android/.test(ua) ? 'Android' :
    /iPhone|iPad/.test(ua) ? 'iOS' :
    /Linux/.test(ua) ? 'Linux' : 'Unknown';
  const device = /Mobile|Android|iPhone/.test(ua) ? 'Mobile' : 'Desktop';
  return { browser, device, os };
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { module?: string; page?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { module, page } = body;
  if (!module || !isValidModule(module)) {
    return NextResponse.json({ error: 'invalid module' }, { status: 400 });
  }
  if (!page || !isValidPage(page)) {
    return NextResponse.json({ error: 'invalid page' }, { status: 400 });
  }

  const ip = getClientIp(request);
  const ua = request.headers.get('user-agent') ?? '';
  const { browser, device, os } = parseUserAgent(ua);

  const previous = await getOnlineStatus(payload.sub);
  await upsertOnlineStatus(payload.sub, { module, page, ip, browser, device, operatingSystem: os });

  if (!previous || previous.current_module !== module || previous.current_page !== page) {
    await logActivity(payload.sub, 'PAGE_VIEW', module, page);
  }

  try {
    await touchOpenSessionActivity(payload.sub);
  } catch {
    // Best-effort — Attendance session freshness must never block the
    // Live Monitor heartbeat response (Phase 1 behavior is unaffected).
  }

  return NextResponse.json({ ok: true, status: 'ONLINE' });
}
