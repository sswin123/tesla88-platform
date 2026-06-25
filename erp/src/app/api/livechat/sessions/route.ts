import { NextRequest, NextResponse } from 'next/server';
import { getSessionsLiveChat, getSessionStats } from '@/lib/repositories/support_repo';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const status = searchParams.get('status') ?? undefined;
  const search = searchParams.get('search') ?? undefined;
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit  = 30;
  const offset = (page - 1) * limit;

  const [{ sessions, total }, stats] = await Promise.all([
    getSessionsLiveChat({ status, search, limit, offset }),
    getSessionStats(),
  ]);

  return NextResponse.json({ sessions, total, page, limit, stats });
}
