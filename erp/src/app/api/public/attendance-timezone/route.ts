import { NextResponse } from 'next/server';
import { getAttendanceTimezone } from '@/lib/attendance-timezone';

export async function GET() {
  return NextResponse.json({ timezone: await getAttendanceTimezone() });
}
