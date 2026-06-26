import { getTagsForUser, assignTagToUser, removeTagFromUser, getSessionUserId } from '@/lib/repositories/support_repo';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getSessionUserId(Number(id));
  if (!userId) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  const tags = await getTagsForUser(userId);
  return NextResponse.json(tags);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const userId = await getSessionUserId(Number(id));
  if (!userId) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const body = await req.json().catch(() => ({})) as { tag_id?: number };
  if (!body.tag_id) return NextResponse.json({ error: 'tag_id required' }, { status: 400 });

  await assignTagToUser({ user_id: userId, tag_id: body.tag_id, assigned_by: payload.username });
  const tags = await getTagsForUser(userId);
  return NextResponse.json(tags);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const userId = await getSessionUserId(Number(id));
  if (!userId) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const body = await req.json().catch(() => ({})) as { tag_id?: number };
  if (!body.tag_id) return NextResponse.json({ error: 'tag_id required' }, { status: 400 });

  await removeTagFromUser(userId, body.tag_id);
  const tags = await getTagsForUser(userId);
  return NextResponse.json(tags);
}
