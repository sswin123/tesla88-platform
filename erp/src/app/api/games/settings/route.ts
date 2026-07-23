import { NextResponse } from 'next/server';
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
