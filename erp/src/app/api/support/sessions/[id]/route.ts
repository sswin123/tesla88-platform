import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getSessionById, getSessionMessages } from '@/lib/repositories/support_repo';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('livechat.view');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id, 10);

  const [session, messages] = await Promise.all([
    getSessionById(numId),
    getSessionMessages(numId),
  ]);

  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ session, messages });
}
