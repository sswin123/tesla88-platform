import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import {
  getQuickReplies,
  getAllQuickRepliesAdmin,
  getQuickReplyCategories,
  createQuickReply,
} from '@/lib/repositories/support_repo';
import type { QuickReplyContentType } from '@/lib/types';

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  const adminUsername = payload?.username ?? '';

  // ?admin=1 → return all replies (active + inactive) for the settings page
  const isAdmin = req.nextUrl.searchParams.get('admin') === '1';
  const [replies, categories] = await Promise.all([
    isAdmin ? getAllQuickRepliesAdmin() : getQuickReplies(adminUsername),
    getQuickReplyCategories(),
  ]);
  return NextResponse.json({ replies, categories });
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    title?: string;
    body?: string;
    category_id?: number | null;
    content_type?: string;
    media_id?: number | null;
    caption?: string | null;
    sort_order?: number;
  };

  const title = (body.title ?? '').trim();
  const text  = (body.body  ?? '').trim();
  const contentType = (body.content_type ?? 'TEXT').toUpperCase() as QuickReplyContentType;

  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
  if (contentType === 'TEXT' && !text) {
    return NextResponse.json({ error: 'body required for TEXT type' }, { status: 400 });
  }

  const reply = await createQuickReply({
    category_id:  body.category_id ?? null,
    title,
    body:         text,
    caption:      body.caption ?? null,
    content_type: contentType,
    media_id:     body.media_id ?? null,
    sort_order:   body.sort_order ?? 0,
    created_by:   payload.username,
  });
  return NextResponse.json({ reply }, { status: 201 });
}
