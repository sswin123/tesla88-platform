import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';

type Params = { params: Promise<{ code: string }> };

/**
 * GET /api/games/settings/[code]/stats
 * Returns API call statistics for a provider for the last 24 hours.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code } = await params;
  const providerCode = code.toUpperCase();

  // Per-action stats for today (last 24h)
  const { rows: byAction } = await pool.query(
    `SELECT
       action,
       COUNT(*)::int                                                AS total,
       SUM(CASE WHEN status = 200 AND error_message IS NULL THEN 1 ELSE 0 END)::int AS success,
       SUM(CASE WHEN status != 200 OR error_message IS NOT NULL THEN 1 ELSE 0 END)::int AS failed,
       SUM(CASE WHEN verify_result = false THEN 1 ELSE 0 END)::int  AS invalid_sig,
       ROUND(AVG(processing_time))::int                             AS avg_ms,
       MAX(created_at)                                             AS last_seen
     FROM provider_callback_logs
     WHERE provider = $1 AND created_at >= NOW() - INTERVAL '24 hours'
     GROUP BY action
     ORDER BY action`,
    [providerCode],
  );

  // Overall totals
  const { rows: totals } = await pool.query(
    `SELECT
       COUNT(*)::int                                                AS total,
       SUM(CASE WHEN status = 200 AND error_message IS NULL THEN 1 ELSE 0 END)::int AS success,
       SUM(CASE WHEN status != 200 OR error_message IS NOT NULL THEN 1 ELSE 0 END)::int AS failed,
       SUM(CASE WHEN verify_result = false THEN 1 ELSE 0 END)::int  AS invalid_sig,
       ROUND(AVG(processing_time))::int                             AS avg_ms,
       ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY processing_time))::int AS p95_ms,
       MIN(created_at)                                             AS first_seen,
       MAX(created_at)                                             AS last_seen
     FROM provider_callback_logs
     WHERE provider = $1 AND created_at >= NOW() - INTERVAL '24 hours'`,
    [providerCode],
  );

  // Error breakdown (last 24h)
  const { rows: errors } = await pool.query(
    `SELECT error_message, COUNT(*)::int AS count
     FROM provider_callback_logs
     WHERE provider = $1 AND created_at >= NOW() - INTERVAL '24 hours'
       AND error_message IS NOT NULL
     GROUP BY error_message
     ORDER BY count DESC
     LIMIT 10`,
    [providerCode],
  );

  // Retry queue
  const { rows: retryRows } = await pool.query(
    `SELECT status, COUNT(*)::int AS count FROM gp_retry_queue
     WHERE provider = $1 GROUP BY status`,
    [providerCode],
  );

  // Last 6h hourly call volume
  const { rows: hourly } = await pool.query(
    `SELECT
       DATE_TRUNC('hour', created_at) AS hour,
       COUNT(*)::int AS total,
       SUM(CASE WHEN status = 200 AND error_message IS NULL THEN 1 ELSE 0 END)::int AS success
     FROM provider_callback_logs
     WHERE provider = $1 AND created_at >= NOW() - INTERVAL '6 hours'
     GROUP BY DATE_TRUNC('hour', created_at)
     ORDER BY hour`,
    [providerCode],
  );

  const t = totals[0] ?? {};
  const successRate = t.total > 0
    ? ((t.success / t.total) * 100).toFixed(1)
    : '0.0';

  return NextResponse.json({
    period: '24h',
    by_action: byAction,
    totals: { ...t, success_rate: parseFloat(successRate) },
    top_errors: errors,
    retry_queue: retryRows,
    hourly,
    generated_at: new Date().toISOString(),
  });
}
