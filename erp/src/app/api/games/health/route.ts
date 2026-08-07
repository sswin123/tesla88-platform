import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import pool from '@/lib/db';
import { AdapterRegistry } from '@/lib/providers/adapters/AdapterFactory';

/**
 * GET /api/games/health
 *
 * Provider-agnostic health check. Dynamically scans all providers in
 * gp_providers (status IN ACTIVE, TESTING, MAINTENANCE) and reports:
 *
 *   - Whether the adapter is registered (AdapterRegistry)
 *   - Whether the provider has at least one active brand config
 *   - The DB-persisted health_status from gp_providers
 *
 * Infrastructure checks (DB, gp_* tables, idempotency, retry_queue) are
 * checked once and reported separately.
 *
 * This endpoint reads the last known status from the DB (fast, safe to poll).
 * Live healthCheck() calls are handled by the scheduled HealthMonitor cron.
 */
export async function GET(): Promise<NextResponse> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // ── Infrastructure checks ──────────────────────────────────────────────────

  let dbOk = false;
  let dbLatencyMs: number | undefined;
  let dbDetail: string | undefined;
  try {
    const t0 = Date.now();
    await pool.query('SELECT 1');
    dbOk = true;
    dbLatencyMs = Date.now() - t0;
  } catch (err) {
    dbDetail = String(err);
  }

  let gpTablesOk = false;
  let gpTablesDetail = '';
  try {
    const { rows } = await pool.query<{ count: string }>(`
      SELECT COUNT(*)::int AS count
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'gp_providers','gp_credentials','gp_config','gp_players',
          'gp_games','gp_health_checks','gp_retry_queue'
        )
    `);
    const found = parseInt(rows[0]?.count ?? '0', 10);
    gpTablesOk = found === 7;
    gpTablesDetail = `${found}/7 gp_* tables present`;
  } catch (err) {
    gpTablesDetail = String(err);
  }

  let idempotencyOk = false;
  try {
    await pool.query('SELECT 1 FROM provider_callback_idempotency LIMIT 1');
    idempotencyOk = true;
  } catch { /* table missing */ }

  let retryOk = false;
  let retryPending: number | undefined;
  try {
    const { rows } = await pool.query<{ pending: string }>(
      `SELECT COUNT(*)::int AS pending FROM gp_retry_queue WHERE status = 'PENDING'`,
    );
    retryOk = true;
    retryPending = parseInt(rows[0]?.pending ?? '0', 10);
  } catch { /* table missing */ }

  // ── Dynamic provider scan ──────────────────────────────────────────────────

  interface ProviderCheck {
    code:               string;
    display_name:       string;
    status:             string;
    wallet_type:        string;
    adapter_registered: boolean;
    has_brand_config:   boolean;
    health_status:      string;
    health_checked_at:  string | null;
    ok:                 boolean;
  }

  const providerChecks: ProviderCheck[] = [];

  try {
    const { rows: providers } = await pool.query<{
      code:              string;
      display_name:      string;
      status:            string;
      wallet_type:       string;
      health_status:     string;
      health_checked_at: string | null;
    }>(
      `SELECT code, display_name, status, wallet_type, health_status, health_checked_at
       FROM gp_providers
       WHERE status IN ('ACTIVE', 'TESTING', 'MAINTENANCE')
       ORDER BY code ASC`,
    );

    const { rows: brandRows } = await pool.query<{ code: string }>(
      `SELECT DISTINCT UPPER(p.code) AS code
       FROM brand_providers bp
       JOIN gp_providers p ON p.id = bp.provider_id
       WHERE bp.status IN ('ACTIVE', 'TESTING')`,
    );
    const codesWithBrand = new Set(brandRows.map(r => r.code));

    for (const p of providers) {
      const upper = p.code.toUpperCase();
      const adapterRegistered = AdapterRegistry.isRegistered(upper);
      const hasBrandConfig    = codesWithBrand.has(upper);
      const ok = adapterRegistered && hasBrandConfig && p.health_status !== 'DOWN';
      providerChecks.push({
        code:               upper,
        display_name:       p.display_name,
        status:             p.status,
        wallet_type:        p.wallet_type,
        adapter_registered: adapterRegistered,
        has_brand_config:   hasBrandConfig,
        health_status:      p.health_status,
        health_checked_at:  p.health_checked_at,
        ok,
      });
    }
  } catch { /* DB unreachable — providers list stays empty */ }

  // ── Overall status ─────────────────────────────────────────────────────────

  const criticalOk      = dbOk && gpTablesOk && idempotencyOk;
  const providersDegraded = providerChecks.some(p => !p.ok);

  const overall: 'HEALTHY' | 'DEGRADED' | 'DOWN' =
    !criticalOk         ? 'DOWN'     :
    providersDegraded   ? 'DEGRADED' :
                          'HEALTHY';

  return NextResponse.json({
    overall,
    infrastructure: {
      database:          { ok: dbOk,         latency_ms: dbLatencyMs, detail: dbDetail },
      gp_tables:         { ok: gpTablesOk,   detail: gpTablesDetail },
      idempotency_table: { ok: idempotencyOk },
      retry_queue:       { ok: retryOk,      pending: retryPending },
    },
    providers: providerChecks,
    providers_count: {
      total:    providerChecks.length,
      healthy:  providerChecks.filter(p => p.health_status === 'HEALTHY').length,
      degraded: providerChecks.filter(p => p.health_status === 'DEGRADED').length,
      down:     providerChecks.filter(p => p.health_status === 'DOWN').length,
      unknown:  providerChecks.filter(p => p.health_status === 'UNKNOWN').length,
    },
    timestamp: new Date().toISOString(),
  }, { status: overall === 'DOWN' ? 503 : 200 });
}
