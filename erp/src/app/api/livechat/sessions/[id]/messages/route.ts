import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getMoreMessages, getQuickReplyById } from '@/lib/repositories/support_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

const BOT_RELAY_URL = process.env.BOT_RELAY_URL ?? 'http://localhost:8090';
const BOT_RELAY_AUTH_TOKEN = process.env.BOT_RELAY_AUTH_TOKEN ?? 'change_me_relay_token';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const beforeId = parseInt(req.nextUrl.searchParams.get('before_id') ?? '2147483647', 10);
  const messages = await getMoreMessages(parseInt(id, 10), beforeId);
  return NextResponse.json({ messages });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sessionId = parseInt(id, 10);

  const body = await req.json() as {
    message_type?: string;
    content?: string;
    caption?: string;
    quick_reply_id?: number;
    quick_reply_used?: boolean;
  };

  let messageType = body.message_type ?? 'TEXT';
  let content     = body.content ?? null;
  let caption     = body.caption ?? null;
  const quickReplyUsed = body.quick_reply_used ?? false;

  // ── Quick-reply shortcut: server fetches media_content so the browser
  //    never needs to receive the (potentially large) data URI. ──────────────
  if (body.quick_reply_id) {
    const qr = await getQuickReplyById(body.quick_reply_id);
    if (!qr) return NextResponse.json({ error: 'Quick reply not found' }, { status: 404 });
    if (!qr.is_active) return NextResponse.json({ error: 'Quick reply is disabled' }, { status: 400 });

    messageType = qr.content_type;
    if (qr.content_type === 'TEXT') {
      content = qr.body;
      caption = null;
    } else {
      content = qr.media_content ?? '';
      caption = qr.body || null;  // body doubles as caption for media quick replies
    }
  }

  if (!content) return NextResponse.json({ error: 'content required' }, { status: 400 });

  // ── Forward to bot relay ───────────────────────────────────────────────────
  let relayRes: Response;
  try {
    relayRes = await fetch(`${BOT_RELAY_URL}/relay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${BOT_RELAY_AUTH_TOKEN}`,
      },
      body: JSON.stringify({
        session_id:     sessionId,
        message_type:   messageType,
        content,
        caption,          // forwarded; relay passes to Telegram send_* call
        agent_username: payload.username ?? null,
      }),
    });
  } catch (err) {
    console.error('[livechat relay] connection failed:', err);
    return NextResponse.json(
      { error: `Cannot reach relay server at ${BOT_RELAY_URL}` },
      { status: 502 }
    );
  }

  const relayData = await relayRes.json().catch(() => ({}));
  if (!relayRes.ok) {
    return NextResponse.json(
      { error: (relayData as { error?: string }).error ?? 'Relay failed' },
      { status: 502 }
    );
  }

  logAudit({
    admin_id:    payload.sub,
    action:      'LIVECHAT_MESSAGE_SENT',
    target_type: 'support_session',
    target_id:   sessionId,
    new_value:   quickReplyUsed
      ? { message_type: messageType, quick_reply_used: true }
      : { message_type: messageType },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    message: {
      id:           (relayData as { message_id?: number }).message_id,
      session_id:   sessionId,
      sender_type:  'AGENT',
      message_type: (relayData as { message_type?: string }).message_type ?? messageType,
      content:      (relayData as { content?: string }).content ?? content,
      caption,
      created_at:   (relayData as { created_at?: string }).created_at,
      user_msg_id:  null,
      group_msg_id: null,
    },
  });
}
