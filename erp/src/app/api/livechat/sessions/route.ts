import { NextRequest, NextResponse } from 'next/server';
import { getSessionsLiveChat, getSessionStats } from '@/lib/repositories/support_repo';
import { requirePermission } from '@/lib/require_permission';

export async function GET(request: NextRequest) {
  const payload = await requirePermission('livechat.view');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = request.nextUrl;
  const status      = searchParams.get('status') ?? undefined;
  const search      = searchParams.get('search') ?? undefined;
  const assignedToMe = searchParams.get('assigned_to_me') ?? undefined;
  const unassigned  = searchParams.get('unassigned') === '1';
  const unread      = searchParams.get('unread') === '1';
  const today       = searchParams.get('today') === '1';
  const lastWeek    = searchParams.get('last_week') === '1';
  const vip         = searchParams.get('vip') === '1';
  const page        = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit       = 30;
  const offset      = (page - 1) * limit;

  const [{ sessions, total }, stats] = await Promise.all([
    getSessionsLiveChat({ status, search, assignedToMe, unassigned, unread, today, lastWeek, vip, limit, offset }),
    getSessionStats(),
  ]);

  return NextResponse.json({ sessions, total, page, limit, stats });
}
