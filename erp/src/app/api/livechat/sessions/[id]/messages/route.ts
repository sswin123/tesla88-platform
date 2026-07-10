import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getMoreMessages, getNewMessages, getQuickReplyById } from '@/lib/repositories/support_repo';
import { logAudit } from '@/lib/repositories/audit_repo';
import pool from '@/lib/db';

const BOT_RELAY_URL = process.env.BOT_RELAY_URL ?? 'http://localhost:8090';
const BOT_RELAY_AUTH_TOKEN = process.env.BOT_RELAY_AUTH_TOKEN ?? 'change_me_relay_token';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const afterId = req.nextUrl.searchParams.get('after_id');
  if (afterId !== null) {
    const messages = await getNewMessages(parseInt(id, 10), parseInt(afterId, 10));
    return NextResponse.json({ messages });
  }
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
    file_name?: string;
    file_size?: number;
    quick_reply_id?: number;
    quick_reply_used?: boolean;
    reply_to_message_id?: number;
  };

  let messageType = body.message_type ?? 'TEXT';
  let content     = body.content ?? null;
  let caption     = body.caption ?? null;
  let fileName    = body.file_name ?? null;
  const fileSize  = body.file_size ?? null;
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
    fileName = null; // quick replies use managed file_id, no original filename
  }

  if (!content) return NextResponse.json({ error: 'content required' }, { status: 400 });

  // Reply-to lookup
  let replyToMsgId: number | null = body.reply_to_message_id ?? null;
  let telegramReplyToMsgId: number | null = null;
  let replyToContent: string | null = null;
  let replyToSenderType: string | null = null;

  if (replyToMsgId) {
    const { rows } = await pool.query<{
      content: string | null;
      message_type: string;
      file_name: string | null;
      user_msg_id: number | null;
      sender_type: string;
    }>(
      `SELECT content, message_type, file_name, user_msg_id, sender_type
       FROM support_messages WHERE id = $1 AND session_id = $2`,
      [replyToMsgId, sessionId]
    );
    const orig = rows[0];
    if (orig) {
      telegramReplyToMsgId = orig.user_msg_id;
      replyToSenderType = orig.sender_type;
      if (orig.message_type === 'TEXT') {
        replyToContent = (orig.content ?? '').slice(0, 200);
      } else if (orig.message_type === 'PHOTO') {
        replyToContent = '📷 Photo';
      } else if (orig.message_type === 'VIDEO') {
        replyToContent = '🎥 Video';
      } else if (orig.message_type === 'AUDIO') {
        replyToContent = '🎵 Audio';
      } else {
        replyToContent = orig.file_name ?? `[${orig.message_type}]`;
      }
    }
  }

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
        session_id:               sessionId,
        message_type:             messageType,
        content,
        caption,
        file_name:                fileName,
        file_size:                fileSize,
        agent_username:           payload.username ?? null,
        reply_to_message_id:      replyToMsgId,
        reply_to_content:         replyToContent,
        reply_to_sender_type:     replyToSenderType,
        telegram_reply_to_msg_id: telegramReplyToMsgId,
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

  // Media-specific audit actions
  let auditAction = 'LIVECHAT_MESSAGE_SENT';
  if (quickReplyUsed) {
    auditAction = 'QUICK_REPLY_SENT';
  } else if (messageType === 'PHOTO') {
    auditAction = 'IMAGE_SENT';
  } else if (messageType === 'VIDEO') {
    auditAction = 'VIDEO_SENT';
  } else if (messageType === 'DOCUMENT') {
    auditAction = 'DOCUMENT_SENT';
  } else if (['AUDIO', 'VOICE'].includes(messageType)) {
    auditAction = 'AUDIO_SENT';
  }

  logAudit({
    admin_id:    payload.sub,
    action:      auditAction,
    target_type: 'support_session',
    target_id:   sessionId,
    new_value:   {
      message_type: messageType,
      ...(quickReplyUsed ? { quick_reply_used: true } : {}),
      ...(fileName ? { file_name: fileName } : {}),
      ...(fileSize ? { file_size: fileSize } : {}),
    },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    message: {
      id:                   (relayData as { message_id?: number }).message_id,
      session_id:           sessionId,
      sender_type:          'AGENT',
      message_type:         (relayData as { message_type?: string }).message_type ?? messageType,
      content:              (relayData as { content?: string }).content ?? content,
      caption,
      file_name:            fileName,
      file_size:            fileSize,
      reply_to_message_id:  replyToMsgId,
      reply_to_content:     replyToContent,
      reply_to_sender_type: replyToSenderType,
      status:               'SENT',
      created_at:           (relayData as { created_at?: string }).created_at,
      user_msg_id:          null,
      group_msg_id:         null,
    },
  });
}
