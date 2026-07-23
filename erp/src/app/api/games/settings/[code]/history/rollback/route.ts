import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';

type Params = { params: Promise<{ code: string }> };

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * POST /api/games/settings/[code]/history/rollback
 * Rolls back config (non-credential) keys to a saved version snapshot.
 * Requires game.credentials.
 *
 * Body: { version_number: number }
 *
 * Only gp_config rows are restored — credentials are NOT touched for security.
 * Provider status is also NOT changed — admin must manually set it.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.credentials');
  if (!payload) {
    return NextResponse.json({ error: 'Rollback requires game.credentials permission' }, { status: 401 });
  }

  const { code } = await params;
  const upperCode = code.toUpperCase();
  const body = await req.json() as { version_number?: number };

  if (!body.version_number || isNaN(body.version_number)) {
    return NextResponse.json({ error: 'version_number is required' }, { status: 400 });
  }

  const ip = getIp(req);

  const { rows: provRows } = await pool.query<{ id: number; status: string }>(
    `SELECT id, status FROM gp_providers WHERE code = $1 LIMIT 1`, [upperCode],
  );
  if (!provRows[0]) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
  const { id: providerId, status: currentStatus } = provRows[0];

  const { rows: histRows } = await pool.query<{
    version_number: number;
    config_snapshot: Record<string, string>;
    admin_username: string;
    created_at: string;
  }>(
    `SELECT version_number, config_snapshot, admin_username, created_at
     FROM gp_config_history WHERE provider_id = $1 AND version_number = $2 LIMIT 1`,
    [providerId, body.version_number],
  );
  if (!histRows[0]) return NextResponse.json({ error: 'Version not found' }, { status: 404 });

  const snapshot = histRows[0].config_snapshot;
  const restoredKeys: string[] = [];

  for (const [key, value] of Object.entries(snapshot)) {
    await pool.query(
      `INSERT INTO gp_config (provider_id, key, value, updated_by, updated_by_name)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (provider_id, key) DO UPDATE
         SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by,
             updated_by_name = EXCLUDED.updated_by_name, updated_at = NOW()`,
      [providerId, key, value, payload.sub, payload.username],
    );
    restoredKeys.push(key);
  }

  // Audit
  await pool.query(
    `INSERT INTO gp_config_audit_log
       (provider_id, provider_code, admin_id, admin_username, action, ip_address, notes)
     VALUES ($1,$2,$3,$4,'ROLLBACK',$5,$6)`,
    [
      providerId, upperCode, payload.sub, payload.username, ip,
      `Rolled back to version ${body.version_number} (originally saved by ${histRows[0].admin_username})`,
    ],
  );

  // Take a new snapshot to record the rollback itself
  const { rows: vRows } = await pool.query<{ max: number | null }>(
    `SELECT MAX(version_number) AS max FROM gp_config_history WHERE provider_id = $1`, [providerId],
  );
  const nextVersion = (vRows[0]?.max ?? 0) + 1;
  await pool.query(
    `INSERT INTO gp_config_history
       (provider_id, version_number, config_snapshot, cred_keys, provider_status, admin_id, admin_username, change_summary)
     VALUES ($1,$2,$3,
       (SELECT COALESCE(json_agg(key), '[]'::json) FROM gp_credentials WHERE provider_id = $1),
       $4,$5,$6,$7)
     ON CONFLICT (provider_id, version_number) DO NOTHING`,
    [
      providerId, nextVersion, JSON.stringify(snapshot), currentStatus,
      payload.sub, payload.username,
      `ROLLBACK to version ${body.version_number}`,
    ],
  );

  return NextResponse.json({
    ok: true,
    rolled_back_to: body.version_number,
    keys_restored: restoredKeys.length,
    note: 'Credentials were NOT changed. Reload adapter after rollback.',
  });
}
