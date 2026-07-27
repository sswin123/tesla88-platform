import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';

/**
 * GET /api/brands
 * List all brands with provider count and linked brand_settings summary.
 * Requires game.manage permission.
 */
export async function GET() {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { rows } = await pool.query<{
    id: number;
    code: string;
    name: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    provider_count: string;
    brand_name: string | null;
  }>(
    `SELECT
       b.id,
       b.code,
       b.name,
       b.is_active,
       b.created_at,
       b.updated_at,
       COUNT(bp.id)::text AS provider_count,
       bs.brand_name
     FROM brands b
     LEFT JOIN brand_providers bp ON bp.brand_id = b.id
     LEFT JOIN brand_settings  bs ON bs.brand_id  = b.id
     GROUP BY b.id, b.code, b.name, b.is_active, b.created_at, b.updated_at, bs.brand_name
     ORDER BY b.created_at ASC`,
  );

  return NextResponse.json(
    rows.map(r => ({ ...r, provider_count: parseInt(r.provider_count, 10) })),
  );
}

/**
 * POST /api/brands
 * Create a new brand.
 * Body: { code: string, name: string }
 * Returns: { ok: true, brand: { id, code, name } }
 * Requires game.manage permission.
 */
export async function POST(req: NextRequest) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    code?: unknown;
    name?: unknown;
  };

  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';

  if (!code || !/^[A-Z0-9_]{2,30}$/.test(code)) {
    return NextResponse.json(
      { error: 'code must be 2-30 uppercase letters, digits, or underscores' },
      { status: 400 },
    );
  }
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const { rows: existing } = await pool.query(
    `SELECT id FROM brands WHERE code = $1`,
    [code],
  );
  if (existing.length > 0) {
    return NextResponse.json(
      { error: `Brand code "${code}" already exists` },
      { status: 409 },
    );
  }

  const { rows } = await pool.query<{ id: number; code: string; name: string }>(
    `INSERT INTO brands (code, name) VALUES ($1, $2) RETURNING id, code, name`,
    [code, name],
  );

  return NextResponse.json({ ok: true, brand: rows[0] }, { status: 201 });
}
