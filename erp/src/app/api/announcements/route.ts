import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getAnnouncements, createAnnouncement } from '@/lib/repositories/announcement_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const status = searchParams.get('status') ?? undefined;
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = 20;
  const offset = (page - 1) * limit;

  const result = await getAnnouncements({ status, limit, offset });
  return NextResponse.json({ ...result, page, limit });
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    title?: string;
    content?: string;
    type?: string;
    target?: string;
    target_tag_id?: number | null;
    status?: string;
    start_at?: string | null;
    end_at?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 });
  if (!body.content?.trim()) return NextResponse.json({ error: 'content required' }, { status: 400 });

  const announcement = await createAnnouncement({
    title: body.title.trim(),
    content: body.content.trim(),
    type: body.type ?? 'BANNER',
    target: body.target ?? 'ALL',
    target_tag_id: body.target_tag_id ?? null,
    status: body.status ?? 'DRAFT',
    start_at: body.start_at ?? null,
    end_at: body.end_at ?? null,
    created_by: payload.username,
  });
  logAudit({
    admin_id: payload.sub,
    action: 'ANNOUNCEMENT_CREATED',
    target_type: 'announcement',
    target_id: announcement.id,
    new_value: { title: body.title, type: body.type ?? 'BANNER', target: body.target ?? 'ALL' },
  }).catch(() => {});
  return NextResponse.json(announcement, { status: 201 });
}
