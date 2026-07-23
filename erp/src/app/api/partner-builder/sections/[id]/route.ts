import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getSectionById, updateSection, deleteSection } from '@/lib/repositories/partner_repo';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await getSectionById(Number(id));
  if (!existing) return NextResponse.json({ error: 'Section not found' }, { status: 404 });

  let body: { section_type?: string; content_json?: Record<string, unknown>; sort_order?: number; is_enabled?: boolean };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  try {
    const updated = await updateSection(Number(id), body);
    return NextResponse.json(updated);
  } catch (e) {
    console.error('[partner-builder/sections/[id] PATCH]', e);
    return NextResponse.json({ error: 'Failed to update section' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await getSectionById(Number(id));
  if (!existing) return NextResponse.json({ error: 'Section not found' }, { status: 404 });

  await deleteSection(Number(id));
  return NextResponse.json({ ok: true });
}
