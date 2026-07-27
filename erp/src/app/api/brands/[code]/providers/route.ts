import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';

type Params = { params: Promise<{ code: string }> };

/**
 * GET /api/brands/[code]/providers
 * List all providers enabled for this brand, with credential and config key counts.
 * Requires game.manage permission.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code } = await params;
  const upperCode = code.toUpperCase();

  const { rows: brandRows } = await pool.query<{ id: number }>(
    `SELECT id FROM brands WHERE code = $1`,
    [upperCode],
  );
  if (!brandRows[0]) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  const brandId = brandRows[0].id;

  const { rows } = await pool.query<{
    id: number;
    provider_code: string;
    provider_name: string;
    provider_display_name: string;
    status: string;
    wallet_type: string;
    environment: string;
    currency: string;
    health_status: string;
    health_checked_at: string | null;
    last_success_at: string | null;
    last_failed_at: string | null;
    credential_count: string;
    config_count: string;
    updated_at: string;
  }>(
    `SELECT
       bp.id,
       p.code            AS provider_code,
       p.name            AS provider_name,
       p.display_name    AS provider_display_name,
       bp.status,
       bp.wallet_type,
       bp.environment,
       bp.currency,
       bp.health_status,
       bp.health_checked_at,
       bp.last_success_at,
       bp.last_failed_at,
       (SELECT COUNT(*) FROM brand_provider_credentials c WHERE c.brand_provider_id = bp.id)::text AS credential_count,
       (SELECT COUNT(*) FROM brand_provider_config     cf WHERE cf.brand_provider_id = bp.id)::text AS config_count,
       bp.updated_at
     FROM brand_providers bp
     JOIN gp_providers p ON p.id = bp.provider_id
     WHERE bp.brand_id = $1
     ORDER BY p.code ASC`,
    [brandId],
  );

  return NextResponse.json(
    rows.map(r => ({
      ...r,
      credential_count: parseInt(r.credential_count, 10),
      config_count: parseInt(r.config_count, 10),
    })),
  );
}

/**
 * POST /api/brands/[code]/providers
 * Enable a provider for this brand (creates brand_providers row).
 * Body: { provider_code, wallet_type?, environment?, currency? }
 * Returns: { ok: true, brand_provider: { id, provider_code } }
 * Requires game.manage permission.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code } = await params;
  const upperCode = code.toUpperCase();

  const body = await req.json().catch(() => ({})) as {
    provider_code?: unknown;
    wallet_type?: unknown;
    environment?: unknown;
    currency?: unknown;
  };

  const providerCode = typeof body.provider_code === 'string'
    ? body.provider_code.trim().toUpperCase()
    : '';

  if (!providerCode) {
    return NextResponse.json({ error: 'provider_code is required' }, { status: 400 });
  }

  // Validate wallet_type and environment
  const WALLET_TYPES = ['SEAMLESS', 'TRANSFER'] as const;
  const ENVIRONMENTS = ['PRODUCTION', 'SANDBOX'] as const;

  const walletType = body.wallet_type === 'TRANSFER' ? 'TRANSFER' : 'SEAMLESS';
  const environment = body.environment === 'SANDBOX' ? 'SANDBOX' : 'PRODUCTION';
  const currency = typeof body.currency === 'string' && body.currency.trim()
    ? body.currency.trim().toUpperCase().slice(0, 3)
    : 'MYR';

  void WALLET_TYPES; void ENVIRONMENTS; // referenced in doc only

  // Resolve brand
  const { rows: brandRows } = await pool.query<{ id: number }>(
    `SELECT id FROM brands WHERE code = $1`,
    [upperCode],
  );
  if (!brandRows[0]) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  const brandId = brandRows[0].id;

  // Resolve provider
  const { rows: provRows } = await pool.query<{ id: number }>(
    `SELECT id FROM gp_providers WHERE code = $1`,
    [providerCode],
  );
  if (!provRows[0]) {
    return NextResponse.json(
      { error: `Provider "${providerCode}" not found in Provider Registry` },
      { status: 404 },
    );
  }
  const providerId = provRows[0].id;

  // Check uniqueness
  const { rows: existing } = await pool.query(
    `SELECT id FROM brand_providers WHERE brand_id = $1 AND provider_id = $2`,
    [brandId, providerId],
  );
  if (existing.length > 0) {
    return NextResponse.json(
      { error: `Provider "${providerCode}" is already enabled for brand "${upperCode}"` },
      { status: 409 },
    );
  }

  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO brand_providers
       (brand_id, provider_id, status, wallet_type, environment, currency)
     VALUES ($1, $2, 'DISABLED', $3, $4, $5)
     RETURNING id`,
    [brandId, providerId, walletType, environment, currency],
  );

  return NextResponse.json(
    { ok: true, brand_provider: { id: rows[0].id, brand_code: upperCode, provider_code: providerCode } },
    { status: 201 },
  );
}
