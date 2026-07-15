import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await pool.query(
    `SELECT g.*, p.provider_name FROM website_games g
     LEFT JOIN website_game_providers p ON p.id = g.provider_id
     WHERE g.id = $1`, [id]
  );
  if (!res.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(res.rows[0]);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  const fields: string[] = [];
  const values: unknown[] = [];
  let n = 1;

  const allowed = [
    'provider_id', 'game_code', 'game_name', 'category', 'category_id',
    'thumbnail_media_id', 'banner_media_id',
    'is_hot', 'is_new', 'is_active', 'source', 'api_provider', 'api_data', 'display_order',
  ];
  for (const key of allowed) {
    if (key in body) {
      fields.push(`${key} = $${n++}`);
      values.push(body[key]);
    }
  }
  if (fields.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const res = await pool.query(
    `UPDATE website_games SET ${fields.join(', ')} WHERE id = $${n} RETURNING *`,
    values
  );
  if (!res.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(res.rows[0]);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  await pool.query('DELETE FROM website_games WHERE id = $1', [id]);
  return NextResponse.json({ ok: true });
}
