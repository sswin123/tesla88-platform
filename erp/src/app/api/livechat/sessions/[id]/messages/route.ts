import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getMoreMessages } from '@/lib/repositories/support_repo';

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
  const body = await req.json();
  const { message_type = 'TEXT', content } = body;

  if (!content) return NextResponse.json({ error: 'content required' }, { status: 400 });

  const relayRes = await fetch(`${BOT_RELAY_URL}/relay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${BOT_RELAY_AUTH_TOKEN}`,
    },
    body: JSON.stringify({ session_id: parseInt(id, 10), message_type, content }),
  });

  const relayData = await relayRes.json();
  if (!relayRes.ok) {
    return NextResponse.json({ error: relayData.error ?? 'Relay failed' }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    message: {
      id: relayData.message_id,
      session_id: parseInt(id, 10),
      sender_type: 'AGENT',
      message_type: relayData.message_type ?? message_type,
      content: relayData.content ?? content,
      created_at: relayData.created_at,
      user_msg_id: null,
      group_msg_id: null,
    },
  });
}
