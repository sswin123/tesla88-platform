import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';

type Params = { params: Promise<{ code: string }> };

function maskValue(val: string): string {
  if (!val) return '—';
  if (val.length <= 8) return '*'.repeat(val.length);
  return val.slice(0, 4) + '*'.repeat(val.length - 8) + val.slice(-4);
}

/**
 * Resolve (or auto-create) the brand_provider record for this provider.
 * Uses the first active brand if no record exists yet.
 * Returns null if no brands exist in the system.
 */
async function resolveBrandProvider(providerId: number): Promise<{
  brandProviderId: number;
  brandCode: string;
  brandId: number;
  status: string;
} | null> {
  // Check if brand_provider record already exists
  const { rows } = await pool.query<{
    bp_id: number; brand_code: string; brand_id: number; bp_status: string;
  }>(
    `SELECT bp.id AS bp_id, b.code AS brand_code, b.id AS brand_id, bp.status AS bp_status
     FROM brand_providers bp
     JOIN brands b ON b.id = bp.brand_id
     WHERE bp.provider_id = $1
     ORDER BY bp.status = 'ACTIVE' DESC, bp.id ASC
     LIMIT 1`,
    [providerId],
  );

  if (rows[0]) {
    return {
      brandProviderId: rows[0].bp_id,
      brandCode:       rows[0].brand_code,
      brandId:         rows[0].brand_id,
      status:          rows[0].bp_status,
    };
  }

  // No brand_provider record — auto-create linked to the first available brand
  const { rows: brandRows } = await pool.query<{ id: number; code: string }>(
    `SELECT id, code FROM brands ORDER BY id ASC LIMIT 1`,
  );
  if (!brandRows[0]) return null;

  const { rows: inserted } = await pool.query<{ id: number }>(
    `INSERT INTO brand_providers (brand_id, provider_id, status, wallet_type, environment, currency)
     VALUES ($1, $2, 'DISABLED', 'SEAMLESS', 'PRODUCTION', 'MYR')
     ON CONFLICT (brand_id, provider_id) DO UPDATE SET updated_at = NOW()
     RETURNING id`,
    [brandRows[0].id, providerId],
  );

  return {
    brandProviderId: inserted[0].id,
    brandCode:       brandRows[0].code,
    brandId:         brandRows[0].id,
    status:          'DISABLED',
  };
}

