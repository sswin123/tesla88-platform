import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';

/**
 * GET /api/games/settings
 * Returns all providers with quick stats (24h totals, retry queue).
 * Used by the Gaming Platform dashboard.
 */
export async function GET() {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { rows: providers } = await pool.query(
    `SELECT id, code, name, display_name, version, status, environment,
            wallet_type, health_status, health_checked_at, last_success_at,
            last_failed_at, last_reload_at, adapter_loaded, updated_at
     FROM gp_providers
     ORDER BY priority ASC, code ASC`,
  );

  // Quick 24h stats per provider
  const { rows: statRows } = await pool.query(
    `SELECT provider AS code,
            COUNT(*)::int AS total_24h,
            SUM(CASE WHEN status = 200 AND error_message IS NULL THEN 1 ELSE 0 END)::int AS success_24h,
            SUM(CASE WHEN status != 200 OR error_message IS NOT NULL THEN 1 ELSE 0 END)::int AS failed_24h,
            ROUND(AVG(processing_time))::int AS avg_ms_24h,
            MAX(created_at) AS last_callback
     FROM provider_callback_logs
     WHERE created_at >= NOW() - INTERVAL '24 hours'
     GROUP BY provider`,
  );
  const statsMap = Object.fromEntries(statRows.map(r => [r.code, r]));

  // Retry queue size per provider
  const { rows: retryRows } = await pool.query(
    `SELECT provider AS code, COUNT(*)::int AS pending
     FROM gp_retry_queue WHERE status = 'PENDING' GROUP BY provider`,
  );
  const retryMap = Object.fromEntries(retryRows.map(r => [r.code, r.pending as number]));

  const result = providers.map(p => ({
    ...p,
    stats_24h: statsMap[p.code] ?? { total_24h: 0, success_24h: 0, failed_24h: 0, avg_ms_24h: null, last_callback: null },
    retry_queue_pending: retryMap[p.code] ?? 0,
  }));

  return NextResponse.json(result);
}

/**
 * POST /api/games/settings
 * Create a new provider record in gp_providers.
 * Body: { code, name, display_name?, wallet_type?, environment?, capabilities?, priority? }
 */
export async function POST(req: NextRequest) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    code?: unknown;
    name?: unknown;
    display_name?: unknown;
    wallet_type?: unknown;
    environment?: unknown;
    capabilities?: unknown;
    priority?: unknown;
  };

  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';

  if (!code || !/^[A-Z0-9_]{2,30}$/.test(code)) {
    return NextResponse.json(
      { error: 'code must be 2-30 uppercase letters, digits, or underscores' },
      { status: 400 },
    );
  }
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const walletType = body.wallet_type === 'TRANSFER' ? 'TRANSFER' : 'SEAMLESS';
  const environment = body.environment === 'SANDBOX' ? 'SANDBOX' : 'PRODUCTION';
  const capabilities = Array.isArray(body.capabilities) ? body.capabilities as string[] : [];
  const priority = typeof body.priority === 'number' ? body.priority : 100;
  const displayName = typeof body.display_name === 'string' ? body.display_name.trim() || name : name;

  // Check uniqueness
  const { rows: existing } = await pool.query(
    `SELECT id FROM gp_providers WHERE code = $1`,
    [code],
  );
  if (existing.length > 0) {
    return NextResponse.json({ error: `Provider code "${code}" already exists` }, { status: 409 });
  }

  const { rows } = await pool.query<{ code: string }>(
    `INSERT INTO gp_providers
       (code, name, display_name, version, priority, status, environment,
        wallet_type, capabilities, metadata)
     VALUES ($1,$2,$3,'1.0.0',$4,'DISABLED',$5,$6,$7,'{}')
     RETURNING code`,
    [code, name, displayName, priority, environment, walletType, JSON.stringify(capabilities)],
  );

  return NextResponse.json({ ok: true, code: rows[0].code }, { status: 201 });
}
