import { getAllTags, createTag } from '@/lib/repositories/support_repo';
import { requirePermission } from '@/lib/require_permission';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  const authPayload = await requirePermission('livechat.view');
  if (!authPayload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tags = await getAllTags();
  return NextResponse.json(tags);
}

export async function POST(req: NextRequest) {
  const payload = await requirePermission('livechat.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { name?: string; color?: string };
  if (!body.name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const tag = await createTag({ name: body.name.trim(), color: body.color ?? '#6B7280' });
  return NextResponse.json(tag, { status: 201 });
}
