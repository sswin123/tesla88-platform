import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { logAudit } from '@/lib/repositories/audit_repo';
import { listBotMessages, updateBotMessage, resetBotMessage } from '@/lib/repositories/bot_messages_repo';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const payload = await requirePermission('bot.messages');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { key: messageKey } = await params;

  let body: { language_code?: string; content?: string; reset?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const languageCode = body.language_code ?? 'zh';

  if (body.reset) {
    const ok = await resetBotMessage(messageKey, languageCode, payload.username);
    if (!ok) return NextResponse.json({ error: 'Message not found' }, { status: 404 });

    logAudit({
      admin_id:    payload.sub,
      action:      'BOT_MESSAGE_RESET',
      target_type: 'bot_message_translations',
      old_value:   { message_key: messageKey, language_code: languageCode },
      new_value:   { reset_to_seed: true },
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  }

  if (!body.content || body.content.trim() === '') {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }

  // Fetch old content for audit log
  const before = await listBotMessages({ language: languageCode, search: undefined });
  const oldRow = before.find((m) => m.message_key === messageKey && m.language_code === languageCode);

  const ok = await updateBotMessage(messageKey, languageCode, body.content, payload.username);
  if (!ok) return NextResponse.json({ error: 'Message not found' }, { status: 404 });

  logAudit({
    admin_id:    payload.sub,
    action:      'BOT_MESSAGE_UPDATED',
    target_type: 'bot_message_translations',
    old_value:   { message_key: messageKey, language_code: languageCode, content: oldRow?.content ?? null },
    new_value:   { content: body.content },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
