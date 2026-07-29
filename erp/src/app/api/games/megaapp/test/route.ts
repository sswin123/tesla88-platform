// erp/src/app/api/games/megaapp/test/route.ts
//
// GET /api/games/megaapp/test?brand_code=<code>
//
// Connection test for MEGAAPP integration.
// Verifies: API URL reachable, SN recognized, secretCode digest valid.
// Does NOT require a player account — uses agentLoginId.
//
// Auth: X-Service-Secret (internal ERP use only).
import { NextRequest, NextResponse } from 'next/server';
import { createGamingPlatform } from '@/lib/providers';
import type { MegaAppAdapter } from '@/lib/providers/adapters/megaapp/MegaAppAdapter';
import pool from '@/lib/db';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || req.headers.get('x-service-secret') !== secret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const brandCode = req.nextUrl.searchParams.get('brand_code');
  if (!brandCode) {
    return NextResponse.json({ error: 'brand_code query param required' }, { status: 400 });
  }

  // Verify brand has MEGAAPP active
  const { rows: bpRows } = await pool.query<{ brand_code: string }>(
    `SELECT b.code AS brand_code
     FROM brand_providers bp
     JOIN brands b       ON b.id = bp.brand_id
     JOIN gp_providers p ON p.id = bp.provider_id
     WHERE p.code = 'MEGAAPP' AND bp.status = 'ACTIVE' AND b.code = $1
     LIMIT 1`,
    [brandCode],
  );

  if (!bpRows[0]) {
    return NextResponse.json({
      ok:    false,
      error: `Brand "${brandCode}" does not have MEGAAPP active`,
    });
  }

  let adapter: MegaAppAdapter;
  try {
    const platform = createGamingPlatform();
    adapter = await platform.brandManager.getAdapter(brandCode, 'MEGAAPP') as MegaAppAdapter;
  } catch (err) {
    return NextResponse.json({
      ok:    false,
      error: `Failed to load adapter: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  const start = Date.now();
  const result = await adapter.healthCheck();
  const elapsed = Date.now() - start;

  const ok = result.status === 'HEALTHY';
  return NextResponse.json({
    ok,
    status:     result.status,
    latency_ms: result.latency_ms ?? elapsed,
    message:    ok
      ? 'MEGA API reachable — API URL, SN, and secretCode verified'
      : (result.error_message ?? 'Connection check failed'),
  });
}
