import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';

type Params = { params: Promise<{ code: string }> };

/**
 * GET /api/games/settings/[code]
 * Returns full provider details: provider row + all config keys + credential keys (masked).
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code } = await params;

  const { rows: provRows } = await pool.query(
    `SELECT id, code, name, display_name, version, status, environment,
            wallet_type, capabilities, health_status, metadata, updated_at
     FROM gp_providers WHERE code = $1 LIMIT 1`,
    [code.toUpperCase()],
  );
  if (!provRows[0]) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });

  const provider = provRows[0];

  const { rows: cfgRows } = await pool.query(
    `SELECT key, value, updated_at FROM gp_config WHERE provider_id = $1 ORDER BY key`,
    [provider.id],
  );

  // Return credential keys and masked values (never return plaintext credentials via API)
  const { rows: credRows } = await pool.query(
    `SELECT key, is_encrypted,
            CASE
              WHEN LENGTH(value) <= 8 THEN REPEAT('*', LENGTH(value))
              ELSE SUBSTRING(value, 1, 4) || REPEAT('*', LENGTH(value) - 8) || SUBSTRING(value, LENGTH(value) - 3)
            END AS masked_value,
            updated_at
     FROM gp_credentials WHERE provider_id = $1 ORDER BY key`,
    [provider.id],
  );

  return NextResponse.json({ provider, config: cfgRows, credentials: credRows });
}

/**
 * PATCH /api/games/settings/[code]
 * Upsert a single config key or credential key.
 * Body: { type: 'config' | 'credential', key: string, value: string }
 * For credentials, optionally: { encrypt: boolean }
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code } = await params;
  const body = await req.json() as {
    type: 'config' | 'credential';
    key: string;
    value: string;
    encrypt?: boolean;
    provider_status?: 'ACTIVE' | 'DISABLED' | 'MAINTENANCE';
  };

  const { rows: provRows } = await pool.query(
    `SELECT id FROM gp_providers WHERE code = $1 LIMIT 1`,
    [code.toUpperCase()],
  );
  if (!provRows[0]) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });

  const providerId = provRows[0].id;

  // Update provider status if requested
  if (body.provider_status) {
    const allowed = ['ACTIVE', 'DISABLED', 'MAINTENANCE'];
    if (!allowed.includes(body.provider_status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    await pool.query(
      `UPDATE gp_providers SET status = $1, updated_at = NOW() WHERE id = $2`,
      [body.provider_status, providerId],
    );
    return NextResponse.json({ ok: true });
  }

  if (!body.key || body.value === undefined) {
    return NextResponse.json({ error: 'key and value are required' }, { status: 400 });
  }

  if (body.type === 'config') {
    await pool.query(
      `INSERT INTO gp_config (provider_id, key, value)
       VALUES ($1, $2, $3)
       ON CONFLICT (provider_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [providerId, body.key, body.value],
    );
  } else if (body.type === 'credential') {
    // Credentials: caller may pre-encrypt via ERP; is_encrypted flag reflects whether
    // the value is AES-256-GCM encrypted. Plaintext is acceptable for staging.
    const isEncrypted = body.encrypt === true;
    await pool.query(
      `INSERT INTO gp_credentials (provider_id, key, value, is_encrypted)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (provider_id, key) DO UPDATE
         SET value = EXCLUDED.value, is_encrypted = EXCLUDED.is_encrypted, updated_at = NOW()`,
      [providerId, body.key, body.value, isEncrypted],
    );
  } else {
    return NextResponse.json({ error: 'type must be config or credential' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
