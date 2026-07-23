import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';

type Params = { params: Promise<{ code: string }> };

/**
 * GET /api/games/settings/[code]/export
 * Exports provider config (non-secret) as JSON.
 * Credential VALUES are NEVER exported — only credential key names.
 * Requires game.credentials.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.credentials');
  if (!payload) {
    return NextResponse.json({ error: 'Export requires game.credentials permission' }, { status: 401 });
  }

  const { code } = await params;
  const upperCode = code.toUpperCase();

  const { rows: provRows } = await pool.query(
    `SELECT id, code, name, display_name, version, status, environment, wallet_type, updated_at
     FROM gp_providers WHERE code = $1 LIMIT 1`,
    [upperCode],
  );
  if (!provRows[0]) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
  const provider = provRows[0];

  const { rows: cfgRows } = await pool.query<{ key: string; value: string }>(
    `SELECT key, value FROM gp_config WHERE provider_id = $1 ORDER BY key`, [provider.id],
  );

  const { rows: credRows } = await pool.query<{ key: string; is_encrypted: boolean }>(
    `SELECT key, is_encrypted FROM gp_credentials WHERE provider_id = $1 ORDER BY key`, [provider.id],
  );

  const exportData = {
    _meta: {
      exported_at: new Date().toISOString(),
      exported_by: payload.username,
      format_version: '1.0',
      note: 'Credential VALUES are excluded for security. Only key names are exported.',
    },
    provider: {
      code:         provider.code,
      name:         provider.name,
      display_name: provider.display_name,
      version:      provider.version,
      environment:  provider.environment,
      wallet_type:  provider.wallet_type,
    },
    config: Object.fromEntries(cfgRows.map(r => [r.key, r.value])),
    credential_keys: credRows.map(r => ({ key: r.key, is_encrypted: r.is_encrypted })),
  };

  // Audit
  await pool.query(
    `INSERT INTO gp_config_audit_log
       (provider_id, provider_code, admin_id, admin_username, action, notes)
     VALUES ($1,$2,$3,$4,'EXPORT','Config exported to JSON (credentials excluded)')`,
    [provider.id, upperCode, payload.sub, payload.username],
  );

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${upperCode}_config_${Date.now()}.json"`,
    },
  });
}
