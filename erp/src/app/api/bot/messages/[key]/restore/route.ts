import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { hasMinRole } from '@/lib/permissions';
import { logAudit } from '@/lib/repositories/audit_repo';
import { restoreBotMessage } from '@/lib/repositories/bot_messages_repo';

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload || !hasMinRole(payload.role, 'ADMIN')) return null;
  return payload;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const payload = await requireAdmin();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { key } = await params;

  let body: { history_id?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.history_id) {
    return NextResponse.json({ error: 'history_id is required' }, { status: 400 });
  }

  const ok = await restoreBotMessage(key, body.history_id, payload.username);
  if (!ok) return NextResponse.json({ error: 'History record not found' }, { status: 404 });

  logAudit({
    admin_id:    payload.sub,
    action:      'BOT_MESSAGE_RESTORED',
    target_type: 'bot_message_translations',
    old_value:   { message_key: key },
    new_value:   { history_id: body.history_id },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
