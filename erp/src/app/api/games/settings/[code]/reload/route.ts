import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';
import { resetGamingPlatform } from '@/lib/gaming';

type Params = { params: Promise<{ code: string }> };

/**
 * POST /api/games/settings/[code]/reload
 * Forces the adapter singleton to re-initialise from DB on the next request.
 * Required after any credential/config change so the running ERP process picks up new values.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code } = await params;
  if (code.toUpperCase() !== '918KISS') {
    return NextResponse.json({ error: 'Reload not supported for this provider' }, { status: 400 });
  }

  const { rows } = await pool.query(
    `SELECT id, status FROM gp_providers WHERE code = '918KISS' LIMIT 1`,
  );
  if (!rows[0]) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });

  resetGamingPlatform();

  return NextResponse.json({
    ok: true,
    message: 'Adapter singleton cleared — will re-initialise on next game request.',
    provider_status: rows[0].status,
  });
}
