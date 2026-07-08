import { NextRequest, NextResponse } from 'next/server';
import { getTimelineMessages } from '@/lib/repositories/support_repo';
import { requirePermission } from '@/lib/require_permission';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const beforeId = parseInt(req.nextUrl.searchParams.get('before_id') ?? '2147483647', 10);
  const messages = await getTimelineMessages(parseInt(userId, 10), beforeId);
  return NextResponse.json({
    messages,
    hasMore: messages.length >= 100,
  });
}
