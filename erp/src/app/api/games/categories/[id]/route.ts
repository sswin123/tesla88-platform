import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/games/categories/[id] — update a category */
export async function PATCH(req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const catId = parseInt(id, 10);
  if (isNaN(catId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await req.json() as {
    name?: string; icon?: string | null; sort_order?: number; is_active?: boolean;
  };

  const sets: string[] = [];
  const vals: unknown[] = [catId];
  let i = 2;

  if (body.name       !== undefined) { sets.push(`name=$${i++}`);       vals.push(body.name); }
  if (body.icon       !== undefined) { sets.push(`icon=$${i++}`);       vals.push(body.icon); }
  if (body.sort_order !== undefined) { sets.push(`sort_order=$${i++}`); vals.push(body.sort_order); }
  if (body.is_active  !== undefined) { sets.push(`is_active=$${i++}`);  vals.push(body.is_active); }

  if (sets.length === 0) return NextResponse.json({ ok: true });
  sets.push('updated_at=NOW()');

  const { rowCount } = await pool.query(
    `UPDATE gp_game_categories SET ${sets.join(', ')} WHERE id = $1`,
    vals,
  );
  if (!rowCount) return NextResponse.json({ error: 'Category not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/games/categories/[id] — delete a category */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const catId = parseInt(id, 10);
  if (isNaN(catId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { rowCount } = await pool.query(
    'DELETE FROM gp_game_categories WHERE id = $1', [catId],
  );
  if (!rowCount) return NextResponse.json({ error: 'Category not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
