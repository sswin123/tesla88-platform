import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';

/**
 * GET /api/games/settings
 * Returns all providers from gp_providers with their live status.
 * Used by the Gaming Platform Settings page to list available providers.
 */
export async function GET() {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { rows } = await pool.query(
    `SELECT id, code, name, display_name, version, status, environment,
            wallet_type, health_status, updated_at
     FROM gp_providers
     ORDER BY priority ASC, code ASC`,
  );
  return NextResponse.json(rows);
}
