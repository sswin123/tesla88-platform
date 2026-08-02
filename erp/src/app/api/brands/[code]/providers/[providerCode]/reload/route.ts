import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { createGamingPlatform } from '@/lib/providers';
import { RuntimeMetricsStore } from '@/lib/providers/core/RuntimeMetricsStore';
import { RuntimeEventStore } from '@/lib/providers/core/RuntimeEventStore';

type Params = { params: Promise<{ code: string; providerCode: string }> };

/**
 * POST /api/brands/[code]/providers/[providerCode]/reload
 *
 * Full lifecycle reload for a brand-provider pair:
 *   1. Destroy cached adapter
 *   2. Clear cached snapshot
 *   3. Reload config from brand_provider_config (DB)
 *   4. Reload credentials from brand_provider_credentials (DB, decrypted)
 *   5. Rebuild adapter via AdapterFactory
 *   6. Compute RuntimeSnapshot (state machine, health breakdown)
 *   7. Return fresh snapshot
 *
 * This does NOT call adapter.healthCheck() — that requires a network call
 * to the provider API.  Use the Connection Test endpoint for live health checks.
 *
 * Requires game.credentials permission.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.credentials');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code, providerCode } = await params;
  const upperBrand    = code.toUpperCase();
  const upperProvider = providerCode.toUpperCase();

  const manager = createGamingPlatform().brandManager;

  // Step 1+2: Destroy adapter + clear snapshot
  manager.invalidate(upperBrand, upperProvider);

  // Steps 3–7: Reload from DB, rebuild adapter, compute snapshot
  const t0 = Date.now();
  const snapshot = await manager.buildSnapshot(upperBrand, upperProvider);
  const duration = Date.now() - t0;

  RuntimeMetricsStore.recordReload(upperBrand, upperProvider);
  RuntimeEventStore.append(
    upperBrand, upperProvider, 'RELOAD',
    snapshot.adapter_built ? 'SUCCESS' : 'FAILED',
    `Reload Adapter: state=${snapshot.state}`,
    snapshot.adapter_error,
    duration,
  );

  return NextResponse.json({
    ok:           true,
    brand:        upperBrand,
    provider:     upperProvider,
    state:        snapshot.state,
    adapter_built: snapshot.adapter_built,
    adapter_error: snapshot.adapter_error,
    snapshot,
    reloaded_at:  new Date().toISOString(),
  });
}
