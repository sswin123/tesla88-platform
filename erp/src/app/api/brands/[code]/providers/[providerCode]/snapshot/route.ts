import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { createGamingPlatform } from '@/lib/providers';

type Params = { params: Promise<{ code: string; providerCode: string }> };

/**
 * GET /api/brands/[code]/providers/[providerCode]/snapshot
 *
 * Returns the cached RuntimeSnapshot for this brand-provider pair.
 * If no snapshot is cached, builds one from the database (DB-only, no network).
 *
 * Used by:
 *   - Overview tab (always visible)
 *   - Health tab breakdown (config/credential/adapter/games)
 *   - Connection Test button (to show pre-test state)
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code, providerCode } = await params;
  const snapshot = await createGamingPlatform().brandManager.getSnapshot(
    code.toUpperCase(),
    providerCode.toUpperCase(),
  );
  return NextResponse.json(snapshot);
}

/**
 * POST /api/brands/[code]/providers/[providerCode]/snapshot
 *
 * Forces a cache-bypassing snapshot rebuild from the database.
 * Call this after Connection Test to immediately reflect the new
 * health_status that the test wrote to brand_providers.
 *
 * Does NOT run network checks — those are done by the Connection Test endpoint.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code, providerCode } = await params;
  const upper = code.toUpperCase();
  const upperP = providerCode.toUpperCase();

  createGamingPlatform().brandManager.invalidate(upper, upperP);
  const snapshot = await createGamingPlatform().brandManager.buildSnapshot(upper, upperP);
  return NextResponse.json(snapshot);
}
