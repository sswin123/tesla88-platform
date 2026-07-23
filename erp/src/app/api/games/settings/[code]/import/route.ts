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

interface ImportPayload {
  config?: Record<string, string>;
  provider?: { display_name?: string; environment?: string; version?: string };
}

/**
 * POST /api/games/settings/[code]/import
 * Imports provider config from a JSON file (format as produced by /export).
 * Only gp_config rows are updated — credential values cannot be imported.
 * Requires game.credentials.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.credentials');
  if (!payload) {
    return NextResponse.json({ error: 'Import requires game.credentials permission' }, { status: 401 });
  }

  const { code } = await params;
  const upperCode = code.toUpperCase();
  const ip = getIp(req);

  let body: ImportPayload;
  try {
    body = await req.json() as ImportPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.config || typeof body.config !== 'object') {
    return NextResponse.json({ error: 'config object is required in JSON' }, { status: 400 });
  }

  const { rows: provRows } = await pool.query<{ id: number; status: string }>(
    `SELECT id, status FROM gp_providers WHERE code = $1 LIMIT 1`, [upperCode],
  );
  if (!provRows[0]) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
  const { id: providerId, status: currentStatus } = provRows[0];

  // Upsert each config key
  const updatedKeys: string[] = [];
  for (const [key, value] of Object.entries(body.config)) {
    if (typeof key !== 'string' || typeof value !== 'string') continue;
    await pool.query(
      `INSERT INTO gp_config (provider_id, key, value, updated_by, updated_by_name)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (provider_id, key) DO UPDATE
         SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by,
             updated_by_name = EXCLUDED.updated_by_name, updated_at = NOW()`,
      [providerId, key, value, payload.sub, payload.username],
    );
    updatedKeys.push(key);
  }

  // Optional: update provider meta fields (non-critical)
  if (body.provider?.display_name || body.provider?.environment || body.provider?.version) {
    const sets: string[] = [];
    const vals: string[] = [];
    let idx = 2;
    if (body.provider.display_name) { sets.push(`display_name = $${idx++}`); vals.push(body.provider.display_name); }
    if (body.provider.environment)  { sets.push(`environment = $${idx++}`);  vals.push(body.provider.environment); }
    if (body.provider.version)      { sets.push(`version = $${idx++}`);      vals.push(body.provider.version); }
    if (sets.length) {
      await pool.query(
        `UPDATE gp_providers SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`,
        [providerId, ...vals],
      );
    }
  }

  // Audit
  await pool.query(
    `INSERT INTO gp_config_audit_log
       (provider_id, provider_code, admin_id, admin_username, action, ip_address, notes)
     VALUES ($1,$2,$3,$4,'IMPORT',$5,$6)`,
    [providerId, upperCode, payload.sub, payload.username, ip, `Imported ${updatedKeys.length} config keys`],
  );

  // Take history snapshot
  const { rows: cfgRows } = await pool.query<{ key: string; value: string }>(
    `SELECT key, value FROM gp_config WHERE provider_id = $1`, [providerId],
  );
  const configSnapshot: Record<string, string> = {};
  for (const r of cfgRows) configSnapshot[r.key] = r.value;

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
      providerId, nextVersion, JSON.stringify(configSnapshot), currentStatus,
      payload.sub, payload.username, `IMPORT: ${updatedKeys.length} config keys updated`,
    ],
  );

  return NextResponse.json({
    ok: true,
    keys_imported: updatedKeys.length,
    keys: updatedKeys,
    note: 'Credentials were NOT imported. Re-enter credentials separately.',
  });
}
