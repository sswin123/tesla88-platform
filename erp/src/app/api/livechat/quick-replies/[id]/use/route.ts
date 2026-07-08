import { NextRequest, NextResponse } from 'next/server';
import { incrementQuickReplyUsage } from '@/lib/repositories/support_repo';
import { requirePermission } from '@/lib/require_permission';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('livechat.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const replyId = parseInt(id, 10);
  if (isNaN(replyId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  await incrementQuickReplyUsage(replyId, payload.username);
  return NextResponse.json({ ok: true });
}
