import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getSessionWithDetails, updateSessionAction, createSessionForUser, getSessionById } from '@/lib/repositories/support_repo';
import { logAudit } from '@/lib/repositories/audit_repo';
import { getSetting } from '@/lib/repositories/settings_repo';
import pool from '@/lib/db';

const BOT_RELAY_URL = process.env.BOT_RELAY_URL ?? 'http://localhost:8090';
const BOT_RELAY_AUTH_TOKEN = process.env.BOT_RELAY_AUTH_TOKEN ?? 'change_me_relay_token';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await getSessionWithDetails(parseInt(id, 10));
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    session:  data.session,
    messages: data.messages,
    member:   data.member,
    hasMore:  data.hasMore,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const action: string = body.action;
  const username: string | undefined = body.username ?? payload.username;

  const sessionId = parseInt(id, 10);

  // "New Session" creates a brand-new ACTIVE session for the same customer.
  if (action === 'new_session') {
    const existing = await getSessionById(sessionId);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (existing.user_id == null) return NextResponse.json({ error: 'Cannot create new session for guest' }, { status: 400 });
    const newSession = await createSessionForUser(existing.user_id, payload.username);
    logAudit({
      admin_id: payload.sub,
      action: 'LIVECHAT_SESSION_CREATED_MANUALLY',
      target_type: 'support_session',
      target_id: newSession.id,
      new_value: { created_from_session: sessionId, assigned_to: payload.username },
    }).catch(() => {});
    return NextResponse.json({ ok: true, session: newSession, is_new_session: true });
  }

  // Mute requires special handling with duration
  if (action === 'mute') {
    const minutes = parseInt(body.duration_minutes as string, 10);
    if (!minutes || minutes <= 0 || minutes > 1440) {
      return NextResponse.json({ error: 'duration_minutes required (1-1440)' }, { status: 400 });
    }
    const { rows } = await pool.query(
      `UPDATE support_sessions SET muted_until = NOW() + ($2 || ' minutes')::interval
       WHERE id = $1 RETURNING *`,
      [sessionId, minutes]
    );
    if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    logAudit({ admin_id: payload.sub, action: 'LIVECHAT_CUSTOMER_MUTED', target_type: 'support_session', target_id: sessionId, new_value: { duration_minutes: minutes } }).catch(() => {});
    return NextResponse.json({ ok: true, session: rows[0] });
  }

  const session = await updateSessionAction(sessionId, action, username);
  if (!session) return NextResponse.json({ error: 'Invalid action or not found' }, { status: 400 });

  // Audit logging (fire-and-forget, non-fatal)
  const auditBase = { admin_id: payload.sub, target_type: 'support_session', target_id: sessionId };
  if (action === 'close') {
    logAudit({ ...auditBase, action: 'LIVECHAT_SESSION_CLOSED', new_value: { status: 'CLOSED' } }).catch(() => {});
  } else if (action === 'reopen') {
    logAudit({
      ...auditBase,
      action: 'LIVECHAT_SESSION_REOPENED',
      old_value: { status: 'CLOSED' },
      new_value: { status: 'OPEN', assigned_to_username: null },
    }).catch(() => {});
  } else if (action === 'assign') {
    const assignedTo = body.username ?? payload.username;
    if (assignedTo === payload.username) {
      logAudit({ ...auditBase, action: 'LIVECHAT_SESSION_ASSIGNED', new_value: { to: assignedTo } }).catch(() => {});
    } else {
      logAudit({ ...auditBase, action: 'LIVECHAT_SESSION_TRANSFERRED', new_value: { to: assignedTo } }).catch(() => {});
    }
  }

  // Notify the customer on ERP-initiated close (fire-and-forget, non-fatal)
  if (action === 'close') {
    const notifySupport = await getSetting('notify_support').catch(() => null);
    if (notifySupport === 'false') return NextResponse.json({ ok: true, session });
    fetch(`${BOT_RELAY_URL}/notify_close`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${BOT_RELAY_AUTH_TOKEN}`,
      },
      body: JSON.stringify({ session_id: sessionId }),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, session });
}
