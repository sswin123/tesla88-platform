import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { logAudit } from '@/lib/repositories/audit_repo';

const ALLOWED_ACTIONS = new Set([
  'LIVECHAT_QUICK_REPLY_USED',
  'LIVECHAT_TELEGRAM_ID_COPIED',
]);

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    action?: string;
    session_id?: number;
  };

  if (!body.action || !ALLOWED_ACTIONS.has(body.action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  await logAudit({
    admin_id: payload.sub,
    action: body.action,
    target_type: 'support_session',
    target_id: body.session_id ?? null,
    new_value: body.session_id ? { session_id: body.session_id } : null,
  });

  return NextResponse.json({ ok: true });
}
