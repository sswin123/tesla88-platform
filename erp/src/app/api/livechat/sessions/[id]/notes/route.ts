import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getSessionNotes, createSessionNote } from '@/lib/repositories/support_repo';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const notes = await getSessionNotes(parseInt(id, 10));
  return NextResponse.json({ notes });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const text: string = (body.body ?? '').trim();
  if (!text) return NextResponse.json({ error: 'body required' }, { status: 400 });

  const note = await createSessionNote({
    session_id: parseInt(id, 10),
    author: payload.username,
    body: text,
  });
  return NextResponse.json({ note }, { status: 201 });
}