/**
 * GET /api/games/settings/[code]/brand-creds
 * Returns the brand_provider record, masked credentials, and config for this provider.
 * Auto-creates a brand_provider record (linked to first brand) if none exists.
 * Requires game.manage permission.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code } = await params;
  const upperCode = code.toUpperCase();

  const { rows: provRows } = await pool.query<{ id: number }>(
    `SELECT id FROM gp_providers WHERE code = $1 LIMIT 1`,
    [upperCode],
  );
  if (!provRows[0]) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
  const providerId = provRows[0].id;

  const bp = await resolveBrandProvider(providerId);
  if (!bp) return NextResponse.json({ error: 'No brands configured in the system' }, { status: 503 });

  const { rows: credRows } = await pool.query<{
    key: string; is_encrypted: boolean; updated_at: string; updated_by_name: string | null; masked_value: string;
  }>(
    `SELECT key, is_encrypted, updated_at, updated_by_name,
            CASE
              WHEN LENGTH(value) <= 8 THEN REPEAT('*', LENGTH(value))
              ELSE SUBSTRING(value,1,4) || REPEAT('*', LENGTH(value)-8) || SUBSTRING(value, LENGTH(value)-3)
            END AS masked_value
     FROM brand_provider_credentials
     WHERE brand_provider_id = $1
     ORDER BY key ASC`,
    [bp.brandProviderId],
  );

  const { rows: cfgRows } = await pool.query<{
    key: string; value: string; updated_at: string; updated_by_name: string | null;
  }>(
    `SELECT key, value, updated_at, updated_by_name
     FROM brand_provider_config
     WHERE brand_provider_id = $1
     ORDER BY key ASC`,
    [bp.brandProviderId],
  );

  return NextResponse.json({
    brand_provider_id: bp.brandProviderId,
    brand_code:        bp.brandCode,
    status:            bp.status,
    credentials:       credRows,
    config:            cfgRows,
  });
}

/**
 * PATCH /api/games/settings/[code]/brand-creds
 * Multi-mode update:
 *
 *   { type: 'credential', key, value }  — upsert a credential
 *   { type: 'config', key, value }      — upsert a config key
 *   { type: 'status', status }          — update brand_provider status
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { code } = await params;
  const upperCode = code.toUpperCase();

  const body = await req.json().catch(() => ({})) as {
    type?: 'credential' | 'config' | 'status';
    key?: string;
    value?: string;
    status?: string;
  };

  const isCredOp = body.type === 'credential';
  const perm = isCredOp ? 'game.credentials' : 'game.manage';
  const payload = await requirePermission(perm);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { rows: provRows } = await pool.query<{ id: number }>(
    `SELECT id FROM gp_providers WHERE code = $1 LIMIT 1`,
    [upperCode],
  );
  if (!provRows[0]) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
  const providerId = provRows[0].id;

  const bp = await resolveBrandProvider(providerId);
  if (!bp) return NextResponse.json({ error: 'No brands configured in the system' }, { status: 503 });

  const adminId       = payload.sub;
  const adminUsername = payload.username ?? 'unknown';
  const { brandProviderId } = bp;

  if (body.type === 'credential') {
    const key   = typeof body.key   === 'string' ? body.key.trim()   : '';
    const value = typeof body.value === 'string' ? body.value.trim() : '';
    if (!key || !value) return NextResponse.json({ error: 'key and value are required' }, { status: 400 });

    await pool.query(
      `INSERT INTO brand_provider_credentials
         (brand_provider_id, key, value, is_encrypted, updated_by, updated_by_name)
       VALUES ($1, $2, $3, FALSE, $4, $5)
       ON CONFLICT (brand_provider_id, key)
       DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by,
                     updated_by_name = EXCLUDED.updated_by_name, updated_at = NOW()`,
      [brandProviderId, key, value, adminId, adminUsername],
    );

    const maskedNew = maskValue(value);
    await pool.query(
      `INSERT INTO brand_provider_audit_log
         (brand_provider_id, brand_code, provider_code, admin_id, admin_username, action, field_key, new_value_hint, ip_address)
       VALUES ($1, $2, $3, $4, $5, 'UPDATE_BRAND_CRED', $6, $7, 'system')`,
      [brandProviderId, bp.brandCode, upperCode, adminId, adminUsername, key, maskedNew],
    ).catch(() => {/* non-fatal */});

    return NextResponse.json({ ok: true });
  }

  if (body.type === 'config') {
    const key   = typeof body.key   === 'string' ? body.key.trim()   : '';
    const value = typeof body.value === 'string' ? body.value.trim() : '';
    if (!key || value === undefined) return NextResponse.json({ error: 'key and value are required' }, { status: 400 });

    await pool.query(
      `INSERT INTO brand_provider_config
         (brand_provider_id, key, value, updated_by, updated_by_name)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (brand_provider_id, key)
       DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by,
                     updated_by_name = EXCLUDED.updated_by_name, updated_at = NOW()`,
      [brandProviderId, key, value, adminId, adminUsername],
    );
    return NextResponse.json({ ok: true });
  }

  if (body.type === 'status') {
    const VALID = ['ACTIVE', 'DISABLED', 'MAINTENANCE', 'TESTING'];
    if (!body.status || !VALID.includes(body.status)) {
      return NextResponse.json({ error: `Invalid status. Allowed: ${VALID.join(', ')}` }, { status: 400 });
    }
    await pool.query(
      `UPDATE brand_providers SET status = $1, updated_at = NOW() WHERE id = $2`,
      [body.status, brandProviderId],
    );
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'type must be credential, config, or status' }, { status: 400 });
}
