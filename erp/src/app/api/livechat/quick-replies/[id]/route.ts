import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { updateQuickReply, deleteQuickReply, toggleFavoriteQuickReply } from '@/lib/repositories/support_repo';

async function requireAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  return token ? await verifyJWT(token) : null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requireAuth();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  // Handle favorite toggle separately
  if ('is_favorite' in body) {
    await toggleFavoriteQuickReply(payload.username, parseInt(id, 10), body.is_favorite === true);
    return NextResponse.json({ ok: true });
  }

  const reply = await updateQuickReply(parseInt(id, 10), {
    category_id: body.category_id,
    title:       body.title,
    body:        body.body,
    sort_order:  body.sort_order,
  });
  if (!reply) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ reply });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  await deleteQuickReply(parseInt(id, 10));
  return NextResponse.json({ ok: true });
}
