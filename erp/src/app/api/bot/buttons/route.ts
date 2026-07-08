import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { listBotButtons } from '@/lib/repositories/bot_messages_repo';

export async function GET(request: NextRequest) {
  const payload = await requirePermission('bot.messages');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const groupKey = request.nextUrl.searchParams.get('group') ?? undefined;
  const buttons = await listBotButtons(groupKey);
  return NextResponse.json({ buttons });
}
