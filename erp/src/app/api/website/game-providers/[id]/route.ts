import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import {
  getGameProviderById,
  updateGameProvider,
  deleteGameProvider,
} from '@/lib/repositories/game_provider_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('website.game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const provider = await getGameProviderById(parseInt(id, 10));
  if (!provider) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(provider);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const payload = await requirePermission('website.game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id, 10);

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const old = await getGameProviderById(numId);
  if (!old) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updated = await updateGameProvider(
    numId,
    body as Parameters<typeof updateGameProvider>[1]
  );
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await logAudit({
    admin_id:    payload.sub,
    action:      'GAME_PROVIDER_UPDATE',
    target_type: 'website_game_provider',
    target_id:   numId,
    old_value:   { provider_name: old.provider_name, is_active: old.is_active },
    new_value:   body,
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('website.game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id, 10);

  const old = await getGameProviderById(numId);
  if (!old) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const deleted = await deleteGameProvider(numId);
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await logAudit({
    admin_id:    payload.sub,
    action:      'GAME_PROVIDER_DELETE',
    target_type: 'website_game_provider',
    target_id:   numId,
    old_value:   { provider_name: old.provider_name },
    new_value:   null,
  });

  return NextResponse.json({ ok: true });
}
