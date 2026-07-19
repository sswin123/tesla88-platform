import { updateTag, deleteTag } from '@/lib/repositories/support_repo';
import { requirePermission } from '@/lib/require_permission';
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await requirePermission('livechat.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { name?: string; color?: string };
  const tag = await updateTag(Number(id), body);
  if (!tag) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(tag);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await requirePermission('livechat.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  await deleteTag(Number(id));
  return NextResponse.json({ ok: true });
}
