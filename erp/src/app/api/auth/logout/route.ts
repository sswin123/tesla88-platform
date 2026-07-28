import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE_NAME, verifyJWT } from '@/lib/auth';
import { setOffline, logActivity } from '@/lib/repositories/staff_monitor_repo';

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;

  if (payload) {
    try {
      await setOffline(payload.sub);
      await logActivity(payload.sub, 'LOGOUT', 'staff', 'logout');
    } catch {
      // Never block logout on a monitoring-side failure.
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(COOKIE_NAME);
  return response;
}
