import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';
import { resetGamingPlatform } from '@/lib/gaming';

type Params = { params: Promise<{ code: string }> };

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * POST /api/games/settings/[code]/reload
 * Clears the adapter singleton so the next game request re-initialises from DB.
 * Requires game.credentials (SuperAdmin only by default).
 */
export async function POST(req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.credentials');
  if (!payload) {
    return NextResponse.json(
      { error: 'Reload requires game.credentials permission' },
      { status: 401 },
    );
  }

  const { code } = await params;
  const upperCode = code.toUpperCase();
  const ip = getIp(req);

  const { rows } = await pool.query<{ id: number; status: string }>(
    `SELECT id, status FROM gp_providers WHERE code = $1 LIMIT 1`,
    [upperCode],
  );
  if (!rows[0]) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });

  const { id: providerId, status } = rows[0];

  // Mark adapter_loaded = false before reset (will be set true by next adapter init)
  await pool.query(
    `UPDATE gp_providers SET last_reload_at = NOW(), adapter_loaded = FALSE WHERE id = $1`,
    [providerId],
  );

  // Clear the singleton — adapter will rebuild on next game request
  if (upperCode === '918KISS') resetGamingPlatform();

  // Audit
  await pool.query(
    `INSERT INTO gp_config_audit_log
       (provider_id, provider_code, admin_id, admin_username, action, ip_address, notes)
     VALUES ($1,$2,$3,$4,'RELOAD',$5,'Adapter singleton reset')`,
    [providerId, upperCode, payload.sub, payload.username, ip],
  );

  return NextResponse.json({
    ok: true,
    message: 'Adapter singleton cleared. Next game request will rebuild from DB.',
    provider_status: status,
    reloaded_at: new Date().toISOString(),
  });
}
