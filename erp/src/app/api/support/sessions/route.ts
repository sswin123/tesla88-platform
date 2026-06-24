import { NextRequest, NextResponse } from 'next/server';
import { getSessions, getSessionStats } from '@/lib/repositories/support_repo';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const status = searchParams.get('status') ?? undefined;
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit  = 20;
  const offset = (page - 1) * limit;

  const [{ sessions, total }, stats] = await Promise.all([
    getSessions({ status, limit, offset }),
    getSessionStats(),
  ]);

  return NextResponse.json({ sessions, total, page, limit, stats });
}
