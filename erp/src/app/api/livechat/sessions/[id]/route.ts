import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getSessionWithDetails, updateSessionAction } from '@/lib/repositories/support_repo';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await getSessionWithDetails(parseInt(id, 10));
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const hasMore = data.messages.length >= 50;
  return NextResponse.json({ ...data, hasMore });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const action: string = body.action;
  const username: string | undefined = body.username ?? payload.username;

  const session = await updateSessionAction(parseInt(id, 10), action, username);
  if (!session) return NextResponse.json({ error: 'Invalid action or not found' }, { status: 400 });

  return NextResponse.json({ ok: true, session });
}
