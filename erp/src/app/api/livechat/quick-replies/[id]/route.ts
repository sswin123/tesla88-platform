import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { updateQuickReply, deleteQuickReply, toggleFavoriteQuickReply } from '@/lib/repositories/support_repo';
import type { QuickReplyContentType } from '@/lib/types';

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
  const body = await req.json() as Record<string, unknown>;

  // Favorite toggle handled separately (agent-scoped, not a reply mutation)
  if ('is_favorite' in body) {
    await toggleFavoriteQuickReply(payload.username, parseInt(id, 10), body.is_favorite === true);
    return NextResponse.json({ ok: true });
  }

  const reply = await updateQuickReply(parseInt(id, 10), {
    category_id:  'category_id' in body ? (body.category_id as number | null) : undefined,
    title:        typeof body.title === 'string' ? body.title : undefined,
    body:         typeof body.body  === 'string' ? body.body  : undefined,
    caption:      'caption' in body ? (body.caption as string | null) : undefined,
    sort_order:   typeof body.sort_order === 'number' ? body.sort_order : undefined,
    is_active:    typeof body.is_active  === 'boolean' ? body.is_active : undefined,
    content_type: typeof body.content_type === 'string' ? (body.content_type as QuickReplyContentType) : undefined,
    media_id:     'media_id' in body ? (body.media_id as number | null) : undefined,
  }, payload.username);
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
