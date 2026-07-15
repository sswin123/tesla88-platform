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
  try {
    const payload = await requirePermission('website.game.manage');
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const provider = await getGameProviderById(parseInt(id, 10));
    if (!provider) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(provider);
  } catch (error) {
    console.error('[GET /api/website/game-providers/[id]]', error);
    return NextResponse.json({ error: String(error), stack: (error as Error)?.stack }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const payload = await requirePermission('website.game.manage');
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const numId = parseInt(id, 10);

    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

    const old = await getGameProviderById(numId);
    if (!old) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const updated = await updateGameProvider(numId, body as Parameters<typeof updateGameProvider>[1]);
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    try {
      await logAudit({
        admin_id:    payload.sub,
        action:      'GAME_PROVIDER_UPDATE',
        target_type: 'website_game_provider',
        target_id:   numId,
        old_value:   { provider_name: old.provider_name, is_active: old.is_active },
        new_value:   body,
      });
    } catch (auditErr) {
      console.warn('[PATCH /api/website/game-providers/[id]] audit log failed (non-fatal):', auditErr);
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[PATCH /api/website/game-providers/[id]]', error);
    return NextResponse.json({ error: String(error), stack: (error as Error)?.stack }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const payload = await requirePermission('website.game.manage');
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const numId = parseInt(id, 10);

    const old = await getGameProviderById(numId);
    if (!old) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const deleted = await deleteGameProvider(numId);
    if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    try {
      await logAudit({
        admin_id:    payload.sub,
        action:      'GAME_PROVIDER_DELETE',
        target_type: 'website_game_provider',
        target_id:   numId,
        old_value:   { provider_name: old.provider_name },
        new_value:   null,
      });
    } catch (auditErr) {
      console.warn('[DELETE /api/website/game-providers/[id]] audit log failed (non-fatal):', auditErr);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[DELETE /api/website/game-providers/[id]]', error);
    return NextResponse.json({ error: String(error), stack: (error as Error)?.stack }, { status: 500 });
  }
}
