import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { hasMinRole } from '@/lib/permissions';
import { logAudit } from '@/lib/repositories/audit_repo';
import { updateBotButton } from '@/lib/repositories/bot_messages_repo';

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload || !hasMinRole(payload.role, 'ADMIN')) return null;
  return payload;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requireAdmin();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  let body: { label?: string; is_active?: boolean; row_order?: number; column_order?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const ok = await updateBotButton(id, body);
  if (!ok) return NextResponse.json({ error: 'Button not found or no valid fields' }, { status: 404 });

  logAudit({
    admin_id:    payload.sub,
    action:      'BOT_BUTTON_UPDATED',
    target_type: 'bot_buttons',
    target_id:   id,
    new_value:   body as Record<string, unknown>,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
