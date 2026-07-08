import { NextRequest, NextResponse } from 'next/server';
import {
  updateQuickReply,
  archiveQuickReply,
  restoreQuickReply,
  toggleFavoriteQuickReply,
  setQuickReplyPinned,
} from '@/lib/repositories/support_repo';
import type { QuickReplyContentType } from '@/lib/types';
import { requirePermission } from '@/lib/require_permission';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('livechat.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const replyId = parseInt(id, 10);
  if (isNaN(replyId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  // Restore from archive
  if (body.restore === true) {
    await restoreQuickReply(replyId);
    return NextResponse.json({ ok: true });
  }

  // Favorite toggle (agent-scoped)
  if ('is_favorite' in body) {
    await toggleFavoriteQuickReply(payload.username, replyId, body.is_favorite === true);
    // fall through to also handle other fields if present
  }

  // Pin toggle
  if (typeof body.pinned === 'boolean') {
    await setQuickReplyPinned(replyId, body.pinned);
    // fall through to handle other fields
  }

  // Build update payload (all other fields)
  const updateData: Parameters<typeof updateQuickReply>[1] = {};
  if ('category_id'  in body) updateData.category_id  = body.category_id  as number | null;
  if ('title'        in body) updateData.title        = body.title        as string;
  if ('body'         in body) updateData.body         = body.body         as string;
  if ('caption'      in body) updateData.caption      = body.caption      as string | null;
  if ('sort_order'   in body) updateData.sort_order   = body.sort_order   as number;
  if ('is_active'    in body) updateData.is_active    = body.is_active    as boolean;
  if ('content_type' in body) updateData.content_type = body.content_type as QuickReplyContentType;
  if ('media_id'     in body) updateData.media_id     = body.media_id     as number | null;

  let reply = null;
  if (Object.keys(updateData).length > 0) {
    reply = await updateQuickReply(replyId, updateData, payload.username);
    if (!reply) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, reply });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('livechat.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const replyId = parseInt(id, 10);
  if (isNaN(replyId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  await archiveQuickReply(replyId, payload.username);
  return NextResponse.json({ ok: true });
}
