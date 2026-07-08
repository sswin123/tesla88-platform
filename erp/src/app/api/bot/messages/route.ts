import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { listBotMessages } from '@/lib/repositories/bot_messages_repo';

export async function GET(request: NextRequest) {
  const payload = await requirePermission('bot.messages');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const category = searchParams.get('category') ?? undefined;
  const language = searchParams.get('language') ?? undefined;
  const search   = searchParams.get('search')   ?? undefined;

  const messages = await listBotMessages({ category, language, search });
  return NextResponse.json({ messages });
}
