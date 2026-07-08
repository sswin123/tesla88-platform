import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getBotMessageHistory } from '@/lib/repositories/bot_messages_repo';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const payload = await requirePermission('bot.messages');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { key } = await params;
  const language = request.nextUrl.searchParams.get('language') ?? undefined;
  const history = await getBotMessageHistory(key, language);
  return NextResponse.json({ history });
}
