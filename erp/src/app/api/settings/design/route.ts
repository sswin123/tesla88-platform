import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';
import { invalidateBrandCache } from '@/lib/brand_service';

export async function GET() {
  const payload = await requirePermission('brand.settings');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { rows } = await pool.query(`
      SELECT COALESCE(design_preset,   'classic_purple') AS design_preset,
             COALESCE(design_overrides, '{}')            AS design_overrides
      FROM brand_settings WHERE id = 1
    `);
    if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (e) {
    console.error('[design] GET error:', e);
    return NextResponse.json({ design_preset: 'classic_purple', design_overrides: {} });
  }
}

export async function PATCH(req: NextRequest) {
  const payload = await requirePermission('brand.settings');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { design_preset?: string; design_overrides?: Record<string, string> };
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (body.design_preset !== undefined) {
    sets.push(`design_preset = $${i++}`);
    vals.push(body.design_preset);
  }
  if (body.design_overrides !== undefined) {
    sets.push(`design_overrides = $${i++}`);
    vals.push(JSON.stringify(body.design_overrides));
  }
  if (sets.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  vals.push(payload.username);
  sets.push(`updated_by = $${i++}`);

  await pool.query(
    `UPDATE brand_settings SET ${sets.join(', ')}, updated_at = NOW() WHERE id = 1`,
    vals,
  );
  invalidateBrandCache();

  return NextResponse.json({ ok: true });
}
