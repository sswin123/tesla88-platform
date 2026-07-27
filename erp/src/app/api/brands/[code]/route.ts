import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';

type Params = { params: Promise<{ code: string }> };

/**
 * GET /api/brands/[code]
 * Returns brand details, linked brand_settings summary, and brand_providers list.
 * Requires game.manage permission.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code } = await params;
  const upperCode = code.toUpperCase();

  const { rows: brandRows } = await pool.query<{
    id: number; code: string; name: string; is_active: boolean;
    created_at: string; updated_at: string;
  }>(
    `SELECT id, code, name, is_active, created_at, updated_at
     FROM brands WHERE code = $1`,
    [upperCode],
  );
  if (!brandRows[0]) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  }
  const brand = brandRows[0];

  // Linked brand_settings (profile / website config summary)
  const { rows: settingsRows } = await pool.query<{
    id: number; brand_name: string; company_name: string; logo_media_id: number | null;
  }>(
    `SELECT id, brand_name, company_name, logo_media_id
     FROM brand_settings WHERE brand_id = $1 LIMIT 1`,
    [brand.id],
  );

  // Provider relationships
  const { rows: providerRows } = await pool.query<{
    id: number; provider_code: string; provider_name: string;
    status: string; wallet_type: string; environment: string;
    currency: string; health_status: string; updated_at: string;
  }>(
    `SELECT
       bp.id,
       p.code   AS provider_code,
       p.name   AS provider_name,
       bp.status,
       bp.wallet_type,
       bp.environment,
       bp.currency,
       bp.health_status,
       bp.updated_at
     FROM brand_providers bp
     JOIN gp_providers p ON p.id = bp.provider_id
     WHERE bp.brand_id = $1
     ORDER BY p.code ASC`,
    [brand.id],
  );

  return NextResponse.json({
    brand,
    settings: settingsRows[0] ?? null,
    providers: providerRows,
  });
}

/**
 * PATCH /api/brands/[code]
 * Update brand name or active status.
 * Body: { name?: string, is_active?: boolean }
 * Requires game.manage permission.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code } = await params;
  const upperCode = code.toUpperCase();

  const body = await req.json().catch(() => ({})) as {
    name?: unknown;
    is_active?: unknown;
  };

  const sets: string[] = [];
  const vals: unknown[] = [upperCode];
  let i = 2;

  if (typeof body.name === 'string') {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
    sets.push(`name = $${i++}`);
    vals.push(name);
  }

  if (typeof body.is_active === 'boolean') {
    sets.push(`is_active = $${i++}`);
    vals.push(body.is_active);
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  sets.push('updated_at = NOW()');

  const { rows } = await pool.query<{ id: number; code: string; name: string; is_active: boolean }>(
    `UPDATE brands SET ${sets.join(', ')} WHERE code = $1
     RETURNING id, code, name, is_active`,
    vals,
  );

  if (!rows[0]) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

  return NextResponse.json({ ok: true, brand: rows[0] });
}

/**
 * DELETE /api/brands/[code]
 * Delete a brand.
 * Protected: rejected if brand has any brand_providers configured.
 * Requires game.manage permission.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
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

  // Protection: cannot delete brand with configured providers
  const { rows: provRows } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM brand_providers WHERE brand_id = $1`,
    [brandId],
  );
  const providerCount = parseInt(provRows[0].cnt, 10);
  if (providerCount > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete: brand has ${providerCount} provider configuration(s). Remove all brand providers first.`,
      },
      { status: 409 },
    );
  }

  // Unlink brand_settings (set brand_id to null; do not delete the settings row)
  await pool.query(
    `UPDATE brand_settings SET brand_id = NULL WHERE brand_id = $1`,
    [brandId],
  );

  await pool.query(`DELETE FROM brands WHERE id = $1`, [brandId]);

  return NextResponse.json({ ok: true });
}
