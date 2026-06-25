import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import {
  getQuickReplies,
  getQuickReplyCategories,
  createQuickReply,
} from '@/lib/repositories/support_repo';

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  const adminUsername = payload?.username ?? '';

  const [replies, categories] = await Promise.all([
    getQuickReplies(adminUsername),
    getQuickReplyCategories(),
  ]);
  return NextResponse.json({ replies, categories });
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const title: string = (body.title ?? '').trim();
  const text: string  = (body.body  ?? '').trim();
  if (!title || !text) return NextResponse.json({ error: 'title and body required' }, { status: 400 });

  const reply = await createQuickReply({
    category_id: body.category_id ?? null,
    title,
    body: text,
    sort_order: body.sort_order ?? 0,
    created_by: payload.username,
  });
  return NextResponse.json({ reply }, { status: 201 });
}
