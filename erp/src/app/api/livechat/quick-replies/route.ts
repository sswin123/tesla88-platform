import { NextRequest, NextResponse } from 'next/server';
import {
  getQuickReplies,
  getAllQuickRepliesAdmin,
  getQuickReplyCategories,
  createQuickReply,
  getPinnedReplies,
  getRecentlyUsedReplies,
} from '@/lib/repositories/support_repo';
import type { QuickReplyContentType } from '@/lib/types';
import { requirePermission } from '@/lib/require_permission';

const VALID_TYPES = new Set([
  'TEXT', 'IMAGE', 'GIF', 'VIDEO', 'AUDIO', 'VOICE', 'DOCUMENT', 'PDF', 'APK', 'ZIP', 'RAR',
]);

export async function GET(req: NextRequest) {
  const payload = await requirePermission('livechat.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const adminUsername = payload.username;

  const sp = req.nextUrl.searchParams;
  const isAdmin    = sp.get('admin')    === '1';
  const isArchived = sp.get('archived') === '1';

  if (isAdmin) {
    const [replies, pinned, recent, categories] = await Promise.all([
      getAllQuickRepliesAdmin({ includeArchived: isArchived }),
      isArchived ? Promise.resolve([]) : getPinnedReplies(),
      isArchived ? Promise.resolve([]) : getRecentlyUsedReplies(20),
      getQuickReplyCategories(),
    ]);
    return NextResponse.json({ replies, pinned, recent, categories });
  }

  // ReplyBox mode — active non-archived only, with is_favorite for current user
  const [replies, categories] = await Promise.all([
    getQuickReplies(adminUsername),
    getQuickReplyCategories(),
  ]);
  return NextResponse.json({ replies, categories });
}

export async function POST(req: NextRequest) {
  const payload = await requirePermission('livechat.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });

  const contentType = (typeof body.content_type === 'string'
    ? body.content_type.toUpperCase()
    : 'TEXT') as QuickReplyContentType;
  if (!VALID_TYPES.has(contentType)) {
    return NextResponse.json({ error: `invalid content_type: ${contentType}` }, { status: 400 });
  }

  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (contentType === 'TEXT' && !text) {
    return NextResponse.json({ error: 'body required for TEXT type' }, { status: 400 });
  }

  const reply = await createQuickReply({
    category_id:  typeof body.category_id === 'number' ? body.category_id : null,
    title,
    body:         text,
    caption:      typeof body.caption === 'string' ? body.caption.trim() || null : null,
    content_type: contentType,
    media_id:     typeof body.media_id === 'number' ? body.media_id : null,
    sort_order:   typeof body.sort_order === 'number' ? body.sort_order : 0,
    created_by:   payload.username,
  });
  return NextResponse.json({ reply }, { status: 201 });
}
