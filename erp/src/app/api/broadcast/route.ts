import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getBroadcasts, createBroadcast } from '@/lib/repositories/broadcast_repo';
import { logAudit } from '@/lib/repositories/audit_repo';
import type { BroadcastContentType, BroadcastAudienceType, BroadcastChannel } from '@/lib/types';

const VALID_CONTENT_TYPES = new Set([
  'TEXT','IMAGE','GIF','VIDEO','AUDIO','DOCUMENT','PDF','APK','ZIP','RAR',
]);
const VALID_AUDIENCE_TYPES = new Set([
  'ALL','TAG','VIP','ACTIVE','INACTIVE','NEVER_DEPOSIT','DEPOSITED','SELECTED',
]);
const VALID_CHANNELS = new Set(['TELEGRAM', 'LIVECHAT']);

async function requireAuth(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  return token ? await verifyJWT(token) : null;
}

export async function GET(req: NextRequest) {
  const payload = await requireAuth(req);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp     = req.nextUrl.searchParams;
  const status = sp.get('status') ?? undefined;
  const page   = Math.max(1, parseInt(sp.get('page') ?? '1', 10));
  const limit  = 20;
  const offset = (page - 1) * limit;

  const result = await getBroadcasts({ status, limit, offset });
  return NextResponse.json({ ...result, page, limit });
}

export async function POST(req: NextRequest) {
  const payload = await requireAuth(req);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });

  const contentType = typeof body.content_type === 'string'
    ? body.content_type.toUpperCase()
    : 'TEXT';
  if (!VALID_CONTENT_TYPES.has(contentType))
    return NextResponse.json({ error: 'invalid content_type' }, { status: 400 });

  const audienceType = typeof body.audience_type === 'string'
    ? body.audience_type.toUpperCase()
    : 'ALL';
  if (!VALID_AUDIENCE_TYPES.has(audienceType))
    return NextResponse.json({ error: 'invalid audience_type' }, { status: 400 });

  const channels = Array.isArray(body.channels) ? (body.channels as string[]) : ['TELEGRAM'];
  if (channels.length === 0 || !channels.every(c => VALID_CHANNELS.has(c)))
    return NextResponse.json({ error: 'channels must be non-empty array of TELEGRAM|LIVECHAT' }, { status: 400 });

  const broadcast = await createBroadcast({
    title,
    content_type:      contentType as BroadcastContentType,
    body:              typeof body.body === 'string' ? body.body : '',
    caption:           typeof body.caption === 'string' ? body.caption : null,
    media_id:          typeof body.media_id === 'number' ? body.media_id : null,
    channels:          channels as BroadcastChannel[],
    audience_type:     audienceType as BroadcastAudienceType,
    audience_tag_id:   typeof body.audience_tag_id === 'number' ? body.audience_tag_id : null,
    audience_user_ids: Array.isArray(body.audience_user_ids) ? (body.audience_user_ids as number[]) : null,
    status:            'DRAFT',
    scheduled_at:      null,
  }, payload.username);

  Promise.resolve(logAudit({
    admin_id: payload.sub, action: 'BROADCAST_CREATED',
    target_type: 'broadcast', target_id: broadcast.id,
    new_value: { title, contentType, audienceType, channels },
  })).catch(() => {});

  return NextResponse.json(broadcast, { status: 201 });
}
