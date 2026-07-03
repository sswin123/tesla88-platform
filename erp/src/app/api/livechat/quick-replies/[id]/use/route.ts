import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { incrementQuickReplyUsage } from '@/lib/repositories/support_repo';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const replyId = parseInt(id, 10);
  if (isNaN(replyId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  await incrementQuickReplyUsage(replyId, payload.username);
  return NextResponse.json({ ok: true });
}
