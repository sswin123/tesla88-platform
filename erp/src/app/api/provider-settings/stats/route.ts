import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import pool from '@/lib/db';

async function requireSuperAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload || payload.role !== 'SUPER_ADMIN') return null;
  return payload;
}

export async function GET() {
  const payload = await requireSuperAdmin();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [summary, byProvider, recentErrors] = await Promise.all([
    // Overall 24h summary
    pool.query<{
      today_total: string; today_success: string; today_failed: string;
      today_duplicate: string; avg_ms: string; p95_ms: string;
    }>(
      `SELECT
         COUNT(*)::text                                                             AS today_total,
         COUNT(*) FILTER (WHERE verify_result = true AND error_message IS NULL)::text AS today_success,
         COUNT(*) FILTER (WHERE error_message IS NOT NULL)::text                   AS today_failed,
         COUNT(*) FILTER (WHERE idempotent = true)::text                           AS today_duplicate,
         COALESCE(AVG(processing_time)::int, 0)::text                             AS avg_ms,
         COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY processing_time)::int, 0)::text AS p95_ms
       FROM provider_callback_logs
       WHERE created_at >= NOW() - INTERVAL '24 hours'`
    ),
    // Per-provider breakdown (last 24h)
    pool.query<{
      provider: string; total: string; success: string; failed: string;
      avg_ms: string; last_seen: string;
    }>(
      `SELECT
         provider,
         COUNT(*)::text                                                             AS total,
         COUNT(*) FILTER (WHERE verify_result = true AND error_message IS NULL)::text AS success,
         COUNT(*) FILTER (WHERE error_message IS NOT NULL)::text                   AS failed,
         COALESCE(AVG(processing_time)::int, 0)::text                             AS avg_ms,
         MAX(created_at)::text                                                     AS last_seen
       FROM provider_callback_logs
       WHERE created_at >= NOW() - INTERVAL '24 hours'
       GROUP BY provider
       ORDER BY total::int DESC`
    ),
    // Recent 20 errors
    pool.query<{
      id: string; provider: string; action: string; ip: string;
      error_message: string; created_at: string;
    }>(
      `SELECT id::text, provider, action, ip, error_message, created_at::text
       FROM provider_callback_logs
       WHERE error_message IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 20`
    ),
  ]);

  return NextResponse.json({
    summary:       summary.rows[0],
    byProvider:    byProvider.rows,
    recentErrors:  recentErrors.rows,
  });
}
