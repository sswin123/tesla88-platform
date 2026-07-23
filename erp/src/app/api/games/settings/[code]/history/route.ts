import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';

type Params = { params: Promise<{ code: string }> };

/**
 * GET /api/games/settings/[code]/history
 * Returns config version history for a provider.
 * Query params: limit (default 20, max 100)
 */
export async function GET(req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code } = await params;
  const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') ?? '20', 10)));

  const { rows: provRows } = await pool.query(
    `SELECT id FROM gp_providers WHERE code = $1 LIMIT 1`, [code.toUpperCase()],
  );
  if (!provRows[0]) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });

  const { rows } = await pool.query(
    `SELECT id, version_number, provider_status, admin_username, change_summary,
            cred_keys, created_at
     FROM gp_config_history
     WHERE provider_id = $1
     ORDER BY version_number DESC
     LIMIT $2`,
    [provRows[0].id, limit],
  );

  return NextResponse.json(rows);
}
