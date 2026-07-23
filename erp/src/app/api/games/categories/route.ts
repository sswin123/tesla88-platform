import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';

/** GET /api/games/categories — list all categories (ordered by sort_order) */
export async function GET() {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { rows } = await pool.query(
    `SELECT id, code, name, icon, sort_order, is_active, created_at, updated_at
     FROM gp_game_categories
     ORDER BY sort_order ASC, id ASC`,
  );
  return NextResponse.json(rows);
}

/** POST /api/games/categories — create a new category */
export async function POST(req: NextRequest) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    code: string; name: string; icon?: string | null; sort_order?: number;
  };

  if (!body.code || !body.name) {
    return NextResponse.json({ error: 'code and name are required' }, { status: 400 });
  }

  const code = body.code.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const { rows } = await pool.query(
    `INSERT INTO gp_game_categories (code, name, icon, sort_order)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (code) DO NOTHING
     RETURNING id`,
    [code, body.name, body.icon ?? null, body.sort_order ?? 0],
  );

  if (!rows[0]) return NextResponse.json({ error: `Category code "${code}" already exists` }, { status: 409 });
  return NextResponse.json({ ok: true, id: rows[0].id });
}
