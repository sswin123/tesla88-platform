import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import {
  getAllWebsiteAnnouncements,
  createWebsiteAnnouncement,
} from '@/lib/repositories/website_announcement_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

export async function GET() {
  const payload = await requirePermission('website.announcement.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const items = await getAllWebsiteAnnouncements();
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const payload = await requirePermission('website.announcement.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    title?: string;
    message?: string;
    type?: string;
    link_url?: string | null;
    display_order?: number;
    is_active?: boolean;
    start_at?: string | null;
    end_at?: string | null;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!body.title?.trim())
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  if (!body.message?.trim())
    return NextResponse.json({ error: 'message is required' }, { status: 400 });

  const validTypes = ['info', 'promotion', 'warning'] as const;
  const type = (validTypes as readonly string[]).includes(body.type ?? '')
    ? (body.type as 'info' | 'promotion' | 'warning')
    : 'info';

  const item = await createWebsiteAnnouncement({
    title:         body.title.trim(),
    message:       body.message.trim(),
    type,
    link_url:      body.link_url ?? null,
    display_order: body.display_order ?? 0,
    is_active:     body.is_active ?? true,
    start_at:      body.start_at ?? null,
    end_at:        body.end_at ?? null,
  });

  await logAudit({
    admin_id:    payload.sub,
    action:      'ANNOUNCEMENT_CREATE',
    target_type: 'website_announcement',
    target_id:   item.id,
    new_value:   { title: item.title, type: item.type, is_active: item.is_active },
  });

  return NextResponse.json(item, { status: 201 });
}
