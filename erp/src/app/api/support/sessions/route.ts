import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getSessions, getSessionStats } from '@/lib/repositories/support_repo';

export async function GET(request: NextRequest) {
  const payload = await requirePermission('livechat.view');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
